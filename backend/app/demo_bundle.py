"""Validate/load explicit synthetic bundles; never invoked during startup."""
import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .ingest import hash_file, safe_filename, validate_content
from .jobs import JobHeartbeat, begin_cleanup, finish_cleanup, queue_graph_sync, release_cleanup
from .models import Case, CustodyEvent, Evidence, EvidenceCaseLink, User
from .services import ALLOWED_MIME, analyze_evidence, new_verification_token, storage


def validate_bundle(directory):
    root = Path(directory).resolve()
    manifest_path = root / "manifest.json"
    if manifest_path.stat().st_size > 1_000_000:
        raise ValueError("Bundle manifest exceeds prototype limits.")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("formatVersion") != 1 or manifest.get("fictional") is not True:
        raise ValueError("Only explicitly fictional format-version 1 bundles are accepted.")
    cases, evidence = manifest["cases"], manifest["evidence"]
    if not 1 <= len(cases) <= 20 or not 1 <= len(evidence) <= 500:
        raise ValueError("Bundle case/evidence count is outside prototype bounds.")
    case_ids = {c["id"] for c in cases}
    evidence_ids = {e["id"] for e in evidence}
    if len(case_ids) != len(cases) or len(evidence_ids) != len(evidence):
        raise ValueError("Duplicate bundle identities.")
    if not all(re.fullmatch(r"CASE-SYN-[A-Za-z0-9-]{1,31}", i) for i in case_ids) or not all(re.fullmatch(r"EV-SYN-[A-Za-z0-9-]{1,33}", i) for i in evidence_ids):
        raise ValueError("Bundle identities must be namespaced synthetic IDs.")
    hashes = set()
    call_count = transfer_count = 0
    for entry in evidence:
        if not isinstance(entry.get("name"), str) or safe_filename(entry["name"]) != entry["name"]:
            raise ValueError("Evidence filename is unsafe.")
        file_path = (root / entry["path"]).resolve()
        if not file_path.is_relative_to(root) or not entry["path"].startswith("artifacts/"):
            raise ValueError("Evidence path escapes the bundle artifact directory.")
        if entry["case_id"] not in case_ids or entry["mime_type"] not in ALLOWED_MIME:
            raise ValueError("Unknown case or unsupported bundle MIME.")
        size = file_path.stat().st_size
        if size != entry["size"] or not 0 < size <= settings.max_upload_bytes:
            raise ValueError("Bundle evidence size mismatch.")
        digest = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if digest != entry["sha256"] or digest in hashes:
            raise ValueError("Bundle hash mismatch or duplicate artifact bytes.")
        hashes.add(digest)
        with file_path.open("rb") as source:
            validate_content(source, entry["mime_type"])
        if "csv" in entry["mime_type"]:
            with file_path.open(encoding="utf-8-sig", newline="") as source:
                rows = list(csv.DictReader(source))
            if len(rows) != entry["rowCount"] or len(rows) > 10_000:
                raise ValueError("CSV row count mismatch.")
            if entry.get("recordKind") == "call":
                required, timestamp = {"record_id", "caller", "receiver", "start_time"}, "start_time"
                call_count += len(rows)
            elif entry.get("recordKind") == "transfer":
                required, timestamp = {"transaction_id", "timestamp", "from_entity", "to_account", "amount_inr"}, "timestamp"
                transfer_count += len(rows)
            elif entry.get("recordKind") == "entity":
                required, timestamp = {"canonical_name","entity_type","properties_json","source_note"}, None
            elif entry.get("recordKind") == "observation":
                required, timestamp = {"record_id","timestamp","source_entity","source_type","target_entity","target_type","relationship","confidence","source_note"}, "timestamp"
            else:
                raise ValueError("Unknown structured bundle schema.")
            for row in rows:
                if not required <= row.keys() or (timestamp and datetime.fromisoformat(row[timestamp].replace("Z", "+00:00")).tzinfo is None):
                    raise ValueError("Invalid CSV schema or timezone.")
    for link in manifest.get("links", []):
        if link["evidence_id"] not in evidence_ids or link["case_id"] not in case_ids:
            raise ValueError("Shared evidence link does not resolve.")
    counts = {"cases": len(cases), "evidence": len(evidence), "callRecords": call_count, "financialRecords": transfer_count}
    if counts != manifest.get("expected"):
        raise ValueError("Bundle counts do not match the declared manifest.")
    return manifest, counts


