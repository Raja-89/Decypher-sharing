"""Repair regressions always use a disposable database and object directory."""
import time
import os
import json
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import sessionmaker

from app import database, main, seed, services, worker
from app.config import settings
from app.models import (
    Alert, Case, CustodyEvent, Evidence, EvidenceAnalysis, EvidenceCaseLink,
    ProcessingJob, RefreshToken, Report, User,
)


@pytest.fixture
def isolated(monkeypatch, tmp_path):
    postgres_url = os.getenv("REPAIR_TEST_DATABASE_URL")
    schema = "decypher_repairs_" + uuid4().hex
    schema_engine = None
    if postgres_url:
        assert postgres_url.startswith("postgresql+psycopg://")
        schema_engine = create_engine(postgres_url)
        with schema_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_engine(postgres_url, connect_args={"options": f"-c search_path={schema}"})
    else:
        engine = create_engine(f"sqlite:///{tmp_path / 'repairs.db'}", connect_args={"check_same_thread": False})
        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(settings, "storage_provider", "filesystem")
    monkeypatch.setattr(settings, "storage_path", str(tmp_path / "objects"))
    storage = services.Storage()
    for module in (database, main, worker):
        monkeypatch.setattr(module, "SessionLocal", sessions)
    monkeypatch.setattr(main, "engine", engine)
    for module in (main, seed, worker):
        monkeypatch.setattr(module, "storage", storage)
    monkeypatch.setattr(services, "storage", storage)
    monkeypatch.setattr(services.graph_service, "sync_case", lambda *args, **kwargs: True)
    monkeypatch.setattr(services.graph_service, "reset", lambda: None)
    with TestClient(main.app, raise_server_exceptions=False) as client:
        session = client.post("/api/v1/auth/login", json={"email": "admin@decypher.example", "password": seed.DEMO_PASSWORD}).json()
        yield client, sessions, storage, {"Authorization": f"Bearer {session['access_token']}"}
    engine.dispose()
    if schema_engine:
        # Only the UUID-named schema created by this fixture is removed.
        with schema_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        schema_engine.dispose()


def test_shared_evidence_and_unknown_cases_are_consistent(isolated):
    client, sessions, _, headers = isolated
    snap = client.get("/api/v1/cases/CASE-X007/snapshot", headers=headers).json()
    evidence = client.get("/api/v1/evidence?case_id=CASE-X007", headers=headers).json()
    graph = client.get("/api/v1/cases/CASE-X007/graph", headers=headers).json()
    assert {e["id"] for e in evidence} == {e["id"] for e in snap["evidence"]}
    assert {n["id"] for n in graph["nodes"]} == {n["id"] for n in snap["nodes"]}
    with sessions() as db:
        db.add(Alert(id="UNSUPPORTED", case_id=seed.CASE_ID, title="No source", reason="Unsupported", confidence=1, evidence_ids=[]))
        db.commit()
    assert "UNSUPPORTED" not in {a["id"] for a in client.get(f"/api/v1/cases/{seed.CASE_ID}/snapshot", headers=headers).json()["alerts"]}
    for suffix in ("", "/snapshot", "/graph", "/timeline", "/map", "/network", "/related", "/reports", "/report-preview"):
        response = client.get("/api/v1/cases/MISSING" + suffix, headers=headers)
        assert response.status_code == 404, (suffix, response.text)
        assert response.json()["error"]["code"] == "case_not_found"
    assert client.get("/api/v1/evidence?case_id=MISSING", headers=headers).status_code == 404
    assert client.get("/api/v1/evidence/MISSING/blockchain", headers=headers).status_code == 404


def test_inactive_login_issues_no_refresh_token(isolated):
    client, sessions, _, _ = isolated
    with sessions() as db:
        user = db.get(User, "USR-INV-001")
        user.is_active = False
        db.commit()
    result = client.post("/api/v1/auth/login", json={"email": "investigator@decypher.example", "password": seed.DEMO_PASSWORD})
    assert result.status_code == 401 and result.json()["error"]["code"] == "invalid_credentials"
    with sessions() as db:
        assert not db.scalar(select(RefreshToken).where(RefreshToken.user_id == "USR-INV-001"))


def test_unexpected_errors_are_safe_json(isolated, monkeypatch):
    client, _, _, headers = isolated
    def fail(*args):
        raise RuntimeError("DO-NOT-EXPOSE-INTERNAL-SECRET")
    monkeypatch.setattr(main, "case_payload", fail)
    result = client.get("/api/v1/cases", headers=headers)
    assert result.status_code == 500 and result.json()["error"]["code"] == "internal_error"
    assert "DO-NOT-EXPOSE" not in result.text


