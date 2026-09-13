import io
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .ingest import hash_file, safe_filename, validate_content
from .upload_limits import UploadLimitMiddleware
from .snapshot import snapshot
from .report_html import build_report_html

from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import (
    Alert, AuditLog, BlockchainAnchor, Case, CustodyEvent, Entity, Evidence,
    EvidenceAnalysis, EvidenceEntity, ProcessingJob, RefreshToken, Relationship,
    Report, TimelineEvent, User,
)
from .schemas import CaseCreate, CaseOut, CopilotQuery, CustodyCreate, EvidenceOut, LoginRequest, RefreshRequest, ReportRequest, TokenPair
from .security import create_token, current_user, decode_token, require_roles, verify_password
from .security import bearer
from fastapi.security import HTTPAuthorizationCredentials
from .seed import CASE_ID, DEMO_PASSWORD, reset_demo, seed_demo
from .services import (
    ALLOWED_MIME, analyze_evidence, blockchain, build_report_pdf, copilot_answer,
    graph_service, new_verification_token, qr_png, sha256_stream, storage,
)


app = FastAPI(title=settings.app_name, version="2.0.0", description="Evidence-first investigation prototype API")
app.add_middleware(UploadLimitMiddleware)

@app.exception_handler(HTTPException)
async def http_error(_request,exc):
    detail=exc.detail if isinstance(exc.detail,dict) else {"code":f"http_{exc.status_code}","message":str(exc.detail)}
    return JSONResponse(status_code=exc.status_code,content={"error":detail,"detail":detail},headers=exc.headers)

@app.exception_handler(RequestValidationError)
async def validation_error(_request,exc):
    detail={"code":"validation_error","message":"Invalid request fields.","fields":[{"field":".".join(str(p) for p in e["loc"]),"message":e["msg"]} for e in exc.errors()]}
    return JSONResponse(status_code=422,content={"error":detail,"detail":detail})
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:8443", "http://127.0.0.1:8443"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_demo(db)
        graph_service.sync_case(db, CASE_ID)
        graph_service.sync_case(db, "CASE-X007")


def audit(db: Session, user_id: str, action: str, target: str, metadata: dict | None = None):
    db.add(AuditLog(user_id=user_id, action=action, target=target, metadata_json=metadata or {}))


def case_payload(db: Session, case: Case) -> dict:
    payload = CaseOut.model_validate(case).model_dump()
    data=snapshot(db,case.id)
    payload["counts"] = {
        "evidence":len(data["evidence"]),"entities":len(data["nodes"]),
        "alerts":len(data["alerts"]),"relationships":len(data["edges"]),
    }
    return payload


@app.get("/health")
def health():
    return {"status": "ok", "service": "decypher-api", "version": "2.0.0"}


@app.get("/ready")
def ready(db: Session = Depends(get_db)):
    checks = {"database": False, "storage": False, "neo4j": False, "blockchain": False}
    try:
        db.execute(text("SELECT 1")); checks["database"] = True
        storage.ensure(); checks["storage"] = True
    except Exception:
        pass
    try:
        with graph_service._driver() as driver:
            driver.verify_connectivity(); checks["neo4j"] = True
    except Exception:
        pass
    try:
        checks["blockchain"] = httpx.get(f"{settings.blockchain_bridge_url}/health", timeout=2).is_success
    except Exception:
        pass
    if not all(checks.values()):
        raise HTTPException(503,detail={"code":"services_not_ready","message":"Required local services are unavailable.","checks":checks})
    return {"status": "ready", "checks": checks}


@app.post("/api/v1/auth/login", response_model=TokenPair)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials", "message": "Email or password is incorrect."})
    access, _, _ = create_token(user)
    refresh, jti, expires = create_token(user, "refresh")
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires))
    audit(db, user.id, "LOGIN", user.id)
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh, user={"id": user.id, "email": user.email, "name": user.name, "role": user.role})


