// Explicit IPv4 avoids BusyBox wget selecting ::1 for an IPv4-only RPC node.
try {
  const response = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    signal: AbortSignal.timeout(2000),
  });
  const body = await response.json();
  if (!response.ok || body.error || body.result !== "0x7a69") {
    throw new Error("Local Hardhat RPC is not ready.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
