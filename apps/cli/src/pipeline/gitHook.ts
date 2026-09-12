import { writeFile, chmod, mkdir } from "fs/promises";
import path from "path";
import { safeExec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";

const PRE_COMMIT_HOOK = `#!/bin/sh
# Prevent accidental commits of private keys
if git diff --cached | grep -iE "0x[0-9a-fA-F]{64}"; then
  echo "ERROR: Potential private key (32-byte hex) detected in staged files."
  echo "Commit rejected."
  exit 1
fi
exit 0
`;

export async function injectPreCommitHook(projectDir: string) {
  logger.info("Initializing Git repository and installing pre-commit hooks...");

  try {
    await safeExec("git", ["init"], { cwd: projectDir, timeoutMs: 10000, env: process.env });
    
    const hooksDir = path.join(projectDir, ".git", "hooks");
    await mkdir(hooksDir, { recursive: true });
    
    const hookPath = path.join(hooksDir, "pre-commit");
    await writeFile(hookPath, PRE_COMMIT_HOOK, "utf-8");
    await chmod(hookPath, 0o755);
  } catch (err: any) {
    logger.warn(`Could not setup git hook: ${err.message}`);
  }
}
