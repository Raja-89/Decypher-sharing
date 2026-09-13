import hashlib
import io
import json
import re
import secrets
from html import escape
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

import httpx
import qrcode
from minio import Minio
from neo4j import GraphDatabase
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import (
    Alert, BlockchainAnchor, Case, CustodyEvent, Entity, Evidence, EvidenceAnalysis,
    EvidenceEntity, Relationship, Report, TimelineEvent,
)


ALLOWED_MIME = {
    "application/pdf", "text/plain", "text/csv", "application/csv",
    "image/jpeg", "image/png", "audio/mpeg", "audio/wav", "audio/x-wav",
    "video/mp4", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def sha256_stream(stream: BinaryIO) -> tuple[str, bytes]:
    digest = hashlib.sha256()
    chunks: list[bytes] = []
    size = 0
    while chunk := stream.read(1024 * 1024):
        size += len(chunk)
        if size > settings.max_upload_bytes:
            raise ValueError("File exceeds the 100 MB prototype limit.")
        digest.update(chunk)
        chunks.append(chunk)
    return digest.hexdigest(), b"".join(chunks)


class Storage:
    def __init__(self):
        self.local_root = Path(settings.storage_path)
        self.local_root.mkdir(parents=True, exist_ok=True)
        self.minio = None
        if settings.storage_provider == "minio":
            self.minio = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
            )

    def ensure(self):
        if self.minio and not self.minio.bucket_exists(settings.minio_bucket):
            self.minio.make_bucket(settings.minio_bucket)

    def put(self, key: str, payload: bytes, content_type: str) -> None:
        if self.minio:
            self.ensure()
            self.minio.put_object(settings.minio_bucket, key, io.BytesIO(payload), len(payload), content_type=content_type)
            return
        path = self.local_root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    def put_file(self, key, stream, size, content_type):
        stream.seek(0)
        if self.minio:
            self.ensure(); self.minio.put_object(settings.minio_bucket,key,stream,size,content_type=content_type)
        else:
            import shutil
            path = self.local_root / key; path.parent.mkdir(parents=True,exist_ok=True)
            with path.open("wb") as target: shutil.copyfileobj(stream,target,64 * 1024)
        stream.seek(0)

    def chunks(self,key):
        response = self.minio.get_object(settings.minio_bucket,key) if self.minio else (self.local_root/key).open("rb")
        try:
            while chunk := response.read(64 * 1024): yield chunk
        finally:
            response.close()
            if self.minio: response.release_conn()

    def remove(self,key):
        if self.minio: self.minio.remove_object(settings.minio_bucket,key)
        else: (self.local_root/key).unlink(missing_ok=True)

    def get(self, key: str) -> bytes:
        if self.minio:
            response = self.minio.get_object(settings.minio_bucket, key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        return (self.local_root / key).read_bytes()

    def delete_prefix(self, prefix: str) -> None:
        if self.minio:
            for item in self.minio.list_objects(settings.minio_bucket, prefix=prefix, recursive=True):
                self.minio.remove_object(settings.minio_bucket, item.object_name)
            return
        root = self.local_root / prefix
        if root.exists():
            for path in sorted(root.rglob("*"), reverse=True):
                if path.is_file():
                    path.unlink()
                elif path.is_dir():
                    path.rmdir()


storage = Storage()


class BlockchainService:
    def lookup(self,evidence_hash):
        try:
            response=httpx.get(f"{settings.blockchain_bridge_url}/evidence/{evidence_hash}",timeout=5)
            if response.status_code==404: return {}
            response.raise_for_status(); return response.json()
        except (httpx.HTTPError,ValueError): return None
    def register(self, evidence: Evidence, registered_by: str) -> dict:
        payload = {
            "evidenceHash": evidence.sha256,
            "caseId": evidence.case_id,
            "evidenceId": evidence.id,
            "registeredBy": registered_by,
        }
        try:
            response = httpx.post(f"{settings.blockchain_bridge_url}/register", json=payload, timeout=30)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise RuntimeError("Local blockchain service is unavailable. Start the complete Docker stack.") from exc

    def get(self, evidence_hash: str) -> dict:
        try:
            response = httpx.get(f"{settings.blockchain_bridge_url}/evidence/{evidence_hash}", timeout=10)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise RuntimeError("Unable to retrieve the local blockchain record.") from exc


blockchain = BlockchainService()


class GraphService:
    def _driver(self):
        return GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))

    def sync_case(self, db: Session, case_id: str, strict=False) -> bool:
        from .snapshot import snapshot
        data=snapshot(db,case_id)
        def write(tx):
            tx.run("MATCH (n:Entity {caseId: $caseId}) DETACH DELETE n",caseId=case_id).consume()
            for node in data["nodes"]:
                # Labels are selected from a closed set, never interpolated input.
                label={"PERSON":"Person","VEHICLE":"Vehicle","LOCATION":"Location","ACCOUNT":"Account","PHONE":"Phone","CASE":"Investigation"}.get(node["type"],"Other")
                tx.run(f"CREATE (n:Entity:{label} {{id:$id,caseId:$caseId,name:$name,type:$type,properties:$props,evidenceIds:$evidenceIds}})",id=node["id"],caseId=case_id,name=node["label"],type=node["type"],props=json.dumps(node["properties"]),evidenceIds=node["evidenceIds"]).consume()
            for edge in data["edges"]:
                tx.run("MATCH (a:Entity {id:$source,caseId:$caseId}), (b:Entity {id:$target,caseId:$caseId}) CREATE (a)-[r:RELATED {id:$id,type:$type,confidence:$confidence,evidenceIds:$evidenceIds,timestamp:$timestamp}]->(b)",source=edge["source"],target=edge["target"],caseId=case_id,id=edge["id"],type=edge["type"],confidence=edge["confidence"],evidenceIds=edge["evidenceIds"],timestamp=edge["timestamp"]).consume()
        try:
            with self._driver() as driver, driver.session() as session:
                session.execute_write(write)
            return True
        except Exception as exc:
            # PostgreSQL remains the source of truth; readiness reports degraded Neo4j separately.
            if strict: raise RuntimeError("Neo4j mirror failed; retry analysis when graph service is ready.") from exc
            return False

    def reset(self) -> None:
        try:
            with self._driver() as driver, driver.session() as session:
                session.run("MATCH (n:Entity) WHERE n.caseId IS NOT NULL DETACH DELETE n")
        except Exception:
            return


