"""Database-backed single-job claims, bounded recovery and explicit retry."""
import logging
import time
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from sqlalchemy import select
from .config import settings
from .database import SessionLocal
from .models import Case,Evidence,ProcessingJob,Report
from .services import analyze_evidence,build_report_pdf,graph_service,storage
from .report_html import build_report_html

log=logging.getLogger(__name__)

def run_once():
    with SessionLocal() as db:
        cutoff=datetime.now(timezone.utc)-timedelta(minutes=5)
        stale=list(db.scalars(select(ProcessingJob).where(ProcessingJob.status=="running",ProcessingJob.updated_at<cutoff).with_for_update(skip_locked=True)))
        for job in stale:
            job.status="queued" if job.attempts<3 else "failed"; job.error="Worker lease expired."; job.updated_at=datetime.now(timezone.utc)
        db.commit()
        job=db.scalar(select(ProcessingJob).where(ProcessingJob.status=="queued").order_by(ProcessingJob.created_at).with_for_update(skip_locked=True).limit(1))
        if not job: return False
        job.status="running"; job.attempts+=1; job.progress=20; job.error=""; job.updated_at=datetime.now(timezone.utc); job_id=job.id; db.commit()
        try:
            if job.kind=="analysis":
                item=db.get(Evidence,job.target_id)
                if item is None: raise ValueError("Evidence no longer exists.")
                result=analyze_evidence(db,item,storage.get(item.object_key)); db.flush()
                graph_service.sync_case(db,item.case_id,strict=settings.storage_provider=="minio")
                job.result={"analysisId":result.id,"summary":result.summary}
            elif job.kind=="report":
                options=job.result or {}; case=db.get(Case,job.target_id)
                if case is None: raise ValueError("Case no longer exists.")
                report_id=f"RPT-{uuid4().hex}"; locale=options.get("locale","en"); key=f"exports/{case.id}/{report_id}-{locale}.pdf"
                storage.put(key,build_report_pdf(db,case,locale),"application/pdf")
                storage.put(key.removesuffix(".pdf")+".html",build_report_html(db,case.id,locale).encode(),"text/html")
                db.add(Report(id=report_id,case_id=case.id,locale=locale,object_key=key,created_by=options["createdBy"]))
                job.result={"id":report_id,"downloadUrl":f"/api/v1/reports/{report_id}/download"}
            else: raise ValueError("Unsupported job kind.")
            job.status="succeeded"; job.progress=100; job.updated_at=datetime.now(timezone.utc); db.commit()
        except Exception as exc:
            db.rollback(); failed=db.get(ProcessingJob,job_id)
            if failed:
                failed.status="failed"; failed.error=str(exc)[:2000]; failed.updated_at=datetime.now(timezone.utc); db.commit()
            log.exception("Processing job failed: %s",job_id)
        return True

def run():
    logging.basicConfig(level=logging.INFO)
    while True:
        try: worked=run_once()
        except Exception:
            log.exception("Worker poll failed; retrying"); worked=False
        time.sleep(.1 if worked else 1.5)

if __name__=="__main__": run()
