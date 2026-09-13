"""Deterministic, evidence-grounded extraction; no inferred media recognition."""
import csv
import hashlib
import io
import json
import math
import re
import wave
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree
from sqlalchemy import select
from .models import Alert, Entity, EvidenceEntity, Relationship, TimelineEvent

LOCATIONS = {
    "Connaught Place": (28.6315,77.2167), "Gurugram": (28.4595,77.0266),
    "Gurugram Warehouse": (28.4595,77.0266), "Noida Sector 62": (28.627,77.3723),
}
PHONE_NAMES = {"9810001101":"Raj Mehta","9810001202":"Arjun Verma","9810001404":"Vikram Singh"}

def stable_id(prefix,*parts):
    return f"{prefix}-{hashlib.sha256('|'.join(parts).encode()).hexdigest()[:20]}"

def entity(db,name,kind):
    normalized = " ".join(name.strip().split())
    result = next((e for e in db.scalars(select(Entity)) if e.type == kind and normalized.casefold() in [e.canonical_name.casefold(),*(a.casefold() for a in e.aliases)]),None)
    if not result:
        result = Entity(id=stable_id(kind,normalized.casefold()),canonical_name=normalized,type=kind,aliases=[],properties={})
        db.add(result); db.flush()
    return result

def bind(db,item,node,excerpt,confidence=.94):
    if not db.scalar(select(EvidenceEntity).where(EvidenceEntity.evidence_id==item.id,EvidenceEntity.entity_id==node.id)):
        db.add(EvidenceEntity(evidence_id=item.id,entity_id=node.id,confidence=confidence,source_excerpt=excerpt[:1500])); db.flush()

def relation(db,item,source,target,kind,stamp,excerpt,confidence=.94):
    stamp=stamp.astimezone(timezone.utc) if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
    bind(db,item,source,excerpt,confidence); bind(db,item,target,excerpt,confidence)
    key = stable_id("REL",item.id,source.id,target.id,kind,stamp.isoformat())
    if not db.get(Relationship,key):
        db.add(Relationship(id=key,case_id=item.case_id,source_id=source.id,target_id=target.id,type=kind,confidence=confidence,evidence_ids=[item.id],timestamp=stamp)); db.flush()

def event(db,item,key,stamp,kind,title,nodes,location=None,confidence=.94):
    stamp=stamp.astimezone(timezone.utc) if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
    event_id = stable_id("EVENT",item.id,key)
    if not db.get(TimelineEvent,event_id):
        loc = {"name":location,"lat":LOCATIONS[location][0],"lng":LOCATIONS[location][1]} if location in LOCATIONS else {}
        db.add(TimelineEvent(id=event_id,case_id=item.case_id,timestamp=stamp,type=kind,title=title,description=title,entity_ids=[n.id for n in nodes],evidence_ids=[item.id],location=loc,confidence=confidence)); db.flush()

def text_content(item,raw):
    if item.mime_type == "application/pdf":
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)[:200_000]
    if item.mime_type.endswith("wordprocessingml.document"):
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
            return " ".join(root.itertext())[:200_000]
    if "csv" in item.mime_type:return raw.decode("utf-8-sig")
    if item.mime_type.startswith("text/"):return raw.decode("utf-8-sig")[:200_000]
    return ""

