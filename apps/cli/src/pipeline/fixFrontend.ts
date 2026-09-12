import { safeExec } from "../utils/exec.js";
import type { AgentRunner } from "../agents/AgentRunner.js";
import { logger } from "../utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_RETRIES = 3;

/**
 * Runs `next build` in the frontend directory and, if it fails, feeds the
 * TypeScript/JSX errors back to the AI agent to self-heal. Retries up to
 * MAX_RETRIES times.
 */
export async function fixFrontendWithSelfHealing(
  frontendDir: string,
  agent: AgentRunner,
  conceptPrompt: string
): Promise<{ success: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`Running next build (attempt ${attempt}/${MAX_RETRIES})...`);

    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const { stdout, stderr, exitCode } = await safeExec(
      npxCmd,
      ["next", "build"],
      {
        cwd: frontendDir,
        timeoutMs: 180_000,
        env: process.env,
      }
    );

    if (exitCode === 0) {
      logger.info(`Frontend compiled successfully on attempt ${attempt}.`);
      return { success: true, attempts: attempt };
    }

    if (attempt === MAX_RETRIES) {
      logger.error("Max frontend fix retries reached.");
      logger.error(extractErrors(stderr + stdout));
      return { success: false, attempts: attempt };
    }

    // Collect the files the agent is allowed to fix
    const fixableFiles = await collectFixableFiles(frontendDir);
    logger.warn(`Build failed on attempt ${attempt}. Asking AI to self-heal…`);

    const systemPromptPath = path.resolve(
      __dirname, "..", "..", "src", "agents", "promptTemplates", "fix.system.md"
    );

    const fixPrompt = buildFrontendFixPrompt({
      errors: extractErrors(stderr + stdout),
      conceptPrompt,
      fixableFiles,
    });

    await agent.run({
      systemPromptPath,
      userPrompt: fixPrompt,
      workingDir: frontendDir,
      allowedPaths: [
        "app/**/*.{tsx,ts,css}",
        "components/**/*.{tsx,ts}",
        "config/**/*.ts",
        "lib/**/*.ts",
      ],
      timeoutMs: 240_000,
    });
  }

  return { success: false, attempts: MAX_RETRIES };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the most relevant error lines from next build output */
function extractErrors(raw: string): string {
  const lines = raw.split("\n");
  const errorLines: string[] = [];
  let inError = false;

  for (const line of lines) {
    if (line.includes("Type error:") || line.includes("Error:") || line.match(/^\s*(×|✗|error TS)/)) {
      inError = true;
    }
    if (inError) {
      errorLines.push(line);
      // Stop capturing after a blank line following error block
      if (errorLines.length > 3 && line.trim() === "") {
        inError = false;
      }
    }
  }

  const result = errorLines.join("\n").trim() || raw.trim();
  return truncate(result, 8000);
}

/** Collect all generated .tsx/.ts files the AI is allowed to fix */
async function collectFixableFiles(frontendDir: string): Promise<string[]> {
  const dirs = ["app", "components", "config", "lib"];
  const files: string[] = [];

  for (const dir of dirs) {
    try {
      const entries = await readdir(path.join(frontendDir, dir), {
        recursive: true,
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.isFile() && /\.(tsx?|css)$/.test(entry.name)) {
          const rel = path.relative(frontendDir, path.join(entry.parentPath ?? (entry as any).path, entry.name));
          files.push(rel.replace(/\\/g, "/"));
        }
      }
    } catch {
      // dir may not exist yet
    }
  }

  return files;
}

function buildFrontendFixPrompt(ctx: {
  errors: string;
  conceptPrompt: string;
  fixableFiles: string[];
}) {
  return [
    "The Next.js frontend build failed with the following TypeScript/JSX errors.",
    "Fix ONLY the errors listed below. Do not change working logic, layout, or design.",
    "Use write_to_file or replace_file_content to apply fixes.",
    "",
    "### Original dApp concept",
    ctx.conceptPrompt,
    "",
    "### Files you may edit",
    ctx.fixableFiles.map((f) => `- ${f}`).join("\n"),
    "",
    "### Build errors",
    "```",
    ctx.errors,
    "```",
    "",
    "Fix all errors above so `next build` passes with exit code 0.",
    "Output ONLY tool calls — no conversational text.",
  ].join("\n");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "\n…[truncated]" : s;
}
