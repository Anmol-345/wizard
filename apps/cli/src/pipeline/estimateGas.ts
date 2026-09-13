import { logger } from "../utils/logger.js";

export async function estimateDeploymentCost(rpcUrl: string, burnerAddress: string): Promise<string> {
  try {
    // 1. Get gas price
    const gasPriceRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_gasPrice",
        params: [],
        id: 1,
      }),
    });
    
    if (!gasPriceRes.ok) throw new Error("Failed to fetch gas price");
    const gasPriceData: any = await gasPriceRes.json();
    if (gasPriceData.error) throw new Error(gasPriceData.error.message);
    
    const gasPriceWei = BigInt(gasPriceData.result);

    // Hardcode an average deployment gas limit (around 2-3 million for standard ERC20/ERC721)
    // We cannot estimate precisely without compiled bytecode, so we use a safe upper bound.
    const estimatedGas = 2500000n;
    
    const totalCostWei = gasPriceWei * estimatedGas;
    
    // Convert to native currency (18 decimals)
    const costInNative = Number(totalCostWei) / 1e18;
    
    return costInNative.toFixed(4);
  } catch (err: any) {
    logger.warn(`Could not estimate deployment cost: ${err.message}`);
    return "Unknown (check gas prices for this network)";
  }
}