def extract(db,item,raw):
    text = text_content(item,raw); metadata = {}; findings = []
    rows=[]
    if "csv" in item.mime_type:
        for index,row in enumerate(csv.DictReader(io.StringIO(text))):
            if index>=10_000:raise ValueError("Prototype analysis supports at most 10,000 CSV rows.")
            rows.append(row)
    for row in rows:
        excerpt = json.dumps(row,ensure_ascii=False)
        try:
            if {"caller","receiver","start_time"} <= row.keys():
                stamp = datetime.fromisoformat(row["start_time"])
                if stamp.tzinfo is None: raise ValueError("CSV timestamp requires a timezone.")
                phones = [entity(db,"+91 " + re.sub(r"\D","",row[k])[-10:],"PHONE") for k in ("caller","receiver")]
                relation(db,item,*phones,"CALLED",stamp,excerpt)
                people = []
                for key,phone in zip(("caller","receiver"),phones):
                    digits = re.sub(r"\D","",row[key])[-10:]
                    if digits in PHONE_NAMES and PHONE_NAMES[digits] in row.get("source_note",""):
                        person = entity(db,PHONE_NAMES[digits],"PERSON"); people.append(person)
                        relation(db,item,person,phone,"USES_PHONE",stamp,excerpt)
                if len(people)==2: relation(db,item,*people,"CALLED",stamp,excerpt)
                location = row.get("tower_location")
                if location in LOCATIONS:
                    node = entity(db,location,"LOCATION"); relation(db,item,phones[0],node,"RECORDED_AT",stamp,excerpt)
                event(db,item,row.get("record_id",excerpt),stamp,"CALL",f"{row['caller']} → {row['receiver']}",[*people,*phones],location)
                findings.append({"text":"Call-detail record with timestamp and tower location","textHi":"समय और टावर स्थान सहित कॉल रिकॉर्ड","evidenceIds":[item.id]})
            elif {"timestamp","from_entity","to_account","amount_inr"} <= row.keys():
                stamp = datetime.fromisoformat(row["timestamp"])
                if stamp.tzinfo is None: raise ValueError("CSV timestamp requires a timezone.")
                amount = float(row["amount_inr"])
                if not math.isfinite(amount) or amount < 0: raise ValueError("Transaction amount must be finite and non-negative.")
                person = entity(db,row["from_entity"],"PERSON"); account = entity(db,"A/C ending " + row["to_account"],"ACCOUNT")
                relation(db,item,person,account,"TRANSFERRED_TO",stamp,excerpt)
                event(db,item,row.get("transaction_id",excerpt),stamp,"TRANSACTION",f"{row['from_entity']} → {row['to_account']}: INR {amount:,.0f}",[person,account])
                if amount >= 200_000:
                    key = stable_id("ALERT",item.id,excerpt)
                    if not db.get(Alert,key): db.add(Alert(id=key,case_id=item.case_id,title="Large transfer: manual review",reason=f"INR {amount:,.0f} meets the synthetic demo threshold of INR 200,000; not a regulatory or guilt determination.",confidence=1,evidence_ids=[item.id]))
                findings.append({"text":f"Recorded transfer of INR {amount:,.0f}","textHi":f"दर्ज धन हस्तांतरण: INR {amount:,.0f}","evidenceIds":[item.id]})
        except (ValueError,KeyError) as exc:
            raise ValueError(f"Invalid structured evidence row: {exc}") from exc
    if item.mime_type.startswith("image/"):
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as image: metadata={"width":image.width,"height":image.height,"format":image.format}
    elif item.mime_type in ("audio/wav","audio/x-wav"):
        with wave.open(io.BytesIO(raw)) as audio: metadata={"durationSeconds":audio.getnframes()/audio.getframerate(),"sampleRate":audio.getframerate(),"channels":audio.getnchannels()}
    elif item.mime_type.startswith(("video/","audio/")):
        metadata={"bytes":len(raw),"note":"No speech or computer-vision recognition performed."}
    fixture_root = Path("/app/data/demo") if Path("/app/data/demo").exists() else Path("data/demo")
    for filename in ("nightfall-cctv-still.png","nightfall-cctv.mp4","nightfall-audio.wav"):
        path=fixture_root/filename
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==item.sha256:
            metadata["provenance"]="Exact synthetic demo artifact; curated caption, not recognition."
            vehicle=entity(db,"DL01AB1234","VEHICLE"); location=entity(db,"Gurugram Warehouse","LOCATION")
            stamp=datetime.fromisoformat("2026-09-10T21:15:00+05:30")
            relation(db,item,vehicle,location,"CAPTIONED_AT",stamp,metadata["provenance"],.85)
            event(db,item,"caption",stamp,"SIGHTING","Synthetic caption: vehicle at Gurugram warehouse",[vehicle,location],"Gurugram Warehouse",.85)
            findings.append({"text":metadata["provenance"],"textHi":"सटीक काल्पनिक नमूना; मानव-लिखित विवरण, पहचान मॉडल नहीं।","evidenceIds":[item.id]})
    if "Vikram Singh" in text and "DL01AB1234" in text and "CASE-X007" in text:
        person=entity(db,"Vikram Singh","PERSON"); vehicle=entity(db,"DL01AB1234","VEHICLE"); case=entity(db,"Operation Northbridge","CASE")
        # Intake time is not occurrence time. Only the exact curated fixture has
        # a known story timestamp; other notes are explicitly dated at intake.
        note=fixture_root/"nightfall-investigation-note.txt"
        is_demo=note.exists() and hashlib.sha256(note.read_bytes()).hexdigest()==item.sha256
        stamp=datetime.fromisoformat("2026-09-11T08:10:00+05:30") if is_demo else item.created_at
        relation(db,item,person,vehicle,"MENTIONED_WITH",stamp,text,.8)
        relation(db,item,person,case,"MENTIONED_IN",stamp,text,.8)
        if "Arjun Verma" in text and "DL03XY4521" in text and "Noida Sector 62" in text:
            arjun=entity(db,"Arjun Verma","PERSON"); second=entity(db,"DL03XY4521","VEHICLE"); noida=entity(db,"Noida Sector 62","LOCATION")
            relation(db,item,arjun,second,"MENTIONED_WITH",stamp,text,.65)
            relation(db,item,second,noida,"MENTIONED_WITH",stamp,text,.65)
        event(db,item,"cross-case",stamp,"CROSS_CASE","Source note connects Vikram, vehicle and Northbridge" if is_demo else "Source note cross-case mention (intake time)",[person,vehicle,case],confidence=.8)
        key=stable_id("ALERT",item.id,"cross-case")
        if not db.get(Alert,key): db.add(Alert(id=key,case_id=item.case_id,title="Cross-case mention: review required",reason="A source note mentions Vikram, vehicle and Northbridge together; corroboration is required.",confidence=.8,evidence_ids=[item.id]))
    db.flush()
    return text,metadata,findings
