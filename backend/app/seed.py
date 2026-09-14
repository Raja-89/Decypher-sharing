import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import (
    Alert, AuditLog, BlockchainAnchor, Case, CustodyEvent, Entity, Evidence,
    EvidenceAnalysis, EvidenceEntity, ProcessingJob, RefreshToken, Relationship,
    Report, TimelineEvent, User,
    EvidenceCaseLink,
)
from .security import hash_password
from .services import storage,analyze_evidence


CASE_ID = "CASE-2026-017"
DEMO_PASSWORD = "DemoAccess2026!"

USERS = [
    ("USR-INV-001", "investigator@decypher.example", "Investigator Aditi Rao", "investigator"),
    ("USR-SUP-001", "supervisor@decypher.example", "Supervisor Prakash Verma", "senior"),
    ("USR-FOR-001", "forensics@decypher.example", "Forensic Analyst Sana Khan", "forensics"),
    ("USR-ADM-001", "admin@decypher.example", "System Administrator", "admin"),
]

ENTITIES = [
    ("PERSON-P001", "Raj Mehta", "राज मेहता", "PERSON", ["Raj", "R. Mehta"], {"role": "person of interest"}),
    ("PERSON-P002", "Arjun Verma", "अर्जुन वर्मा", "PERSON", ["Arjun", "A. Verma"], {"role": "associate"}),
    ("PERSON-P003", "Neha Kapoor", "नेहा कपूर", "PERSON", ["Neha", "N. Kapoor"], {"role": "account holder"}),
    ("PERSON-P004", "Vikram Singh", "विक्रम सिंह", "PERSON", ["Vikram", "V. Singh"], {"role": "cross-case bridge"}),
    ("VEHICLE-V001", "DL01AB1234", "डीएल01एबी1234", "VEHICLE", [], {"make": "white compact sedan"}),
    ("VEHICLE-V002", "DL03XY4521", "डीएल03एक्सवाई4521", "VEHICLE", [], {"make": "grey utility vehicle"}),
    ("LOCATION-L001", "Connaught Place", "कनॉट प्लेस", "LOCATION", ["CP"], {"lat": 28.6315, "lng": 77.2167}),
    ("LOCATION-L002", "Gurugram Warehouse", "गुरुग्राम गोदाम", "LOCATION", ["Gurugram"], {"lat": 28.4595, "lng": 77.0266}),
    ("LOCATION-L003", "Noida Sector 62", "नोएडा सेक्टर 62", "LOCATION", ["Noida"], {"lat": 28.6270, "lng": 77.3723}),
    ("ACCOUNT-A001", "A/C ending 4821", "खाता अंतिम अंक 4821", "ACCOUNT", ["4821"], {"bank": "Fictional Cooperative Bank"}),
    ("CASE-X007", "Operation Northbridge", "ऑपरेशन नॉर्थब्रिज", "CASE", [], {"status": "active"}),
]

EVIDENCE_FIXTURES = [
    ("EV-2026-0001", "nightfall-fir.pdf", "FIR and initial field report", "document", "application/pdf"),
    ("EV-2026-0002", "nightfall-cdr.csv", "Call detail records", "data", "text/csv"),
    ("EV-2026-0003", "nightfall-transactions.csv", "Financial transaction export", "data", "text/csv"),
    ("EV-2026-0004", "nightfall-cctv-still.png", "Synthetic CCTV still", "image", "image/png"),
    ("EV-2026-0005", "nightfall-audio.wav", "Synthetic dispatch audio", "audio", "audio/wav"),
    ("EV-2026-0006", "nightfall-cctv.mp4", "Synthetic CCTV clip", "video", "video/mp4"),
    ("EV-2026-0007", "nightfall-investigation-note.txt", "Investigation note", "document", "text/plain"),
]

RELATIONSHIPS = [
    ("REL-001", "PERSON-P001", "PERSON-P002", "CALLED", .96, ["EV-2026-0002"]),
    ("REL-002", "PERSON-P001", "VEHICLE-V001", "ASSOCIATED_WITH", .92, ["EV-2026-0004", "EV-2026-0006"]),
    ("REL-003", "VEHICLE-V001", "LOCATION-L002", "LOCATED_AT", .95, ["EV-2026-0004", "EV-2026-0006"]),
    ("REL-004", "PERSON-P002", "ACCOUNT-A001", "PAID", .91, ["EV-2026-0003"]),
    ("REL-005", "PERSON-P003", "ACCOUNT-A001", "OWNS", .98, ["EV-2026-0003"]),
    ("REL-006", "PERSON-P004", "VEHICLE-V001", "ASSOCIATED_WITH", .86, ["EV-2026-0007"]),
    ("REL-007", "PERSON-P004", "CASE-X007", "MENTIONED_IN", .89, ["EV-2026-0007"]),
    ("REL-008", "PERSON-P001", "LOCATION-L001", "LOCATED_AT", .88, ["EV-2026-0002"]),
]