def test_failed_upload_and_report_remove_only_new_objects(isolated, monkeypatch):
    client, sessions, storage, headers = isolated
    original = storage.put_file
    def fail_upload(key, stream, size, mime):
        original(key, stream, size, mime)
        raise OSError("storage failure")
    monkeypatch.setattr(storage, "put_file", fail_upload)
    result = client.post("/api/v1/evidence", headers=headers, data={"case_id": seed.CASE_ID}, files={"file": ("partial.txt", b"Synthetic partial upload", "text/plain")})
    assert result.status_code == 500
    for _ in range(5):
        worker.run_once()
    assert not list(storage.local_root.rglob("partial.txt"))
    assert (storage.local_root / f"raw/case/{seed.CASE_ID}/EV-2026-0001/original/nightfall-fir.pdf").exists()
    monkeypatch.setattr(worker, "build_report_pdf", lambda *args: b"%PDF-test")
    monkeypatch.setattr(worker, "build_report_html", lambda *args: (_ for _ in ()).throw(ValueError("HTML failure")))
    job = client.post(f"/api/v1/cases/{seed.CASE_ID}/reports", headers=headers, json={"locale": "en"}).json()
    for _ in range(5):
        worker.run_once()
    assert client.get(f"/api/v1/jobs/{job['jobId']}", headers=headers).json()["status"] == "failed"
    assert not list((storage.local_root / "exports").rglob("*.pdf"))
    with sessions() as db:
        assert not db.scalar(select(Report))


def test_analysis_survives_mirror_failure_and_retry_is_idempotent(isolated, monkeypatch):
    client, sessions, _, headers = isolated
    payload = b"transaction_id,timestamp,from_entity,to_account,amount_inr\nrepair,2026-09-10T22:04:00+05:30,Arjun Verma,4821,245000\n"
    item = client.post("/api/v1/evidence", headers=headers, data={"case_id": seed.CASE_ID}, files={"file": ("repair.csv", payload, "text/csv")}).json()
    job = client.post(f"/api/v1/evidence/{item['id']}/analyze", headers=headers).json()
    monkeypatch.setattr(services.graph_service, "sync_case", lambda *args, **kwargs: False)
    worker.run_once()
    state = client.get(f"/api/v1/jobs/{job['jobId']}", headers=headers).json()
    assert state["status"] == "failed" and state["result"]["analysisId"]
    with sessions() as db:
        assert len(list(db.scalars(select(EvidenceAnalysis).where(EvidenceAnalysis.evidence_id == item["id"])))) == 1
        assert list(db.scalars(select(ProcessingJob).where(ProcessingJob.kind == "graph_sync")))
    monkeypatch.setattr(services.graph_service, "sync_case", lambda *args, **kwargs: True)
    assert client.post(f"/api/v1/jobs/{job['jobId']}/retry", headers=headers).status_code == 202
    for _ in range(10):
        worker.run_once()
    assert client.get(f"/api/v1/jobs/{job['jobId']}", headers=headers).json()["status"] == "succeeded"
    with sessions() as db:
        assert len(list(db.scalars(select(EvidenceAnalysis).where(EvidenceAnalysis.evidence_id == item["id"])))) == 1


def test_competing_custody_transfers_cannot_both_succeed(isolated):
    client, _, _, headers = isolated
    def transfer(name):
        return client.post("/api/v1/evidence/EV-2026-0001/custody", headers=headers, json={"event": "TRANSFERRED", "actor_from": "Investigator Aditi Rao", "actor_to": name}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(transfer, ("Synthetic reviewer A", "Synthetic reviewer B")))
    assert sorted(codes) == [200, 409]


def test_reset_cleans_reports_and_mirrors_both_cases_only_in_disposable_fixture(isolated, monkeypatch):
    client, sessions, storage, headers = isolated
    storage.put("exports/disposable/old.pdf", b"test", "application/pdf")
    storage.put("unrelated/keep.txt", b"preserve", "text/plain")
    mirrored = []
    monkeypatch.setattr(services.graph_service, "sync_case", lambda db, case_id, **kwargs: mirrored.append(case_id) or True)
    result = client.post("/api/v1/admin/reset-demo", headers=headers)
    assert result.status_code == 200
    assert set(mirrored) == {seed.CASE_ID, "CASE-X007"}
    assert not (storage.local_root / "exports/disposable/old.pdf").exists()
    assert storage.get("unrelated/keep.txt") == b"preserve"
    with sessions() as db:
        assert len(list(db.scalars(select(Evidence)))) == 7


