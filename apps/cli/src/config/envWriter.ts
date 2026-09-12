import { writeFile, chmod } from "fs/promises";
import path from "path";

export async function writeProjectEnv(
  projectDir: string,
  cfg: { rpcUrl: string; chainId: number; gasSymbol: string; privateKey: string }
) {
  const contents = [
    `RPC_URL=${cfg.rpcUrl}`,
    `CHAIN_ID=${cfg.chainId}`,
    `GAS_SYMBOL=${cfg.gasSymbol}`,
    `DEPLOYER_PRIVATE_KEY=${cfg.privateKey}`,
    "",
  ].join("\n");

  const envPath = path.join(projectDir, ".env");
  await writeFile(envPath, contents, { mode: 0o600 });
  await chmod(envPath, 0o600); // enforce even if umask overrides
}
