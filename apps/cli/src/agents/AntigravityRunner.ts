import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { once } from "events";
import type { AgentRunner, AgentInvocation, AgentResult } from "./AgentRunner.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

async function verifyOutput(workingDir: string, expectedFiles: string[]) {
  if (!expectedFiles || expectedFiles.length === 0) return { ok: true, results: [], failed: [] };
  const results = await Promise.all(
    expectedFiles.map(async (rel) => {
      const full = path.join(workingDir, rel);
      try {
        const content = await readFile(full, "utf-8");
        const isPlaceholder = /Loading (stats|actions)(?:\.\.\.|…)/.test(content) || content.trim().length < 50;
        return { file: rel, exists: true, isPlaceholder, length: content.length };
      } catch {
        return { file: rel, exists: false, isPlaceholder: true, length: 0 };
      }
    })
  );
  const failed = results.filter(r => !r.exists || r.isPlaceholder);
  return { ok: failed.length === 0, results, failed };
}

const MAX_ATTEMPTS = 3;

export class AntigravityRunner implements AgentRunner {
  async run(inv: AgentInvocation): Promise<AgentResult> {
    // Use the pre-rendered override if provided, otherwise read from disk
    const systemPrompt = inv.systemPromptOverride
      ?? (inv.systemPromptPath ? await readFile(inv.systemPromptPath, "utf-8") : "");
    const originalPrompt = `${systemPrompt}\n\n---\n\n${inv.userPrompt}`;

    let lastResult: { stdout: string; stderr: string; exitCode: number | null } = { stdout: "", stderr: "", exitCode: null };

    logger.info(`Invoking agy in ${inv.workingDir}...`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        logger.info(`Retry attempt ${attempt}/${MAX_ATTEMPTS} for AI synthesis...`);
      }

      let promptContent: string;
      const expected = inv.expectedFiles ?? [];
      
      if (attempt === 1) {
        promptContent = originalPrompt;
      } else {
        const verification0 = await verifyOutput(inv.workingDir, expected);
        const missingStr = verification0.failed.map(f => f.file).join(", ");
        logger.warn(`AI failed to write files correctly: ${missingStr}`);
        promptContent = `You did not correctly call write_to_file for: ${missingStr}.
Do not explain, do not summarize, do not talk. Your next action MUST be a write_to_file (or replace_file_content) tool call for each missing file listed above, using the original spec below.

${originalPrompt}`;
      }

      lastResult = await spawnAgy(promptContent, inv.workingDir, inv.timeoutMs, inv.model);
      const verification = await verifyOutput(inv.workingDir, expected);

      if (verification.ok) {
        return { 
          success: true, 
          stdout: lastResult.stdout, 
          stderr: lastResult.stderr, 
          exitCode: lastResult.exitCode,
          filesWritten: verification.results.map(r => r.file)
        };
      }
    }

    const finalVerification = await verifyOutput(inv.workingDir, inv.expectedFiles ?? []);
    if (finalVerification.failed.length > 0) {
      logger.warn(`AI failed after ${MAX_ATTEMPTS} attempts. Missing: ${finalVerification.failed.map(f => f.file).join(", ")}`);
    } else {
      logger.warn(`AI failed after ${MAX_ATTEMPTS} attempts.`);
    }

    return { 
      success: false, 
      stdout: lastResult.stdout, 
      stderr: lastResult.stderr, 
      exitCode: lastResult.exitCode,
      filesWritten: []
    };
  }
}

/**
 * Writes the full prompt to a temp file, then invokes agy with:
 *  - `--add-dir <workingDir>` so agy registers the project folder in its workspace
 *  - A short `--print` instruction that tells it to read the temp file and
 *    write all output files as absolute paths inside workingDir.
 *
 * This sidesteps both the Windows argv length limit AND agy's internal cwd issue
 * (agy ignores the OS-level cwd of the spawned process).
 */
async function spawnAgy(
  promptContent: string,
  workingDir: string,
  timeoutMs: number,
  model?: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  // Write full prompt to a temp file
  const tmpFile = path.join(os.tmpdir(), `dapp-wizard-${randomUUID()}.md`);
  await writeFile(tmpFile, promptContent, "utf-8");

  // The short instruction is the only thing passed as a CLI arg.
  // It tells the agent where the project lives and to use absolute paths.
  const shortInstruction = [
    `Read the file at this exact path: ${tmpFile}`,
    `Then execute ALL of its instructions. When writing files, use ABSOLUTE paths rooted at: ${workingDir}`,
    `For example, write 'config/contract.ts' to '${path.join(workingDir, "config", "contract.ts")}'.`,
    `Write every file immediately — do not describe what you will do.`,
  ].join(" ");

  const args = [
    "--add-dir", workingDir,
    "--print", shortInstruction,
    "--dangerously-skip-permissions",
    "--print-timeout", `${Math.ceil(timeoutMs / 1000 / 60)}m`,
  ];

  if (model) {
    args.push("--model", model);
  }

  const command = process.platform === "win32" ? "agy.exe" : "agy";

  const child = spawn(command, args, {
    cwd: workingDir,
    env: buildEnv(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  const MAX = 20 * 1024 * 1024; // 20 MB

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    if (stdout.length > MAX) child.kill("SIGKILL");
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    process.stderr.write(chunk);
  });

  const timeout = setTimeout(() => {
    logger.warn("agy timed out — killing process");
    child.kill("SIGKILL");
  }, timeoutMs);

  try {
    const [exitCode] = (await once(child, "close")) as [number | null];
    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timeout);
    await unlink(tmpFile).catch(() => {});
  }
}

function buildEnv(): NodeJS.ProcessEnv {
  // Keep full environment — agy needs auth keys, PATH, APPDATA etc.
  // Only strip CI/test vars that can interfere.
  const stripped = new Set(["CI", "GITHUB_TOKEN", "npm_lifecycle_event"]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !stripped.has(k))
  ) as NodeJS.ProcessEnv;
}