graph_service = GraphService()


DEMO_ENTITY_RULES = [
    ("PERSON-P001", "Raj Mehta", "PERSON", ["Raj", "R. Mehta"]),
    ("PERSON-P002", "Arjun Verma", "PERSON", ["Arjun", "A. Verma"]),
    ("PERSON-P003", "Neha Kapoor", "PERSON", ["Neha", "N. Kapoor"]),
    ("PERSON-P004", "Vikram Singh", "PERSON", ["Vikram", "V. Singh"]),
    ("VEHICLE-V001", "DL01AB1234", "VEHICLE", []),
    ("VEHICLE-V002", "DL03XY4521", "VEHICLE", []),
    ("LOCATION-L001", "Connaught Place", "LOCATION", ["CP"]),
    ("LOCATION-L002", "Gurugram Warehouse", "LOCATION", ["Gurugram"]),
    ("ACCOUNT-A001", "A/C ending 4821", "ACCOUNT", ["4821"]),
]


def analyze_evidence(db: Session, evidence: Evidence, raw: bytes) -> EvidenceAnalysis:
    from .analysis import extract, bind, entity as resolve_entity
    text,metadata,findings = extract(db,evidence,raw)
    matched = []
    for entity_id, name, entity_type, aliases in DEMO_ENTITY_RULES:
        terms = [name, *aliases]
        if any(term.lower() in text.lower() for term in terms):
            entity = db.get(Entity, entity_id)
            if not entity:
                entity = Entity(id=entity_id, canonical_name=name, type=entity_type, aliases=aliases, properties={})
                db.add(entity)
            if not db.scalar(select(EvidenceEntity).where(EvidenceEntity.evidence_id == evidence.id, EvidenceEntity.entity_id == entity_id)):
                excerpt_match = next((term for term in terms if term.lower() in text.lower()), name)
                db.add(EvidenceEntity(evidence_id=evidence.id, entity_id=entity_id, confidence=0.94, source_excerpt=excerpt_match))
            matched.append({"id": entity_id, "name": name, "type": entity_type, "confidence": 0.94})

    phone_numbers = sorted(set(re.findall(r"(?:\+91[- ]?)?[6-9]\d{9}", text)))
    for index, phone in enumerate(phone_numbers):
        normalized = re.sub(r"\D", "", phone)[-10:]
        resolved = resolve_entity(db,f"+91 {normalized}","PHONE"); entity_id=resolved.id
        bind(db,evidence,resolved,phone,.98)
        matched.append({"id": entity_id, "name": f"+91 {normalized}", "type": "PHONE", "confidence": 0.98})

    db.flush()
    # Structured and curated-media extraction also creates bindings; include
    # them in the result instead of incorrectly reporting zero entities.
    for binding,node in db.execute(select(EvidenceEntity,Entity).join(Entity,Entity.id==EvidenceEntity.entity_id).where(EvidenceEntity.evidence_id==evidence.id).order_by(Entity.id)):
        if not any(entry["id"]==node.id for entry in matched):
            matched.append({"id":node.id,"name":node.canonical_name,"type":node.type,"confidence":binding.confidence})
    matched=list({entry["id"]:entry for entry in matched}.values())
    summary = f"Deterministic analysis identified {len(matched)} traceable entities."
    if not matched:
        summary = "No supported entities were detected; no investigative claim was generated."
    analysis = EvidenceAnalysis(
        evidence_id=evidence.id, provider="deterministic", summary=summary,
        confidence=0.94 if matched or findings else 0.0, result={"entities": matched,"metadata":metadata,"findings":findings,"sourceEvidenceId": evidence.id},
    )
    evidence.status = "analyzed"
    db.add(analysis)
    db.add(CustodyEvent(evidence_id=evidence.id, event="ANALYZED", actor_to="Decypher deterministic analyzer", notes=summary))
    db.flush()
    return analysis