@app.post("/api/v1/auth/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token, "refresh")
    record = db.scalar(select(RefreshToken).where(RefreshToken.jti==payload["jti"]).with_for_update())
    user = db.get(User, payload["sub"])
    if not record or record.revoked or not user or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": "revoked_token", "message": "Refresh token is no longer valid."})
    record.revoked = True
    access, _, _ = create_token(user)
    refresh_value, jti, expires = create_token(user, "refresh")
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires))
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh_value, user={"id": user.id, "email": user.email, "name": user.name, "role": user.role})


@app.post("/api/v1/auth/logout")
def logout(body: RefreshRequest, user: User = Depends(current_user), credentials:HTTPAuthorizationCredentials=Depends(bearer), db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
        record = db.get(RefreshToken, payload["jti"])
        if record and record.user_id==user.id: record.revoked = True
    except HTTPException:
        pass
    finally:
        access=decode_token(credentials.credentials)
        audit(db,user.id,"ACCESS_REVOKED",access["jti"]); audit(db, user.id, "LOGOUT", user.id); db.commit()
    return {"message": "Signed out."}


@app.get("/api/v1/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@app.get("/api/v1/demo/accounts")
def demo_accounts():
    return {"password": DEMO_PASSWORD, "accounts": [{"email": email, "name": name, "role": role} for _, email, name, role in __import__("app.seed", fromlist=["USERS"]).USERS]}


@app.get("/api/v1/cases")
def list_cases(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [case_payload(db, item) for item in db.scalars(select(Case).order_by(Case.updated_at.desc()))]


@app.post("/api/v1/cases", status_code=201)
def create_case(body: CaseCreate, user: User = Depends(require_roles("investigator", "senior", "admin")), db: Session = Depends(get_db)):
    unique=uuid4().hex
    case = Case(id=f"CASE-{unique}", case_number=f"DEMO/{unique}", title=body.title, description=body.description, priority=body.priority, lead_investigator=body.lead_investigator)
    db.add(case); audit(db, user.id, "CASE_CREATED", case.id); db.commit(); db.refresh(case)
    return case_payload(db, case)


@app.get("/api/v1/cases/{case_id}")
def get_case(case_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case: raise HTTPException(404, detail={"code":"case_not_found","message":"Case was not found."})
    return case_payload(db, case)

@app.get("/api/v1/cases/{case_id}/snapshot")
def case_snapshot(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    try: return snapshot(db,case_id)
    except KeyError: raise HTTPException(404,detail="Case was not found.")

@app.get("/api/v1/cases/{case_id}/report-preview")
def report_preview(case_id:str,locale:str="en",user:User=Depends(current_user),db:Session=Depends(get_db)):
    if locale not in ("en","hi"): raise HTTPException(422,detail="Supported locales: en, hi.")
    try: return {"html":build_report_html(db,case_id,locale)}
    except KeyError: raise HTTPException(404,detail="Case was not found.")


@app.get("/api/v1/evidence", response_model=list[EvidenceOut])
def list_evidence(case_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Evidence).order_by(Evidence.created_at.desc())
    if case_id: query = query.where(Evidence.case_id == case_id)
    return list(db.scalars(query))


@app.post("/api/v1/evidence", response_model=EvidenceOut, status_code=201)
def upload_evidence(case_id: str = Form(...), description: str = Form(""), file: UploadFile = File(...), user: User = Depends(require_roles("investigator", "senior", "forensics", "admin")), db: Session = Depends(get_db)):
    if not db.get(Case, case_id): raise HTTPException(404, detail={"code":"case_not_found","message":"Case was not found."})
    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_MIME: raise HTTPException(415, detail={"code":"unsupported_type","message":f"Unsupported evidence type: {mime}"})
    try: digest, size = hash_file(file.file)
    except ValueError as exc: raise HTTPException(413, detail={"code":"invalid_size","message":str(exc)}) from exc
    try: validate_content(file.file,mime)
    except ValueError as exc: raise HTTPException(415,detail={"code":"invalid_content","message":str(exc)}) from exc
    if db.scalar(select(Evidence).where(Evidence.sha256 == digest)):
        raise HTTPException(409, detail={"code":"duplicate_evidence","message":"An identical file is already registered."})
    evidence_id = f"EV-{uuid4().hex}"
    filename = safe_filename(file.filename)
    key = f"raw/case/{case_id}/{evidence_id}/original/{filename}"
    storage.put_file(key,file.file,size,mime)
    kind = "video" if mime.startswith("video/") else "audio" if mime.startswith("audio/") else "image" if mime.startswith("image/") else "data" if "csv" in mime else "document"
    evidence = Evidence(id=evidence_id, case_id=case_id, name=filename, description=description, type=kind, object_key=key, mime_type=mime, size=size, sha256=digest, status="hashed", registered_by=user.id, verification_token=new_verification_token())
    db.add(evidence)
    try: db.flush()
    except IntegrityError as exc:
        db.rollback(); storage.remove(key); raise HTTPException(409,detail="Identical evidence was concurrently uploaded.") from exc
    db.add(CustodyEvent(evidence_id=evidence_id, event="COLLECTED", actor_to=user.name, location="Secure intake portal", notes="Evidence uploaded")); db.add(CustodyEvent(evidence_id=evidence_id, event="HASHED", actor_to=user.name, notes=f"SHA-256 {digest}")); audit(db, user.id, "EVIDENCE_UPLOADED", evidence_id, {"caseId":case_id,"sha256":digest})
    try: db.commit()
    except IntegrityError as exc:
        db.rollback(); storage.remove(key); raise HTTPException(409,detail="Identical evidence was concurrently uploaded.") from exc
    db.refresh(evidence)
    return evidence


@app.get("/api/v1/evidence/{evidence_id}")
def get_evidence(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Evidence, evidence_id)
    if not item: raise HTTPException(404, detail={"code":"evidence_not_found","message":"Evidence was not found."})
    result = EvidenceOut.model_validate(item).model_dump()
    result["custody"] = [{"event":c.event,"timestamp":c.timestamp,"from":c.actor_from,"to":c.actor_to,"location":c.location,"notes":c.notes} for c in db.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id == evidence_id).order_by(CustodyEvent.timestamp))]
    result["analysis"] = [{"summary":a.summary,"confidence":a.confidence,"provider":a.provider,"result":a.result} for a in db.scalars(select(EvidenceAnalysis).where(EvidenceAnalysis.evidence_id == evidence_id))]
    anchor = db.scalar(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id == evidence_id))
    result["blockchain"] = anchor and {"network":anchor.network,"contractAddress":anchor.contract_address,"transactionHash":anchor.transaction_hash,"blockNumber":anchor.block_number,"registeredAt":anchor.registered_at}
    return result


@app.get("/api/v1/evidence/{evidence_id}/file")
def evidence_file(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Evidence, evidence_id)
    if not item: raise HTTPException(404, detail="Evidence was not found.")
    from urllib.parse import quote
    return StreamingResponse(storage.chunks(item.object_key), media_type=item.mime_type, headers={"Content-Disposition":f"inline; filename*=UTF-8''{quote(item.name)}","X-Content-Type-Options":"nosniff"})


@app.post("/api/v1/evidence/{evidence_id}/register")
def register_evidence(evidence_id: str, user: User = Depends(require_roles("senior", "forensics", "admin")), db: Session = Depends(get_db)):
    item = db.scalar(select(Evidence).where(Evidence.id==evidence_id).with_for_update())
    if not item: raise HTTPException(404, detail="Evidence was not found.")
    import hashlib
    digest=hashlib.sha256()
    for chunk in storage.chunks(item.object_key): digest.update(chunk)
    if digest.hexdigest()!=item.sha256: raise HTTPException(409,detail={"code":"evidence_modified","message":"Stored bytes were modified; registration refused."})
    existing = db.scalar(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id == evidence_id))
    if existing:
        live=blockchain.lookup(item.sha256)
        if live is None: raise HTTPException(503,detail="Cannot confirm the saved anchor while the live chain is unavailable.")
        if live.get("evidenceId")!=item.id or live.get("caseId")!=item.case_id or live.get("contractAddress","").lower()!=existing.contract_address.lower(): raise HTTPException(409,detail="The saved anchor is not present on this live chain; local chain may have been reset.")
        return {"status":"confirmed","transactionHash":existing.transaction_hash,"blockNumber":existing.block_number,"contractAddress":existing.contract_address,"network":existing.network}
    try: proof = blockchain.register(item, user.id)
    except RuntimeError as exc: raise HTTPException(503, detail={"code":"blockchain_unavailable","message":str(exc)}) from exc
    anchor = BlockchainAnchor(evidence_id=item.id, evidence_hash=item.sha256, network=proof["network"], contract_address=proof["contractAddress"], transaction_hash=proof["transactionHash"], block_number=proof["blockNumber"], registered_by=user.id)
    item.status = "registered"; item.registered_at = datetime.now(timezone.utc)
    db.add(anchor); db.add(CustodyEvent(evidence_id=item.id,event="REGISTERED",actor_to=user.name,notes=f"Blockchain transaction {proof['transactionHash']}")); audit(db,user.id,"EVIDENCE_REGISTERED",item.id,proof); db.commit()
    return {"status":"confirmed", **proof}


@app.get("/api/v1/evidence/{evidence_id}/blockchain")
def blockchain_proof(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    anchor = db.scalar(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id == evidence_id))
    if not anchor: return {"status":"not_registered","message":"No blockchain anchor exists for this evidence."}
    live=blockchain.lookup(anchor.evidence_hash)
    status="chain_unavailable" if live is None else "confirmed" if live.get("evidenceId")==evidence_id and live.get("contractAddress","").lower()==anchor.contract_address.lower() else "chain_mismatch"
    return {"status":status,"evidenceId":anchor.evidence_id,"evidenceHash":anchor.evidence_hash,"network":anchor.network,"contractAddress":anchor.contract_address,"transactionHash":anchor.transaction_hash,"blockNumber":anchor.block_number,"registeredAt":anchor.registered_at}


@app.post("/api/v1/evidence/{evidence_id}/analyze", status_code=202)
def analyze(evidence_id: str, user: User = Depends(require_roles("investigator","senior","forensics","admin")), db: Session = Depends(get_db)):
    item = db.get(Evidence, evidence_id)
    if not item: raise HTTPException(404, detail="Evidence was not found.")
    job = ProcessingJob(id=f"JOB-{uuid4().hex}",kind="analysis",target_id=item.id,status="queued",progress=0)
    db.add(job); audit(db,user.id,"ANALYSIS_QUEUED",item.id,{"jobId":job.id}); db.commit()
    return {"jobId":job.id,"status":job.status,"result":job.result,"error":job.error}


@app.post("/api/v1/evidence/{evidence_id}/verify")
def verify_evidence(evidence_id: str, file: UploadFile | None = File(None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Evidence,evidence_id)
    if not item: raise HTTPException(404,detail="Evidence was not found.")
    if file:
        try: current_hash,_=hash_file(file.file)
        except ValueError as exc: raise HTTPException(413,detail=str(exc)) from exc
    else:
        import hashlib
        digest=hashlib.sha256()
        for chunk in storage.chunks(item.object_key): digest.update(chunk)
        current_hash=digest.hexdigest()
    anchor = db.scalar(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id == evidence_id))
    hash_match = current_hash == item.sha256
    live=blockchain.lookup(item.sha256) if anchor else None
    chain_match = bool(live and live.get("evidenceId")==item.id and live.get("caseId")==item.case_id and live.get("evidenceHash","").removeprefix("0x").lower()==item.sha256 and live.get("contractAddress","").lower()==anchor.contract_address.lower())
    state = "MODIFIED" if not hash_match else "CHAIN_UNAVAILABLE" if anchor and live is None else "VERIFIED" if chain_match else "CHAIN_MISMATCH" if anchor else "NOT_REGISTERED"
    db.add(CustodyEvent(evidence_id=item.id,event="VERIFIED" if state=="VERIFIED" else "VERIFICATION_CHECK",actor_to=user.name,notes=f"Result: {state}")); audit(db,user.id,"EVIDENCE_VERIFIED",item.id,{"result":state}); db.commit()
    return {"status":state,"currentHash":current_hash,"registeredHash":item.sha256,"hashMatch":hash_match,"blockchainMatch":chain_match,"checkedLiveContract":bool(anchor)}


@app.get("/api/v1/evidence/{evidence_id}/qr")
def evidence_qr(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Evidence,evidence_id)
    if not item: raise HTTPException(404,detail="Evidence was not found.")
    return Response(qr_png(item),media_type="image/png",headers={"Content-Disposition":f'inline; filename="{item.id}-qr.png"'})


@app.get("/api/v1/verify/{token}")
def public_verify(token: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Evidence).where(Evidence.verification_token == token))
    if not item: raise HTTPException(404,detail={"code":"verification_not_found","message":"QR evidence identity was not found."})
    anchor = db.scalar(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id == item.id))
    live=blockchain.lookup(item.sha256) if anchor else None
    confirmed=bool(live and live.get("evidenceId")==item.id and live.get("caseId")==item.case_id and live.get("contractAddress","").lower()==anchor.contract_address.lower())
    return {"evidenceId":item.id,"caseId":item.case_id,"name":item.name,"type":item.type,"sha256":item.sha256,"status":"CHAIN_UNAVAILABLE" if anchor and live is None else "ANCHORED" if confirmed else "NOT_REGISTERED","blockchainRegistered":confirmed,"transactionHash":anchor.transaction_hash if confirmed else None,"registeredAt":anchor.registered_at if confirmed else None}