def _fixture_bytes(filename: str) -> bytes:
    path = Path("/app/data/demo") / filename
    if not path.exists():
        path = Path("data/demo") / filename
    if path.exists():
        return path.read_bytes()
    raise FileNotFoundError(f"Required demo artifact is missing: {filename}")


def seed_demo(db: Session) -> None:
    for user_id, email, name, role in USERS:
        if not db.get(User, user_id):
            db.add(User(id=user_id, email=email, name=name, role=role, password_hash=hash_password(DEMO_PASSWORD)))
    if not db.get(Case, CASE_ID):
        db.add(Case(
            id=CASE_ID, case_number="DL-NCR/2026/017", title="Operation Nightfall",
            title_hi="ऑपरेशन नाइटफॉल",
            description="A fictional evidence-intelligence demonstration connecting communications, a vehicle sighting, a financial trail and a cross-case bridge across Delhi NCR.",
            description_hi="दिल्ली एनसीआर में संचार, वाहन की पहचान, वित्तीय लेन-देन और दूसरे केस से संबंध जोड़ने वाला काल्पनिक साक्ष्य-खुफिया प्रदर्शन।",
            status="active", priority="critical", lead_investigator="Investigator Aditi Rao",
        ))
    db.flush()

    if not db.get(Case,"CASE-X007"):
        db.add(Case(id="CASE-X007",case_number="DEMO/NORTHBRIDGE/007",title="Operation Northbridge",title_hi="ऑपरेशन नॉर्थब्रिज",description="Fictional related case with a shared field note linking Vikram Singh and vehicle V001. Human review is required.",description_hi="विक्रम सिंह और वाहन V001 को साझा नोट से जोड़ने वाला काल्पनिक संबंधित केस। मानव समीक्षा आवश्यक है।",priority="medium",lead_investigator="Supervisor Prakash Verma"))
        db.flush()

    for entity_id, name, name_hi, entity_type, aliases, properties in ENTITIES:
        if not db.get(Entity, entity_id):
            db.add(Entity(id=entity_id, canonical_name=name, canonical_name_hi=name_hi, type=entity_type, aliases=aliases, properties=properties))
    db.flush()

    for evidence_id, filename, name, evidence_type, mime in EVIDENCE_FIXTURES:
        if db.get(Evidence, evidence_id):
            continue
        payload = _fixture_bytes(filename)
        digest = hashlib.sha256(payload).hexdigest()
        key = f"raw/case/{CASE_ID}/{evidence_id}/original/{filename}"
        storage.put(key, payload, mime)
        item = Evidence(
            id=evidence_id, case_id=CASE_ID, name=name, description="Synthetic evidence created only for the Decypher demonstration.",
            type=evidence_type, object_key=key, mime_type=mime, size=len(payload), sha256=digest,
            status="analyzed", registered_by="USR-INV-001", verification_token=f"nightfall-{evidence_id.lower()}",
            created_at=datetime.fromisoformat("2026-09-11T09:00:00+05:30").astimezone(timezone.utc),
        )
        db.add(item)
        # No ORM relationship is declared for custody, so explicitly persist
        # the parent before dependent inserts (PostgreSQL enforces the FK).
        db.flush()
        db.add(CustodyEvent(evidence_id=evidence_id, event="COLLECTED", actor_to="Investigator Aditi Rao", location="Delhi NCR", notes="Synthetic demo intake",timestamp=item.created_at))
        db.add(CustodyEvent(evidence_id=evidence_id, event="HASHED", actor_to="Decypher", location="Secure intake", notes=f"SHA-256 {digest}",timestamp=item.created_at+timedelta(seconds=1)))
    db.flush()

    for rel_id, source, target, rel_type, confidence, evidence_ids in RELATIONSHIPS:
        if not db.get(Relationship, rel_id):
            db.add(Relationship(id=rel_id, case_id=CASE_ID, source_id=source, target_id=target, type=rel_type, confidence=confidence, evidence_ids=evidence_ids,timestamp=datetime.fromisoformat("2026-09-11T08:10:00+05:30").astimezone(timezone.utc)))
    if not db.scalar(select(EvidenceCaseLink).where(EvidenceCaseLink.case_id=="CASE-X007",EvidenceCaseLink.evidence_id=="EV-2026-0007")):
        db.add(EvidenceCaseLink(case_id="CASE-X007",evidence_id="EV-2026-0007"))
    if not db.get(Relationship,"REL-X007"):
        db.add(Relationship(id="REL-X007",case_id="CASE-X007",source_id="PERSON-P004",target_id="VEHICLE-V001",type="MENTIONED_WITH",confidence=.8,evidence_ids=["EV-2026-0007"]))
    event_rows = [
        ("EVENT-001", "2026-09-10T20:42:00+00:00", "CALL", "Call between Raj and Arjun", "राज और अर्जुन के बीच कॉल", ["PERSON-P001", "PERSON-P002"], ["EV-2026-0002"], {"name":"Connaught Place","lat":28.6315,"lng":77.2167}, .96),
        ("EVENT-002", "2026-09-10T21:15:00+00:00", "SIGHTING", "Vehicle V001 enters warehouse garage", "वाहन V001 गोदाम पार्किंग में प्रवेश करता है", ["VEHICLE-V001", "LOCATION-L002"], ["EV-2026-0004", "EV-2026-0006"], {"name":"Gurugram Warehouse","lat":28.4595,"lng":77.0266}, .95),
        ("EVENT-003", "2026-09-10T22:04:00+00:00", "TRANSACTION", "Transfer to account ending 4821", "खाता 4821 में धन हस्तांतरण", ["PERSON-P002", "PERSON-P003", "ACCOUNT-A001"], ["EV-2026-0003"], {"name":"Noida Sector 62","lat":28.6270,"lng":77.3723}, .91),
        ("EVENT-004", "2026-09-11T08:10:00+00:00", "CROSS_CASE", "Vikram linked to V001 and CASE-X007", "विक्रम का V001 और CASE-X007 से संबंध", ["PERSON-P004", "VEHICLE-V001", "CASE-X007"], ["EV-2026-0007"], {"name":"Gurugram Warehouse","lat":28.4595,"lng":77.0266}, .86),
    ]
    for event_id, stamp, kind, title, title_hi, entity_ids, evidence_ids, location, confidence in event_rows:
        if not db.get(TimelineEvent, event_id):
            db.add(TimelineEvent(id=event_id, case_id=CASE_ID, timestamp=datetime.fromisoformat(stamp.replace("+00:00","+05:30")).astimezone(timezone.utc), type=kind, title=title, title_hi=title_hi, description=title, entity_ids=entity_ids, evidence_ids=evidence_ids, location=location, confidence=confidence))
    if not db.get(Alert, "ALERT-001"):
        db.add(Alert(id="ALERT-001", case_id=CASE_ID, title="Cross-case bridge entity", reason="Vikram Singh links Vehicle V001 with fictional CASE-X007 through one source note.", confidence=.86, evidence_ids=["EV-2026-0007"]))
    db.flush()
    for evidence_id,filename,*_rest in EVIDENCE_FIXTURES:
        if not db.scalar(select(EvidenceAnalysis).where(EvidenceAnalysis.evidence_id==evidence_id)):
            item=db.get(Evidence,evidence_id)
            analysis=analyze_evidence(db,item,_fixture_bytes(filename))
            analysis.created_at=item.created_at+timedelta(seconds=2)
            for custody in db.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id==evidence_id,CustodyEvent.event=="ANALYZED")):
                custody.timestamp=item.created_at+timedelta(seconds=2)
    db.commit()


def reset_demo(db: Session) -> None:
    for model in [AuditLog, Report, ProcessingJob, BlockchainAnchor, EvidenceAnalysis, EvidenceEntity, EvidenceCaseLink, CustodyEvent, Alert, TimelineEvent, Relationship, Evidence, Entity, Case, RefreshToken, User]:
        db.execute(delete(model))
    db.commit()
    storage.delete_prefix("raw/case/")
    storage.delete_prefix("exports/")
    seed_demo(db)
