"""Opt-in tests for an isolated local Compose demo, never a cloud service."""
import hashlib
import os
from uuid import uuid4
import httpx
import pytest
from neo4j import GraphDatabase
pytestmark=pytest.mark.skipif(os.getenv("DECYPHER_INTEGRATION")!="1",reason="Requires healthy local Compose services")

def test_storage_chain_graph_and_job_pipeline():
    base=os.getenv("TEST_API_URL","http://localhost:8000")
    with httpx.Client(base_url=base,timeout=120) as client:
        assert client.get("/ready").is_success
        session=client.post("/api/v1/auth/login",json={"email":"admin@decypher.example","password":"DemoAccess2026!"}).json();headers={"Authorization":f"Bearer {session['access_token']}"}
        payload=f"transaction_id,timestamp,from_entity,to_account,amount_inr\n{uuid4()},2026-09-10T22:04:00+05:30,Arjun Verma,4821,245000\n".encode()
        result=client.post("/api/v1/evidence",headers=headers,data={"case_id":"CASE-2026-017"},files={"file":("integration.csv",payload,"text/csv")});assert result.status_code==201;item=result.json()
        assert item["sha256"]==hashlib.sha256(payload).hexdigest()
        assert client.get(f"/api/v1/evidence/{item['id']}/file",headers=headers).content==payload
        proof=client.post(f"/api/v1/evidence/{item['id']}/register",headers=headers);assert proof.status_code==200 and proof.json()["transactionHash"].startswith("0x")
        assert client.post(f"/api/v1/evidence/{item['id']}/verify",headers=headers).json()["status"]=="VERIFIED"
        job=client.post(f"/api/v1/evidence/{item['id']}/analyze",headers=headers).json()
        import time
        for _ in range(60):
            state=client.get(f"/api/v1/jobs/{job['jobId']}",headers=headers).json()
            if state["status"] in ("succeeded","failed"):break
            time.sleep(1)
        assert state["status"]=="succeeded",state
        with GraphDatabase.driver("bolt://localhost:7687",auth=("neo4j",os.getenv("NEO4J_PASSWORD","ige_dev_password"))) as driver:
            record=driver.execute_query("MATCH ()-[r:RELATED]->() WHERE $id IN r.evidenceIds RETURN count(r) AS n",id=item["id"]).records[0]
            assert record["n"]>0

def test_admin_reset_is_explicitly_opted_in():
    if os.getenv("DEMO_RESET_ALLOWED")!="1": pytest.skip("Set DEMO_RESET_ALLOWED=1 only for an isolated demo")
    with httpx.Client(base_url="http://localhost:8000",timeout=120) as client:
        session=client.post("/api/v1/auth/login",json={"email":"admin@decypher.example","password":"DemoAccess2026!"}).json();headers={"Authorization":f"Bearer {session['access_token']}"}
        assert client.post("/api/v1/admin/reset-demo",headers=headers).is_success
        assert len(client.get("/api/v1/cases/CASE-2026-017/snapshot",headers=headers).json()["evidence"])==7