@app.post("/api/v1/evidence/{evidence_id}/custody")
def add_custody(evidence_id: str, body: CustodyCreate, user: User = Depends(require_roles("senior","forensics","admin")), db: Session = Depends(get_db)):
    if not db.get(Evidence,evidence_id): raise HTTPException(404,detail="Evidence was not found.")
    latest=db.scalar(select(CustodyEvent).where(CustodyEvent.evidence_id==evidence_id,CustodyEvent.event.in_(["COLLECTED","TRANSFERRED","RECEIVED","SEALED","RELEASED"])).order_by(CustodyEvent.timestamp.desc(),CustodyEvent.id.desc()).limit(1))
    allowed={"TRANSFERRED":{"RECEIVED"},"RELEASED":{"RECEIVED"},"SEALED":{"TRANSFERRED","RELEASED","REVIEWED"}}
    if latest and latest.event in allowed and body.event not in allowed[latest.event]: raise HTTPException(409,detail="Invalid custody transition; receive transferred evidence before another operation.")
    if body.event=="RECEIVED" and (not latest or latest.event not in ("TRANSFERRED","RELEASED")): raise HTTPException(409,detail="Evidence has not been transferred or released.")
    if not body.actor_to.strip() or (body.event=="TRANSFERRED" and (not body.actor_from.strip() or body.actor_from==body.actor_to)): raise HTTPException(422,detail="Custody actors must be supplied; a transfer requires different actors.")
    if latest and body.event=="TRANSFERRED" and body.actor_from!=latest.actor_to: raise HTTPException(409,detail="Transfer must originate from the current custodian.")
    row = CustodyEvent(evidence_id=evidence_id,event=body.event,actor_from=body.actor_from,actor_to=body.actor_to,location=body.location,notes=body.notes)
    db.add(row); audit(db,user.id,"EVIDENCE_TRANSFERRED",evidence_id,{"event":row.event}); db.commit()
    return {"message":"Custody event recorded.","event":row.event}


