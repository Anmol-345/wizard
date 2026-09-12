import { logger } from "../utils/logger.js";

export async function preFlightRpcCheck(rpcUrl: string, expectedChainId: number) {
  logger.info(`Performing pre-flight health check on RPC: ${rpcUrl}...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`RPC responded with status: ${res.status}`);
    }

    const data: any = await res.json();
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const returnedChainId = parseInt(data.result, 16);
    if (returnedChainId !== expectedChainId) {
      throw new Error(`Chain ID mismatch! Expected ${expectedChainId}, but RPC returned ${returnedChainId}. Check your RPC URL and .env config.`);
    }

    logger.info("RPC pre-flight check passed.");
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`RPC connection timed out after 5 seconds. Ensure the URL is reachable.`);
    }
    throw new Error(`RPC connection failed: ${err.message}`);
  }
}
