import io
import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/decypher-test.db"
os.environ["STORAGE_PROVIDER"] = "filesystem"
os.environ["STORAGE_PATH"] = "/tmp/decypher-test-storage"

from fastapi.testclient import TestClient

from app.main import app
from app.services import sha256_stream
from app.services import build_report_pdf
from app.database import SessionLocal
from app.models import Case
from app.worker import run_once
from app.services import graph_service
from uuid import uuid4


def auth_headers(client: TestClient, email="investigator@decypher.example"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "DemoAccess2026!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_hash_is_deterministic_and_changes_with_content():
    first, _ = sha256_stream(io.BytesIO(b"same evidence"))
    second, _ = sha256_stream(io.BytesIO(b"same evidence"))
    changed, _ = sha256_stream(io.BytesIO(b"changed evidence"))
    assert first == second
    assert first != changed


def test_case_graph_and_grounded_copilot():
    Path("/tmp/decypher-test.db").unlink(missing_ok=True)
    with TestClient(app) as client:
        headers = auth_headers(client)
        case = client.get("/api/v1/cases/CASE-2026-017", headers=headers)
        assert case.status_code == 200
        graph = client.get("/api/v1/cases/CASE-2026-017/graph", headers=headers).json()
        assert graph["nodes"] and graph["edges"]
        answer = client.post("/api/v1/copilot/query", headers=headers, json={"case_id":"CASE-2026-017","question":"Why is Vikram Singh important?","locale":"en"})
        assert answer.status_code == 200
        assert "EV-2026-0007" in answer.json()["citations"]


def test_upload_hash_and_unregistered_verification():
    with TestClient(app) as client:
        headers = auth_headers(client)
        payload = b"Unique fictional evidence for API test"
        created = client.post("/api/v1/evidence", headers=headers, data={"case_id":"CASE-2026-017","description":"Test evidence document"}, files={"file":("test.txt",payload,"text/plain")})
        assert created.status_code == 201
        evidence_id = created.json()["id"]
        verified = client.post(f"/api/v1/evidence/{evidence_id}/verify", headers=headers)
        assert verified.status_code == 200
        assert verified.json()["status"] == "NOT_REGISTERED"
        modified = client.post(f"/api/v1/evidence/{evidence_id}/verify", headers=headers, files={"file":("changed.txt",b"tampered","text/plain")})
        assert modified.json()["status"] == "MODIFIED"


def test_role_protects_blockchain_registration():
    with TestClient(app) as client:
        headers = auth_headers(client)
        response = client.post("/api/v1/evidence/EV-2026-0001/register", headers=headers)
        assert response.status_code == 403


def test_analysis_and_reports_are_queued_and_qr_is_real():
    with TestClient(app) as client:
        headers = auth_headers(client)
        analysis = client.post("/api/v1/evidence/EV-2026-0001/analyze", headers=headers)
        assert analysis.status_code == 202
        state = client.get(f"/api/v1/jobs/{analysis.json()['jobId']}", headers=headers).json()
        assert state["status"] == "queued"
        report = client.post("/api/v1/cases/CASE-2026-017/reports", headers=headers, json={"locale":"en"})
        assert report.status_code == 202
        qr = client.get("/api/v1/evidence/EV-2026-0001/qr", headers=headers)
        assert qr.content.startswith(b"\x89PNG")
        with SessionLocal() as db:
            for locale in ("en", "hi"):
                pdf = build_report_pdf(db, db.get(Case, "CASE-2026-017"), locale)
                assert pdf.startswith(b"%PDF") and len(pdf) > 1000
                if locale == "hi":
                    from reportlab.pdfbase import pdfmetrics
                    # Generate English then Hindi in the same worker process:
                    # Hindi must not silently reuse the English-only font.
                    assert pdfmetrics.getFont("CaseReportHi").face.charToGlyph.get(ord("ह"))
                    assert pdfmetrics.getFont("CaseReportEn").face.charToGlyph.get(ord("A"))

def test_bilingual_pdf_keeps_latin_identity_and_escapes_source_markup():
    from app.reports import report_text
    text=report_text("साक्ष्य EV-2026-0001 SHA-256 abcdef0123456789 <source>",True)
    assert '<font name="CaseReportHi">साक्ष्य</font>' in text
    assert "EV-2026-0001 SHA-256 abcdef0123456789 &lt;source&gt;" in text
    assert report_text("<font>source</font>")=="&lt;font&gt;source&lt;/font&gt;"
    assert report_text("साक्ष्य-समर्थित है;",True)=='<font name="CaseReportHi">साक्ष्य-समर्थित</font> <font name="CaseReportHi">है;</font>'

def test_new_case_isolation_processing_and_report_worker(monkeypatch):
    monkeypatch.setattr(graph_service,"sync_case",lambda *args,**kwargs:True)
    with TestClient(app) as client:
        headers=auth_headers(client,"admin@decypher.example")
        case=client.post("/api/v1/cases",headers=headers,json={"title":"Isolated case","description":"Synthetic case isolation test"}).json()
        empty=client.get(f"/api/v1/cases/{case['id']}/snapshot",headers=headers).json()
        assert not empty["nodes"] and not empty["evidence"]
        raw=f"transaction_id,timestamp,from_entity,to_account,amount_inr\n{uuid4()},2026-09-10T22:04:00+05:30,Arjun Verma,4821,245000\n".encode()
        item=client.post("/api/v1/evidence",headers=headers,data={"case_id":case["id"]},files={"file":("money.csv",raw,"text/csv")}).json()
        assert item["id"].startswith("EV-") and len(item["id"])>30
        job=client.post(f"/api/v1/evidence/{item['id']}/analyze",headers=headers).json()
        for _ in range(20):
            run_once()
            state=client.get(f"/api/v1/jobs/{job['jobId']}",headers=headers).json()
            if state["status"]=="succeeded":break
        assert state["status"]=="succeeded"
        snap=client.get(f"/api/v1/cases/{case['id']}/snapshot",headers=headers).json()
        assert snap["edges"] and snap["timeline"] and snap["alerts"]
        assert all(edge["evidenceIds"]==[item["id"]] for edge in snap["edges"])
        job=client.post(f"/api/v1/cases/{case['id']}/reports",headers=headers,json={"locale":"hi"}).json()
        run_once();result=client.get(f"/api/v1/jobs/{job['jobId']}",headers=headers).json()
        assert result["status"]=="succeeded"
        assert client.get(result["result"]["downloadUrl"],headers=headers).content.startswith(b"%PDF")

def test_content_validation_and_custody_transitions():
    with TestClient(app) as client:
        headers=auth_headers(client,"forensics@decypher.example")
        bad=client.post("/api/v1/evidence",headers=headers,data={"case_id":"CASE-2026-017"},files={"file":("fake.png",b"not an image","image/png")})
        assert bad.status_code==415 and bad.json()["error"]["code"]=="invalid_content"
        result=client.post("/api/v1/evidence/EV-2026-0001/custody",headers=headers,json={"event":"RECEIVED","actor_to":"Reviewer"})
        assert result.status_code==409
        transfer={"event":"TRANSFERRED","actor_from":"Investigator Aditi Rao","actor_to":"Reviewer"}
        assert client.post("/api/v1/evidence/EV-2026-0001/custody",headers=headers,json=transfer).status_code==200
        assert client.post("/api/v1/evidence/EV-2026-0001/custody",headers=headers,json=transfer).status_code==409

def test_refresh_rotation_logout_and_unknown_verification():
    with TestClient(app) as client:
        session=client.post("/api/v1/auth/login",json={"email":"admin@decypher.example","password":"DemoAccess2026!"}).json()
        rotated=client.post("/api/v1/auth/refresh",json={"refresh_token":session["refresh_token"]})
        assert rotated.status_code==200
        assert client.post("/api/v1/auth/refresh",json={"refresh_token":session["refresh_token"]}).status_code==401
        headers={"Authorization":f"Bearer {rotated.json()['access_token']}"}
        assert client.post("/api/v1/auth/logout",headers=headers,json={"refresh_token":rotated.json()["refresh_token"]}).status_code==200
        assert client.get("/api/v1/auth/me",headers=headers).status_code==401
        assert client.get("/api/v1/verify/not-a-real-token").status_code==404

def test_oversized_body_is_rejected_before_spooling(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings,"max_upload_bytes",16)
    with TestClient(app) as client:
        response=client.post("/api/v1/evidence",content=b"x",headers={"Content-Length":"2000000","Content-Type":"multipart/form-data; boundary=test"})
        assert response.status_code==413 and response.json()["error"]["code"]=="upload_too_large"