def qr_png(evidence: Evidence) -> bytes:
    payload = f"{settings.public_base_url}/verify/{evidence.verification_token}"
    image = qrcode.make(payload)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def copilot_answer(db: Session, case_id: str, question: str, locale: str) -> dict:
    from .snapshot import snapshot
    data=snapshot(db,case_id)
    ids={n["id"] for n in data["nodes"]}
    entities = list(db.scalars(select(Entity).where(Entity.id.in_(ids))))
    relationships = list(db.scalars(select(Relationship).where(Relationship.case_id == case_id)))
    lower = question.lower()
    chosen = next((e for e in entities if e.canonical_name.lower() in lower or e.id.lower() in lower or (e.canonical_name_hi and e.canonical_name_hi in question)), None)
    if not chosen and ("important" in lower or "महत्व" in question):
        degree = {e.id: 0 for e in entities}
        for rel in relationships:
            degree[rel.source_id] = degree.get(rel.source_id, 0) + 1
            degree[rel.target_id] = degree.get(rel.target_id, 0) + 1
        chosen = max(entities, key=lambda e: degree.get(e.id, 0), default=None)
    related = [r for r in relationships if chosen and chosen.id in (r.source_id, r.target_id)]
    valid={e["id"] for e in data["evidence"]}
    citations = sorted({ev for rel in related for ev in rel.evidence_ids}&valid)
    if not chosen:
        related=relationships[:3];citations=sorted({ev for rel in related for ev in rel.evidence_ids}&valid)
    if locale == "hi":
        answer = f"{chosen.canonical_name_hi or chosen.canonical_name if chosen else data['case']['title_hi'] or data['case']['title']} से {len(related)} प्रमाण-समर्थित संबंध जुड़े हैं। यह एक जाँच संकेत है, अंतिम निष्कर्ष नहीं।"
        reasoning = "उत्तर केवल केस ग्राफ और सूचीबद्ध स्रोत साक्ष्य से तैयार किया गया है।"
    else:
        answer = f"{chosen.canonical_name if chosen else 'The selected entity'} has {len(related)} evidence-backed relationships. This is an investigative lead, not a conclusion of guilt."
        reasoning = "The answer was derived only from the case graph and the cited source evidence."
    return {"answer": answer, "reasoning": reasoning, "confidence": 0.91 if citations else 0.0, "citations": citations}


def build_report_pdf(db: Session, case: Case, locale: str) -> bytes:
    from .reports import pdf_report
    return pdf_report(db,case,locale)

