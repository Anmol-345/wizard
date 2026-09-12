import type { AgentRunner } from "../agents/AgentRunner.js";
import { logger } from "../utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import { readdir, readFile, rm } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateContracts(
  projectDir: string,
  agent: AgentRunner,
  conceptPrompt: string
): Promise<void> {
  logger.info("Generating smart contract via AI agent...");
  
  // Clear out the mock first
  try {
    await rm(path.join(projectDir, "contracts", "MockERC20.sol"));
  } catch (e) {
    // ignore
  }

  const systemPromptPath = path.resolve(__dirname, "..", "..", "src", "agents", "promptTemplates", "solidity.system.md");
  const contractsDir = path.join(projectDir, "contracts");

  let success = false;
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      logger.info(`Retry attempt ${attempt}/3 for contract generation...`);
    }

    const res = await agent.run({
      systemPromptPath,
      userPrompt: conceptPrompt,
      workingDir: projectDir,
      allowedPaths: ["contracts/**/*.sol"],
      expectedFiles: [], // Just rely on the agent creating a .sol file
      timeoutMs: 900_000,
      model: "gemini-1.5-pro",
    });

    if (!res.success) {
      lastError = res.stderr || res.stdout || "Unknown error";
      continue;
    }

    // Verify a .sol file was actually written
    const files = await readdir(contractsDir).catch(() => []);
    const solFiles = files.filter(f => f.endsWith(".sol"));

    if (solFiles.length > 0) {
      success = true;
      break;
    } else {
      lastError = "Agent finished but no .sol file was created in contracts/.";
    }
  }

  if (!success) {
    throw new Error(`Agent generation failed: ${lastError}`);
  }
  
  logger.info("Compiling generated contract...");
  // Now run npm install and hardhat compile programmatically
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const { writeFile } = await import("fs/promises");
  
  try {
    await execAsync("npm install", { cwd: projectDir });
    // Disable telemetry to prevent hangs
    await execAsync("npx hardhat compile", { cwd: projectDir, env: { ...process.env, HARDHAT_DISABLE_TELEMETRY: "true" } });
    
    // Extract ABI
    const contractName = await extractPrimaryContractName(projectDir);
    const artifactPath = path.join(projectDir, "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
    const artifactContent = await readFile(artifactPath, "utf-8");
    const artifact = JSON.parse(artifactContent);
    
    const manifest = {
      address: "0x0000000000000000000000000000000000000000",
      chainId: "31337",
      rpcUrl: "http://127.0.0.1:8545",
      gasSymbol: "ETH",
      abi: artifact.abi
    };
    
    await writeFile(path.join(projectDir, "project.manifest.json"), JSON.stringify(manifest, null, 2));
    logger.info("Contract compiled and ABI extracted successfully.");
  } catch (err: any) {
    throw new Error(`Failed to compile generated contract: ${err.message}`);
  }
  
  logger.info("Contract generation finished.");
}

export async function extractPrimaryContractName(projectDir: string): Promise<string> {
  const contractsDir = path.join(projectDir, "contracts");
  const files = await readdir(contractsDir);
  
  for (const file of files) {
    if (file.endsWith(".sol")) {
      const content = await readFile(path.join(contractsDir, file), "utf-8");
      // naive regex to find contract name
      const match = content.match(/contract\s+([A-Za-z0-9_]+)\s*(?:is|{)/);
      if (match) {
        return match[1];
      }
    }
  }
  throw new Error("Could not find a valid contract name in generated contracts.");
}
