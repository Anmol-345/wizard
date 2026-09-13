import { safeExec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import { readFile, writeFile } from "fs/promises";
import path from "path";

type DeploymentErrorKind = "NONCE_MISMATCH" | "INSUFFICIENT_FUNDS" | "OUT_OF_GAS" | "RPC_UNREACHABLE" | "RPC_RATE_LIMITED" | "UNKNOWN";

export class DeploymentError extends Error {
  constructor(public kind: DeploymentErrorKind, message: string) {
    super(message);
    this.name = "DeploymentError";
  }
}

function classifyDeployError(stderr: string): DeploymentErrorKind {
  if (/nonce too low|replacement transaction underpriced/i.test(stderr)) return "NONCE_MISMATCH";
  if (/insufficient funds/i.test(stderr)) return "INSUFFICIENT_FUNDS";
  if (/out of gas|gas required exceeds/i.test(stderr)) return "OUT_OF_GAS";
  if (/ECONNREFUSED|ETIMEDOUT/i.test(stderr)) return "RPC_UNREACHABLE";
  if (/429|rate limit/i.test(stderr)) return "RPC_RATE_LIMITED";
  return "UNKNOWN";
}

export async function deployContract(projectDir: string, contractName: string, fileName: string) {
  logger.info(`Deploying contract ${contractName}...`);

  const deployTemplatePath = path.join(projectDir, "scripts", "deploy.ts");
  let deployScript = await readFile(deployTemplatePath, "utf-8");

  deployScript = deployScript.replace(/\{\{CONTRACT_NAME\}\}/g, contractName);
  deployScript = deployScript.replace(/\{\{FILE_NAME\}\}/g, fileName);
  deployScript = deployScript.replace(/\/\* \{\{CONSTRUCTOR_ARGS\}\} \*\//g, "");

  const deployDestPath = path.join(projectDir, "scripts", "deploy.ts");
  await writeFile(deployDestPath, deployScript, "utf-8");

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const { stdout, stderr, exitCode } = await safeExec(
    npxCmd,
    ["hardhat", "run", "scripts/deploy.ts", "--network", "custom"],
    { cwd: projectDir, timeoutMs: 180_000, env: process.env }
  );

  if (exitCode !== 0) {
    const errorKind = classifyDeployError(stderr || stdout);
    throw new DeploymentError(errorKind, `Deployment failed (${errorKind}):\n${stderr || stdout}`);
  }
  
  logger.info("Deployment completed successfully.");
}
