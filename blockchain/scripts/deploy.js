import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import hre from "hardhat";

const { ethers } = hre;

const deploymentPath = "deployment/local.json";
if (existsSync(deploymentPath)) {
  const previous = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const expected = (await hre.artifacts.readArtifact("EvidenceRegistry")).deployedBytecode;
  if ((await ethers.provider.getCode(previous.address)) === expected) {
    console.log(`EvidenceRegistry reused at ${previous.address}`);
    process.exit(0);
  }
}
const registry = await ethers.deployContract("EvidenceRegistry");
await registry.waitForDeployment();
const address = await registry.getAddress();
mkdirSync("deployment", { recursive: true });
writeFileSync("deployment/local.json", JSON.stringify({ address, network: "Hardhat Local EVM" }, null, 2));
console.log(`EvidenceRegistry deployed to ${address}`);
