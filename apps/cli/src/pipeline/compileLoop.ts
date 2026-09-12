import { safeExec } from "../utils/exec.js";
import type { AgentRunner } from "../agents/AgentRunner.js";
import { logger } from "../utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_RETRIES = 3;

export async function compileWithSelfHealing(
  projectDir: string,
  agent: AgentRunner,
  conceptPrompt: string
): Promise<{ success: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`Compiling contracts (attempt ${attempt}/${MAX_RETRIES})...`);
    
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const { stdout, stderr, exitCode } = await safeExec(
      npxCmd,
      ["hardhat", "compile", "--show-stack-traces"],
      { cwd: projectDir, timeoutMs: 120_000, env: process.env }
    );

    if (exitCode === 0) {
      logger.info("Compilation successful.");
      return { success: true, attempts: attempt };
    }

    if (attempt === MAX_RETRIES) {
      logger.error("Max compilation retries reached.");
      logger.error(stderr || stdout);
      return { success: false, attempts: attempt };
    }

    logger.warn("Compilation failed, asking agent to self-heal...");
    const fixPrompt = buildFixPrompt({ stderr, stdout, conceptPrompt });
    
    const systemPromptPath = path.resolve(__dirname, "..", "..", "src", "agents", "promptTemplates", "solidity.system.md");
    
    await agent.run({
      systemPromptPath,
      userPrompt: fixPrompt,
      workingDir: projectDir,
      allowedPaths: ["contracts/**/*.sol"],
      timeoutMs: 180_000,
      model: "gemini-1.5-pro",
    });
  }
  return { success: false, attempts: MAX_RETRIES };
}

function buildFixPrompt(ctx: { stderr: string; stdout: string; conceptPrompt: string }) {
  return [
    "The following Solidity project failed to compile with Hardhat.",
    "Fix ONLY the compilation errors below. Do not change unrelated logic",
    "or the original contract's public interface unless the error requires it.",
    "",
    "### Original intent",
    ctx.conceptPrompt,
    "",
    "### Compiler output",
    "```",
    truncate(ctx.stderr || ctx.stdout, 6000),
    "```",
  ].join("\n");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "\n...[truncated]" : s;
}
