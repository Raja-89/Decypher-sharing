"""Renewable, fenced leases and durable cleanup using the existing job table."""
import logging
import threading
from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import uuid4

from sqlalchemy import select, update

from . import database
from .models import Evidence, ProcessingJob, Report

log = logging.getLogger(__name__)


class LeaseLost(RuntimeError):
    pass


def owned_job(db, job_id, token):
    if db.get_bind().dialect.name == "sqlite":
        connection = db.connection()
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id).with_for_update().execution_options(populate_existing=True))
    if not job or job.status != "running" or job.lease_token != token:
        raise LeaseLost("Job ownership changed; stale result was discarded.")
    return job


class JobHeartbeat:
    def __init__(self, job_id, token, interval=15):
        self.job_id, self.token, self.interval = job_id, token, interval
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self.stop.wait(self.interval):
            try:
                with database.SessionLocal() as db:
                    result = db.execute(update(ProcessingJob).where(ProcessingJob.id == self.job_id, ProcessingJob.status == "running", ProcessingJob.lease_token == self.token).values(updated_at=datetime.now(timezone.utc)))
                    db.commit()
                    if not result.rowcount:
                        return
            except Exception:
                log.warning("Heartbeat update failed for job %s", self.job_id)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stop.set()
        self.thread.join(timeout=2)


def managed_key(key):
    if not isinstance(key, str) or not key.startswith(("raw/case/", "exports/")):
        raise ValueError("Cleanup requires a managed evidence/export object key.")
    if "\\" in key or ".." in PurePosixPath(key).parts or key.endswith("/"):
        raise ValueError("Invalid cleanup object key.")
    return key


def begin_cleanup(db, keys):
    token = uuid4().hex
    job = ProcessingJob(id="JOB-" + uuid4().hex, kind="storage_cleanup", target_id="managed-objects", status="running", attempts=0, progress=20, lease_token=token, result={"keys": [managed_key(k) for k in keys]})
    db.add(job)
    db.commit()  # The cleanup intent must survive a crash before object writes.
    return job.id, token


def finish_cleanup(db, job_id, token):
    job = owned_job(db, job_id, token)
    job.status, job.progress, job.lease_token = "succeeded", 100, ""


def release_cleanup(job_id, token):
    with database.SessionLocal() as db:
        result = db.execute(update(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.status == "running", ProcessingJob.lease_token == token).values(status="queued", lease_token="", updated_at=datetime.now(timezone.utc)))
        if not result.rowcount:
            # A late writer can finish its object write after losing its lease.
            # Do not steal the new owner; add another exact-key cleanup intent.
            original = db.get(ProcessingJob, job_id)
            if original:
                db.add(ProcessingJob(id="JOB-" + uuid4().hex, kind="storage_cleanup", target_id="managed-objects", status="queued", result={"keys": original.result.get("keys", [])}))
        db.commit()


def remove_unreferenced(db, storage, keys):
    for key in keys:
        managed_key(key)
        referenced = db.scalar(select(Evidence.id).where(Evidence.object_key == key))
        report_key = key.removesuffix(".html") + ".pdf" if key.endswith(".html") else key
        referenced = referenced or db.scalar(select(Report.id).where(Report.object_key == report_key))
        if not referenced:
            storage.remove(key)


def queue_graph_sync(db, case_id):
    job = ProcessingJob(id="JOB-" + uuid4().hex, kind="graph_sync", target_id=case_id, status="queued")
    db.add(job)
    return job.id
