import express from "express";
import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, NonceManager, Contract, getBytes } from "ethers";

const app = express();
app.use(express.json({ limit: "256kb" }));

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://hardhat:8545";
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const deploymentPath = process.env.CONTRACT_DEPLOYMENT_PATH || "./deployment/local.json";
const artifactPath = "./artifacts/contracts/EvidenceRegistry.sol/EvidenceRegistry.json";
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new NonceManager(new Wallet(privateKey, provider));

function contract() {
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return { instance: new Contract(deployment.address, artifact.abi, wallet), deployment, provider };
}

app.get("/health", async (_req, res) => {
  try {
    const { deployment, provider } = contract();
    const blockNumber = await provider.getBlockNumber();
    if (await provider.getCode(deployment.address) === "0x") throw new Error("Registry is not deployed on the current chain.");
    res.json({ status: "ok", network: deployment.network, contractAddress: deployment.address, blockNumber });
  } catch (error) {
    res.status(503).json({ status: "starting", message: error.message });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { evidenceHash, caseId, evidenceId, registeredBy } = req.body;
    if (!/^[a-f0-9]{64}$/i.test(evidenceHash || "")) return res.status(400).json({ message: "A 64-character SHA-256 hash is required." });
    if (![caseId,evidenceId,registeredBy].every(v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(v))) return res.status(400).json({message:"Valid opaque identity IDs are required."});
    const { instance, deployment } = contract();
    const hashBytes = getBytes(`0x${evidenceHash}`);
    if (await instance.isEvidenceRegistered(hashBytes)) {
      const record=await instance.getEvidence(hashBytes);
      if(record.caseId!==caseId||record.evidenceId!==evidenceId)return res.status(409).json({message:"Hash is registered to another evidence identity."});
      // Recover the genuine receipt after a DB-only demo reset or interrupted
      // response. This is not a second on-chain registration.
      const events=await instance.queryFilter(instance.filters.EvidenceRegistered(hashBytes),0,"latest");
      const event=events[0];if(!event)throw new Error("Registration event is missing.");
      return res.json({network:deployment.network,contractAddress:deployment.address,transactionHash:event.transactionHash,blockNumber:event.blockNumber});
    }
    const tx = await instance.registerEvidence(hashBytes, caseId, evidenceId, registeredBy);
    const receipt = await tx.wait();
    res.status(201).json({ network: deployment.network, contractAddress: deployment.address, transactionHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    res.status(500).json({ message: error.shortMessage || error.message });
  }
});

app.get("/evidence/:hash", async (req, res) => {
  try {
    if (!/^[a-f0-9]{64}$/i.test(req.params.hash)) return res.status(400).json({ message:"Invalid SHA-256 hash." });
    const { instance, deployment } = contract();
    const hashBytes = getBytes(`0x${req.params.hash}`);
    if (!(await instance.isEvidenceRegistered(hashBytes))) return res.status(404).json({ message: "Evidence not registered." });
    const record = await instance.getEvidence(hashBytes);
    res.json({ evidenceHash: record.evidenceHash, caseId: record.caseId, evidenceId: record.evidenceId, timestamp: Number(record.timestamp), registeredBy: record.registeredBy, network: deployment.network, contractAddress: deployment.address });
  } catch (error) {
    res.status(500).json({ message: error.shortMessage || error.message });
  }
});

app.listen(8787, "0.0.0.0", () => console.log("Blockchain bridge listening on 8787"));
