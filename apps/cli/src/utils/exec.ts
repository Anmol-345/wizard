import { spawn } from "child_process";
import { once } from "events";

export interface SafeExecOptions {
  cwd: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  maxBufferBytes?: number;
}

export async function safeExec(
  command: string,
  args: string[],
  opts: SafeExecOptions
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  const maxBuf = opts.maxBufferBytes ?? 10 * 1024 * 1024;

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > maxBuf) child.kill("SIGKILL");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);

  try {
    const [exitCode] = (await once(child, "close")) as [number | null];
    return { stdout, stderr, exitCode };
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