@app.get("/api/v1/jobs/{job_id}")
def job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(ProcessingJob,job_id)
    if not row: raise HTTPException(404,detail="Job was not found.")
    return {"id":row.id,"kind":row.kind,"targetId":row.target_id,"status":row.status,"progress":row.progress,"result":row.result,"error":row.error}

@app.post("/api/v1/jobs/{job_id}/retry",status_code=202)
def retry_job(job_id:str,user:User=Depends(require_roles("senior","forensics","admin")),db:Session=Depends(get_db)):
    row=db.scalar(select(ProcessingJob).where(ProcessingJob.id==job_id).with_for_update())
    if not row: raise HTTPException(404,detail="Job was not found.")
    if row.status!="failed" or row.attempts>=3: raise HTTPException(409,detail="Only failed jobs below three attempts can be retried.")
    row.status="queued"; row.error=""; row.progress=0; audit(db,user.id,"JOB_RETRIED",row.id); db.commit()
    return {"jobId":row.id,"status":row.status}


def graph_payload(db: Session, case_id: str):
    if not db.get(Case,case_id): raise HTTPException(404,detail="Case was not found.")
    rels=list(db.scalars(select(Relationship).where(Relationship.case_id==case_id)))
    linked=list(db.execute(select(EvidenceEntity.entity_id,EvidenceEntity.evidence_id).join(Evidence,Evidence.id==EvidenceEntity.evidence_id).where(Evidence.case_id==case_id)))
    ids={i for r in rels for i in (r.source_id,r.target_id)}|{a[0] for a in linked}; entities=list(db.scalars(select(Entity).where(Entity.id.in_(ids))))
    evidence_counts={entity.id:len({a[1] for a in linked if a[0]==entity.id}|{ev for r in rels if entity.id in (r.source_id,r.target_id) for ev in r.evidence_ids}) for entity in entities}
    return {"nodes":[{"id":e.id,"label":e.canonical_name,"labelHi":e.canonical_name_hi,"type":e.type,"properties":e.properties,"evidenceCount":evidence_counts[e.id]} for e in entities],"edges":[{"id":r.id,"source":r.source_id,"target":r.target_id,"type":r.type,"confidence":r.confidence,"evidenceIds":r.evidence_ids,"timestamp":r.timestamp} for r in rels]}