def import_bundle(db, directory, object_storage=None):
    object_storage = object_storage or storage
    manifest, counts = validate_bundle(directory)
    if not db.get(User, "USR-INV-001"):
        raise ValueError("Initialize the local demo accounts before importing.")
    new_entries = []
    for case in manifest["cases"]:
        current = db.get(Case, case["id"])
        if current and (current.case_number != case["case_number"] or current.title != case["title"]):
            raise ValueError("Import would overwrite an existing case identity.")
    for entry in manifest["evidence"]:
        existing = db.get(Evidence, entry["id"])
        if existing:
            if existing.sha256 != entry["sha256"] or existing.case_id != entry["case_id"]:
                raise ValueError("Import would overwrite existing evidence.")
        elif db.scalar(select(Evidence).where(Evidence.sha256 == entry["sha256"])):
            raise ValueError("Artifact hash is already stored under another identity.")
        else:
            new_entries.append(entry)
    new_entries.sort(key=lambda entry: 0 if entry.get("recordKind")=="entity" else 1)
    keys = {entry["id"]: f"raw/case/{entry['case_id']}/{entry['id']}/original/{entry['name']}" for entry in new_entries}
    cleanup = begin_cleanup(db, list(keys.values())) if keys else None
    try:
        if cleanup:
            heartbeat = JobHeartbeat(*cleanup)
            heartbeat.__enter__()
        for record in manifest["cases"]:
            if not db.get(Case, record["id"]):
                created = datetime.fromisoformat(record["created_at"].replace("Z", "+00:00"))
                db.add(Case(**{k: record[k] for k in ("id", "case_number", "title", "title_hi", "description", "description_hi", "priority", "lead_investigator")}, status=record.get("status","active"), created_at=created, updated_at=created))
        db.flush()
        for entry in new_entries:
            source_path = Path(directory) / entry["path"]
            with source_path.open("rb") as source:
                digest,size=hash_file(source)
                if digest!=entry["sha256"] or size!=entry["size"]:raise ValueError("Bundle changed during import; validation must be repeated.")
                raw=source.read()
                if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError("Bundle changed during import.")
                source.seek(0)
                object_storage.put_file(keys[entry["id"]], source, entry["size"], entry["mime_type"])
            created = datetime.fromisoformat(entry["created_at"].replace("Z", "+00:00"))
            mime=entry["mime_type"]
            kind=next((prefix for prefix in ("image","audio","video") if mime.startswith(prefix+"/")),"data" if "csv" in mime else "document")
            item = Evidence(id=entry["id"], case_id=entry["case_id"], name=entry["name"], description=entry["description"], type=kind, object_key=keys[entry["id"]], mime_type=mime, size=entry["size"], sha256=entry["sha256"], status="hashed", registered_by="USR-INV-001", verification_token=new_verification_token(), created_at=created)
            db.add(item); db.flush()
            case_record=next(c for c in manifest["cases"] if c["id"]==item.case_id)
            collector=case_record["lead_investigator"] if manifest.get("profile")=="realistic-v2" else "Synthetic demo investigator"
            db.add(CustodyEvent(evidence_id=item.id, event="COLLECTED", actor_to=collector, notes="Explicit synthetic bundle import", timestamp=created))
            db.add(CustodyEvent(evidence_id=item.id, event="HASHED", actor_to="Decypher", notes=f"SHA-256 {item.sha256}", timestamp=created + timedelta(seconds=1)))
            analysis = analyze_evidence(db, item, raw)
            analysis.created_at = created + timedelta(seconds=2)
            for event in db.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id == item.id, CustodyEvent.event == "ANALYZED")):
                event.timestamp = created + timedelta(seconds=2)
            if manifest.get("profile")=="realistic-v2":
                reviewer=f"Reviewer {manifest['cases'].index(case_record)+1}"
                db.add(CustodyEvent(evidence_id=item.id,event="TRANSFERRED",actor_from=collector,actor_to=reviewer,notes="Fictional ledger handover; no authenticated recipient signature",timestamp=created+timedelta(minutes=10)))
                db.add(CustodyEvent(evidence_id=item.id,event="TRANSFERRED",actor_from=reviewer,actor_to=collector,notes="Fictional ledger return",timestamp=created+timedelta(minutes=20)))
                if entry.get("asset"):
                    analysis.result={**analysis.result,"authoredSyntheticMedia":entry["asset"],"recognitionPerformed":False}
        added_links = False
        for link in manifest.get("links", []):
            if not db.scalar(select(EvidenceCaseLink).where(EvidenceCaseLink.case_id == link["case_id"], EvidenceCaseLink.evidence_id == link["evidence_id"])):
                db.add(EvidenceCaseLink(**link))
                added_links = True
        graph_jobs = [queue_graph_sync(db, record["id"]) for record in manifest["cases"]] if new_entries or added_links else []
        if cleanup:
            finish_cleanup(db, *cleanup)
        db.commit()
        return {**counts, "newEvidence": len(new_entries), "graphJobIds": graph_jobs, "blockchainActionsPerformed": 0}
    except Exception:
        db.rollback()
        if cleanup:
            release_cleanup(*cleanup)
        raise
    finally:
        if cleanup:
            heartbeat.__exit__()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--apply", action="store_true", help="Explicitly import into the configured local demo")
    parser.add_argument("--confirm-local-demo", action="store_true")
    args = parser.parse_args()
    _, counts = validate_bundle(args.bundle)
    if not args.apply:
        print(json.dumps({"mode": "validate-only", **counts}))
        return
    if not args.confirm_local_demo or settings.environment != "development":
        parser.error("Apply requires --confirm-local-demo and ENVIRONMENT=development.")
    with SessionLocal() as db:
        print(json.dumps(import_bundle(db, args.bundle)))


if __name__ == "__main__":
    main()
