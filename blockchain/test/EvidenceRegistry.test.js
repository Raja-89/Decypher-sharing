import assert from "node:assert/strict";
import hre from "hardhat";

const { ethers } = hre;

describe("EvidenceRegistry", function () {
  it("registers and retrieves evidence, then rejects a duplicate", async function () {
    const registry = await ethers.deployContract("EvidenceRegistry");
    const hash = ethers.sha256(ethers.toUtf8Bytes("fictional-evidence"));
    const receipt = await (await registry.registerEvidence(hash, "CASE-001", "EV-001", "USR-001")).wait();
    const event = receipt.logs.map(log => registry.interface.parseLog(log)).find(log => log?.name === "EvidenceRegistered");
    assert.ok(event, "registration must emit its provenance event");
    assert.equal(await registry.isEvidenceRegistered(hash), true);
    const record = await registry.getEvidence(hash);
    assert.equal(record.evidenceId, "EV-001");
    assert.equal(record.evidenceHash,hash);
    assert.equal(record.caseId,"CASE-001");
    assert.equal(event.args.evidenceHash,hash);
    await assert.rejects(registry.registerEvidence(hash, "CASE-001", "EV-002", "USR-001"), /Evidence hash already registered/);
  });
  it("never finds a modified or unknown hash",async function(){
    const registry=await ethers.deployContract("EvidenceRegistry");
    const original=ethers.sha256(ethers.toUtf8Bytes("original"));
    const modified=ethers.sha256(ethers.toUtf8Bytes("modified"));
    await (await registry.registerEvidence(original,"CASE-A","EV-A","USR-A")).wait();
    assert.equal(await registry.isEvidenceRegistered(modified),false);
    await assert.rejects(registry.getEvidence(modified),/Evidence not registered/);
  });
});