@app.get("/api/v1/cases/{case_id}/graph")
def case_graph(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)): return graph_payload(db,case_id)


@app.get("/api/v1/cases/{case_id}/timeline")
def case_timeline(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"id":e.id,"timestamp":e.timestamp,"type":e.type,"title":e.title,"titleHi":e.title_hi,"description":e.description,"entityIds":e.entity_ids,"evidenceIds":e.evidence_ids,"location":e.location,"confidence":e.confidence} for e in db.scalars(select(TimelineEvent).where(TimelineEvent.case_id==case_id).order_by(TimelineEvent.timestamp))]


@app.get("/api/v1/cases/{case_id}/map")
def case_map(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"eventId":e.id,"title":e.title,"timestamp":e.timestamp,"location":e.location,"entityIds":e.entity_ids,"evidenceIds":e.evidence_ids} for e in db.scalars(select(TimelineEvent).where(TimelineEvent.case_id==case_id)) if e.location]


@app.get("/api/v1/cases/{case_id}/network")
def network(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    graph=graph_payload(db,case_id); degree={n["id"]:0 for n in graph["nodes"]}
    for edge in graph["edges"]: degree[edge["source"]]+=1; degree[edge["target"]]+=1
    ranking=sorted(({"entityId":key,"connections":value,"classification":"Highly Connected Entity" if value>=3 else "Investigative Lead"} for key,value in degree.items()),key=lambda x:x["connections"],reverse=True)
    return {"ranking":ranking,"bridgeEntities":[x for x in ranking if x["entityId"]=="PERSON-P004"],"disclaimer":"Graph metrics identify investigative leads, not guilt."}


@app.get("/api/v1/cases/{case_id}/related")
def related(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    try: current=snapshot(db,case_id)
    except KeyError: raise HTTPException(404,detail="Case was not found.")
    ids={n["id"] for n in current["nodes"]}; results=[]
    for case in db.scalars(select(Case).where(Case.id!=case_id)):
        other=snapshot(db,case.id); shared=ids & {n["id"] for n in other["nodes"]}
        if shared: results.append({"id":case.id,"title":case.title,"titleHi":case.title_hi,"sharedEntities":sorted(shared),"evidenceIds":sorted({e for n in other["nodes"] if n["id"] in shared for e in n["evidenceIds"]})})
    return {"caseId":case_id,"relatedCases":results}


@app.post("/api/v1/copilot/query")
def copilot(body:CopilotQuery,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if not db.get(Case,body.case_id): raise HTTPException(404,detail="Case was not found.")
    answer=copilot_answer(db,body.case_id,body.question,body.locale); audit(db,user.id,"COPILOT_QUERY",body.case_id,{"citations":answer["citations"]}); db.commit(); return answer


@app.get("/api/v1/cases/{case_id}/reports")
def reports(case_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"id":r.id,"caseId":r.case_id,"locale":r.locale,"createdAt":r.created_at} for r in db.scalars(select(Report).where(Report.case_id==case_id).order_by(Report.created_at.desc()))]


@app.post("/api/v1/cases/{case_id}/reports",status_code=202)
def generate_report(case_id:str,body:ReportRequest,user:User=Depends(require_roles("investigator","senior","admin")),db:Session=Depends(get_db)):
    case=db.get(Case,case_id)
    if not case: raise HTTPException(404,detail="Case was not found.")
    job=ProcessingJob(id=f"JOB-{uuid4().hex}",kind="report",target_id=case_id,status="queued",progress=0,result={"locale":body.locale,"createdBy":user.id})
    db.add(job); audit(db,user.id,"REPORT_QUEUED",case_id,{"jobId":job.id}); db.commit()
    return {"jobId":job.id,"status":job.status}


@app.get("/api/v1/reports/{report_id}/download")
def download_report(report_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=db.get(Report,report_id)
    if not row: raise HTTPException(404,detail="Report was not found.")
    return StreamingResponse(io.BytesIO(storage.get(row.object_key)),media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="{row.case_id}-{row.locale}.pdf"'})

@app.get("/api/v1/reports/{report_id}/preview")
def saved_report_preview(report_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=db.get(Report,report_id)
    if not row: raise HTTPException(404,detail="Report was not found.")
    try: return {"html":storage.get(row.object_key.removesuffix(".pdf")+".html").decode()}
    except Exception: raise HTTPException(404,detail="This older report has no saved HTML preview.")


@app.post("/api/v1/admin/reset-demo")
def reset(user:User=Depends(require_roles("admin")),db:Session=Depends(get_db)):
    graph_service.reset(); reset_demo(db); graph_service.sync_case(db,CASE_ID); audit(db,user.id,"DEMO_RESET",CASE_ID); db.commit(); return {"message":"Demo data reset.","caseId":CASE_ID}


@app.get("/api/v1/audit")
def audit_log(user:User=Depends(require_roles("senior","admin")),db:Session=Depends(get_db)):
    return [{"timestamp":r.timestamp,"userId":r.user_id,"action":r.action,"target":r.target,"metadata":r.metadata_json} for r in db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(200))]
