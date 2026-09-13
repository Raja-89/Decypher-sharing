import io
from datetime import datetime,timedelta,timezone
from uuid import uuid4
import pytest
from app.ingest import hash_file,safe_filename,validate_content
from app.config import settings
from app.database import SessionLocal
from app.models import ProcessingJob
from app.worker import run_once

def test_bounded_hashing_and_safe_filename(monkeypatch):
    monkeypatch.setattr(settings,"max_upload_bytes",10)
    with pytest.raises(ValueError):hash_file(io.BytesIO(b"x"*11))
    with pytest.raises(ValueError):hash_file(io.BytesIO())
    assert safe_filename("../../evil.txt")=="evil.txt"
    assert safe_filename("..\\folder\\safe.csv")=="safe.csv"
    validate_content(io.BytesIO(("अ"*4000).encode()),"text/plain")

def test_expired_worker_lease_is_bounded():
    # Exhausted leases are terminal, never silently left running forever.
    job_id="JOB-"+uuid4().hex
    with SessionLocal() as db:
        db.add(ProcessingJob(id=job_id,kind="analysis",target_id="missing",status="running",attempts=3,updated_at=datetime.now(timezone.utc)-timedelta(minutes=10)))
        db.commit()
    run_once()
    with SessionLocal() as db:
        job=db.get(ProcessingJob,job_id)
        assert job.status=="failed" and "lease expired" in job.error
