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

  const res = await agent.run({
    systemPromptPath,
    userPrompt: conceptPrompt,
    workingDir: projectDir,
    allowedPaths: ["contracts/**/*.sol", "project.manifest.json"],
    expectedFiles: ["project.manifest.json"],
    timeoutMs: 300_000,
  });

  if (!res.success) {
    throw new Error(`Agent generation failed: ${res.stderr || res.stdout}`);
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
