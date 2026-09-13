"""Real local Hardhat/ethers verification; PostgreSQL/MinIO tested separately."""
import os
from uuid import uuid4
import pytest
from sqlalchemy import delete
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.database import SessionLocal
from app.models import BlockchainAnchor
pytestmark=pytest.mark.skipif(os.getenv("DECYPHER_CHAIN_TEST")!="1",reason="Requires local Hardhat and ethers bridge")

def test_actual_receipt_live_integrity_and_recovery(monkeypatch):
    monkeypatch.setattr(settings,"blockchain_bridge_url","http://127.0.0.1:8787")
    with TestClient(app) as client:
        session=client.post("/api/v1/auth/login",json={"email":"admin@decypher.example","password":"DemoAccess2026!"}).json()
        headers={"Authorization":f"Bearer {session['access_token']}"}
        raw=f"Fictional live-chain evidence {uuid4()}".encode()
        item=client.post("/api/v1/evidence",headers=headers,data={"case_id":"CASE-2026-017"},files={"file":("chain.txt",raw,"text/plain")}).json()
        url=f"/api/v1/evidence/{item['id']}"
        proof=client.post(url+"/register",headers=headers)
        assert proof.status_code==200,proof.text
        assert len(proof.json()["transactionHash"])==66
        assert client.post(url+"/verify",headers=headers).json()["status"]=="VERIFIED"
        assert client.get(url+"/blockchain",headers=headers).json()["status"]=="confirmed"
        assert client.post(url+"/verify",headers=headers,files={"file":("modified.txt",b"tampered","text/plain")}).json()["status"]=="MODIFIED"
        with SessionLocal() as db:
            db.execute(delete(BlockchainAnchor).where(BlockchainAnchor.evidence_id==item["id"]));db.commit()
        recovered=client.post(url+"/register",headers=headers)
        assert recovered.status_code==200,recovered.text
        assert recovered.json()["transactionHash"]==proof.json()["transactionHash"]