def _legacy_report_pdf(db: Session, case: Case, locale: str) -> bytes:
    evidence = list(db.scalars(select(Evidence).where(Evidence.case_id == case.id)))
    events = list(db.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id).order_by(TimelineEvent.timestamp)))
    relationships = list(db.scalars(select(Relationship).where(Relationship.case_id == case.id)))
    alerts = list(db.scalars(select(Alert).where(Alert.case_id == case.id)))
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
    styles = getSampleStyleSheet()
    font_candidates = [
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    font_path = next((path for path in font_candidates if Path(path).exists()), None)
    if font_path:
        pdfmetrics.registerFont(TTFont("ReportUnicode", font_path))
        for style in styles.byName.values():
            style.fontName = "ReportUnicode"
    title_style = ParagraphStyle("TitleGov", parent=styles["Title"], textColor=colors.HexColor("#0b2e63"), alignment=TA_CENTER)
    story = [Paragraph("Decypher by Epoch", title_style), Paragraph(escape(case.title), styles["Heading1"]), Spacer(1, 8)]
    label = {
        "summary": "केस सारांश" if locale == "hi" else "Case Summary",
        "evidence": "साक्ष्य सूची" if locale == "hi" else "Evidence Register",
        "timeline": "समयरेखा" if locale == "hi" else "Timeline",
        "relations": "प्रमाण-समर्थित संबंध" if locale == "hi" else "Evidence-backed Relationships",
        "alerts": "व्याख्यायोग्य संकेत" if locale == "hi" else "Explainable Leads",
    }
    story += [Paragraph(label["summary"], styles["Heading2"]), Paragraph(escape(case.description_hi if locale == "hi" and case.description_hi else case.description), styles["BodyText"]), Spacer(1, 8)]
    story += [Paragraph(label["evidence"], styles["Heading2"])]
    cell_style = ParagraphStyle("EvidenceCell",parent=styles["BodyText"],fontSize=7,leading=10,wordWrap="CJK")
    rows = [[Paragraph(value,cell_style) for value in ("ID", "Name", "SHA-256", "Status")]] + [[Paragraph(escape(value),cell_style) for value in (e.id, e.name, e.sha256, e.status)] for e in evidence]
    table = Table(rows, colWidths=[32*mm, 60*mm, 45*mm, 28*mm], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0b2e63")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .3, colors.grey), ("FONTSIZE", (0,0), (-1,-1), 8), ("VALIGN", (0,0), (-1,-1), "TOP")]))
    story += [table, Spacer(1, 8), Paragraph(label["timeline"], styles["Heading2"])]
    for event in events:
        story.append(Paragraph(f"{event.timestamp.isoformat()} - {event.title_hi if locale == 'hi' and event.title_hi else event.title} [{', '.join(event.evidence_ids)}]", styles["BodyText"]))
    story += [PageBreak(), Paragraph(label["relations"], styles["Heading2"])]
    for rel in relationships:
        story.append(Paragraph(f"{rel.source_id} -{rel.type}-> {rel.target_id} | confidence {rel.confidence:.0%} | {', '.join(rel.evidence_ids)}", styles["BodyText"]))
    story += [Spacer(1, 8), Paragraph(label["alerts"], styles["Heading2"])]
    for alert in alerts:
        story.append(Paragraph(f"{alert.title}: {alert.reason} ({alert.confidence:.0%}) [{', '.join(alert.evidence_ids)}]", styles["BodyText"]))
    story += [Spacer(1, 12), Paragraph("अभिरक्षा इतिहास" if locale == "hi" else "Chain of Custody",styles["Heading2"])]
    evidence_ids = [e.id for e in evidence]
    for custody in db.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id.in_(evidence_ids)).order_by(CustodyEvent.timestamp)):
        story.append(Paragraph(escape(f"{custody.evidence_id} | {custody.timestamp.isoformat()} | {custody.event} | {custody.actor_from or '-'} → {custody.actor_to or '-'} | {custody.location}"),styles["BodyText"]))
    story += [Spacer(1, 12), Paragraph("ब्लॉकचेन प्रमाण" if locale == "hi" else "Blockchain Proof",styles["Heading2"])]
    anchors = {a.evidence_id:a for a in db.scalars(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id.in_(evidence_ids)))}
    for item in evidence:
        anchor = anchors.get(item.id)
        text = f"{item.id}: NOT REGISTERED" if not anchor else f"{item.id}: block {anchor.block_number}, transaction {anchor.transaction_hash}"
        story.append(Paragraph(escape(text),cell_style))
    story += [Spacer(1, 16), Paragraph("Generated from stored investigation state. No finding establishes guilt. Human review is required before operational use.", styles["Italic"])]
    doc.build(story)
    return output.getvalue()


def new_verification_token() -> str:
    return secrets.token_urlsafe(32)