def test_worker_heartbeat_and_fencing(isolated):
    from app.jobs import JobHeartbeat, LeaseLost, owned_job
    _, sessions, _, _ = isolated
    job_id = "JOB-" + uuid4().hex
    with sessions() as db:
        db.add(ProcessingJob(id=job_id, kind="analysis", target_id="missing", status="running", lease_token="owner-A", updated_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        db.commit()
    with JobHeartbeat(job_id, "owner-A", interval=.02):
        time.sleep(.08)
    with sessions() as db:
        job = db.get(ProcessingJob, job_id)
        assert (datetime.now(timezone.utc) - job.updated_at.replace(tzinfo=timezone.utc)).total_seconds() < 2
        job.lease_token = "owner-B"
        db.commit()
        with pytest.raises(LeaseLost):
            owned_job(db, job_id, "owner-A")


def test_cleanup_retains_referenced_objects_and_rejects_broad_targets(isolated):
    from app.jobs import managed_key, remove_unreferenced
    _, sessions, storage, _ = isolated
    key = f"raw/case/{seed.CASE_ID}/EV-2026-0001/original/nightfall-fir.pdf"
    with sessions() as db:
        remove_unreferenced(db, storage, [key])
    assert storage.get(key).startswith(b"%PDF")
    for unsafe in ("/", "raw/case/", "exports/../keep.txt", "unrelated/keep.txt"):
        with pytest.raises(ValueError):
            managed_key(unsafe)


def test_database_work_failure_after_upload_is_recovered(isolated, monkeypatch):
    client, _, storage, headers = isolated
    original_audit = main.audit
    def fail_audit(db, user_id, action, *args):
        if action == "EVIDENCE_UPLOADED":
            raise RuntimeError("database-work-failure")
        return original_audit(db, user_id, action, *args)
    monkeypatch.setattr(main, "audit", fail_audit)
    response = client.post("/api/v1/evidence", headers=headers, data={"case_id": seed.CASE_ID}, files={"file": ("failed-db.txt", b"Synthetic database failure", "text/plain")})
    assert response.status_code == 500
    for _ in range(5):
        worker.run_once()
    assert not list(storage.local_root.rglob("failed-db.txt"))


def test_reset_refuses_active_processing(isolated):
    client, sessions, _, headers = isolated
    with sessions() as db:
        db.add(ProcessingJob(id="JOB-active", kind="graph_sync", target_id=seed.CASE_ID, status="queued"))
        db.commit()
    response = client.post("/api/v1/admin/reset-demo", headers=headers)
    assert response.status_code == 409 and response.json()["error"]["code"] == "processing_active"
    with sessions() as db:
        assert db.get(ProcessingJob, "JOB-active") and db.get(Evidence, "EV-2026-0001")


BUNDLE = Path(__file__).resolve().parents[2] / "data/demo/expanded-v1"
RICH_BUNDLE = Path(__file__).resolve().parents[2] / "data/demo/realistic-v2"


def test_expanded_bundle_import_is_cited_unanchored_and_idempotent(isolated):
    from app.demo_bundle import import_bundle, validate_bundle
    from app.snapshot import snapshot
    _, sessions, storage, _ = isolated
    manifest, counts = validate_bundle(BUNDLE)
    assert counts == {"cases": 6, "evidence": 80, "callRecords": 2000, "financialRecords": 500}
    with sessions() as db:
        result = import_bundle(db, BUNDLE, storage)
        assert result["newEvidence"] == 80 and len(result["graphJobIds"]) == 6
        assert result["blockchainActionsPerformed"] == 0
        for case in manifest["cases"]:
            snap = snapshot(db, case["id"])
            valid = {e["id"] for e in snap["evidence"]}
            assert snap["edges"] and snap["timeline"] and not snap["anchors"]
            assert all(row["evidenceIds"] and set(row["evidenceIds"]) <= valid for row in snap["edges"] + snap["timeline"] + snap["alerts"])
            assert all(e["status"] == "analyzed" for e in snap["evidence"])
        before = len(list(db.scalars(select(EvidenceAnalysis))))
        again = import_bundle(db, BUNDLE, storage)
        assert again["newEvidence"] == 0 and not again["graphJobIds"]
        assert len(list(db.scalars(select(EvidenceAnalysis)))) == before == 87
        assert len(list(db.scalars(select(Evidence)))) == 87
        assert len(list(db.scalars(select(Case)))) == 8


@pytest.mark.parametrize("damage", ["bytes", "path", "name"])
def test_expanded_bundle_rejects_tampering_and_unsafe_paths(tmp_path, damage):
    from app.demo_bundle import validate_bundle
    copied = tmp_path / "bundle"
    shutil.copytree(BUNDLE, copied, ignore=shutil.ignore_patterns("qa"))
    manifest_path = copied / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    entry = manifest["evidence"][0]
    if damage == "bytes":
        artifact = copied / entry["path"]
        payload = artifact.read_bytes()
        artifact.write_bytes(payload.replace(b"SYN-", b"BAD-", 1))
    elif damage == "path":
        entry["path"] = "artifacts/../../outside.csv"
    else:
        entry["name"] = "../unsafe.csv"
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        validate_bundle(copied)


@pytest.mark.parametrize("historical", [False, True])
def test_lease_migration_fresh_and_existing_schema(tmp_path, monkeypatch, historical):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    from app.database import Base
    root = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    engine = create_engine(url)
    if historical:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE processing_jobs DROP COLUMN lease_token"))
        command.stamp(config, "0003_evidence_case_links")
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    assert "lease_token" in {c["name"] for c in inspect(engine).get_columns("processing_jobs")}
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_job_leases"
    engine.dispose()


def test_realistic_pack_has_media_locations_custody_and_grounded_leads(isolated):
    from app.demo_bundle import import_bundle, validate_bundle
    from app.snapshot import snapshot
    from app.services import copilot_answer
    _, sessions, storage, _ = isolated
    manifest, counts = validate_bundle(RICH_BUNDLE)
    assert counts == {"cases":10,"evidence":200,"callRecords":5000,"financialRecords":1500}
    assert len({e["sha256"] for e in manifest["evidence"]}) == 200
    assert {e["mime_type"] for e in manifest["evidence"]} == {"text/csv","text/plain","image/png","audio/wav","video/mp4","application/pdf"}
    with sessions() as db:
        assert import_bundle(db,RICH_BUNDLE,storage)["newEvidence"] == 200
        import hashlib
        for entry in manifest["evidence"]:
            item=db.get(Evidence,entry["id"])
            assert hashlib.sha256(storage.get(item.object_key)).hexdigest()==item.sha256==entry["sha256"]
        location_names=set()
        for case in manifest["cases"]:
            snap=snapshot(db,case["id"]);valid={e["id"] for e in snap["evidence"]}
            assert len(snap["timeline"]) == 670
            assert {n["type"] for n in snap["nodes"]} >= {"PERSON","PHONE","VEHICLE","ORG","LOCATION","ACCOUNT"}
            assert len(snap["alerts"]) >= 8 and len(snap["custody"]) >= 100
            assert {e["type"] for e in snap["evidence"]} >= {"image","audio","video","document","data"}
            assert all(r["evidenceIds"] and set(r["evidenceIds"]) <= valid for r in snap["edges"]+snap["timeline"]+snap["alerts"])
            assert not snap["anchors"]
            assert snap["case"]["status"]==case["status"]
            first=next(e for e in manifest["evidence"] if e["case_id"]==case["id"])
            handovers=[e for e in snap["custody"] if e["evidenceId"]==first["id"] and e["event"]=="TRANSFERRED"]
            assert handovers[0]["from"]==case["lead_investigator"] and handovers[-1]["to"]==case["lead_investigator"]
            location_names.update(e["location"]["name"] for e in snap["timeline"] if e["location"])
            for language in ("en","hi"):
                answer=copilot_answer(db,case["id"],f"What evidence mentions {case['cast'][0]}?",language)
                assert answer["citations"] and set(answer["citations"]) <= valid
        assert len(location_names)==15
        assert import_bundle(db,RICH_BUNDLE,storage)["newEvidence"] == 0


def test_substrings_do_not_create_unrelated_demo_entities(isolated):
    from app.models import EvidenceEntity
    client,sessions,_,headers=isolated
    raw=b"Synthetic source: amount 54821.11. The name Rajesh is not Raj Mehta."
    # Use only the first sentence so no actual canonical name is mentioned.
    raw=raw.split(b" The name")[0]+b" The reviewer name is Rajesh."
    item=client.post("/api/v1/evidence",headers=headers,data={"case_id":seed.CASE_ID},files={"file":("substring.txt",raw,"text/plain")}).json()
    with sessions() as db:
        services.analyze_evidence(db,db.get(Evidence,item["id"]),raw);db.commit()
        bound=set(db.scalars(select(EvidenceEntity.entity_id).where(EvidenceEntity.evidence_id==item["id"])))
        assert "ACCOUNT-A001" not in bound and "PERSON-P001" not in bound
