"""Fenced, renewable jobs with durable graph reconciliation/object cleanup."""
import logging
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update

from .database import SessionLocal
from .jobs import (
    JobHeartbeat, LeaseLost, begin_cleanup, finish_cleanup, owned_job,
    queue_graph_sync, release_cleanup, remove_unreferenced,
)
from .models import Case, Evidence, EvidenceAnalysis, EvidenceCaseLink, ProcessingJob, Report
from .report_html import build_report_html
from .services import analyze_evidence, build_report_pdf, graph_service, storage

log = logging.getLogger(__name__)


class MirrorPending(RuntimeError):
    pass


def claim_job():
    with SessionLocal() as db:
        if db.get_bind().dialect.name == "sqlite":
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        stale = db.scalars(select(ProcessingJob).where(ProcessingJob.status == "running", ProcessingJob.updated_at < cutoff).with_for_update(skip_locked=True))
        for job in stale:
            job.status = "queued" if job.attempts < 3 else "failed"
            job.error, job.lease_token = "Worker lease expired.", ""
            job.updated_at = datetime.now(timezone.utc)
        db.flush()
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.status == "queued").order_by(ProcessingJob.created_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            db.commit()
            return None
        job.status, job.progress, job.error = "running", 20, ""
        job.attempts += 1
        job.lease_token = uuid4().hex
        job.updated_at = datetime.now(timezone.utc)
        claim = job.id, job.lease_token
        db.commit()
        return claim


def complete(db, job_id, token, result):
    job = owned_job(db, job_id, token)
    job.status, job.progress, job.result, job.lease_token = "succeeded", 100, result, ""
    job.updated_at = datetime.now(timezone.utc)
    db.commit()


def sync_case(db, case_id):
    if not graph_service.sync_case(db, case_id, strict=True):
        raise MirrorPending("Analysis is saved; Neo4j synchronization is pending. Retry when the graph service is ready.")


def process_analysis(db, job_id, token, evidence_id, options):
    item = db.get(Evidence, evidence_id)
    if item is None:
        raise ValueError("Evidence no longer exists.")
    previous = db.get(EvidenceAnalysis, options.get("analysisId")) if options.get("analysisId") else None
    if previous and previous.evidence_id == item.id:
        result = dict(options)
    else:
        analysis = analyze_evidence(db, item, storage.get(item.object_key))
        db.flush()
        cases = sorted({item.case_id, *db.scalars(select(EvidenceCaseLink.case_id).where(EvidenceCaseLink.evidence_id == item.id))})
        result = {"analysisId": analysis.id, "summary": analysis.summary, "graphCaseIds": cases, "graphJobIds": [queue_graph_sync(db, case_id) for case_id in cases]}
        # Persist extraction and reconciliation intents before external writes.
        # A graph failure must not erase the investigation's authoritative data.
        job = owned_job(db, job_id, token)
        job.result = result
        db.commit()
    for case_id in result["graphCaseIds"]:
        sync_case(db, case_id)
        db.commit()
    # Never overwrite a graph task claimed by another worker.
    db.execute(update(ProcessingJob).where(ProcessingJob.id.in_(result["graphJobIds"]), ProcessingJob.status.in_(("queued", "failed"))).values(status="succeeded", progress=100, error="", lease_token="", updated_at=datetime.now(timezone.utc)))
    complete(db, job_id, token, result)


def process_report(db, job_id, token, case_id, options):
    case = db.get(Case, case_id)
    if case is None:
        raise ValueError("Case no longer exists.")
    locale = options.get("locale", "en")
    report_id = "RPT-" + uuid4().hex
    key = f"exports/{case.id}/{report_id}-{locale}.pdf"
    owned_job(db, job_id, token)
    cleanup_id, cleanup_token = begin_cleanup(db, [key, key.removesuffix(".pdf") + ".html"])
    try:
        with JobHeartbeat(cleanup_id, cleanup_token):
            storage.put(key, build_report_pdf(db, case, locale), "application/pdf")
            storage.put(key.removesuffix(".pdf") + ".html", build_report_html(db, case.id, locale).encode(), "text/html")
            db.add(Report(id=report_id, case_id=case.id, locale=locale, object_key=key, created_by=options["createdBy"]))
            finish_cleanup(db, cleanup_id, cleanup_token)
            complete(db, job_id, token, {"id": report_id, "downloadUrl": f"/api/v1/reports/{report_id}/download"})
    except Exception:
        db.rollback()
        release_cleanup(cleanup_id, cleanup_token)
        raise


def process_job(job_id, token):
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        if not job or job.status != "running" or job.lease_token != token:
            raise LeaseLost("Job ownership changed.")
        kind, target, options = job.kind, job.target_id, dict(job.result or {})
        if kind == "analysis":
            process_analysis(db, job_id, token, target, options)
        elif kind == "report":
            process_report(db, job_id, token, target, options)
        elif kind == "graph_sync":
            sync_case(db, target)
            complete(db, job_id, token, {"caseId": target, "mirrored": True})
        elif kind == "storage_cleanup":
            owned_job(db, job_id, token)
            remove_unreferenced(db, storage, options.get("keys", []))
            complete(db, job_id, token, {**options, "cleaned": True})
        else:
            raise ValueError("Unsupported job kind.")


def record_failure(job_id, token, exc):
    with SessionLocal() as db:
        try:
            job = owned_job(db, job_id, token)
        except LeaseLost:
            return
        job.status, job.lease_token = "failed", ""
        # Detailed traceback is server-side only; no credentials/DB URLs in API errors.
        job.error = str(exc) if isinstance(exc, MirrorPending) else "Processing failed. Check the evidence format or retry; detailed diagnostics are available to the administrator."
        job.updated_at = datetime.now(timezone.utc)
        db.commit()


def run_once():
    claim = claim_job()
    if not claim:
        return False
    job_id, token = claim
    with JobHeartbeat(job_id, token):
        try:
            process_job(job_id, token)
        except LeaseLost:
            log.warning("Discarded stale result for job %s", job_id)
        except Exception as exc:
            record_failure(job_id, token, exc)
            log.exception("Processing job failed: %s", job_id)
    return True


def run():
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            worked = run_once()
        except Exception:
            log.exception("Worker poll failed; retrying")
            worked = False
        time.sleep(.1 if worked else 1.5)


if __name__ == "__main__":
    run()
