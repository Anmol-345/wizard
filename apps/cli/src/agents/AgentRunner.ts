export interface AgentInvocation {
  systemPromptPath?: string;     // path to .md template file
  systemPromptOverride?: string; // fully-rendered prompt string (takes precedence over systemPromptPath)
  userPrompt: string;
  workingDir: string;            // cwd the agent is allowed to write in
  allowedPaths: string[];        // glob allowlist enforced post-hoc
  expectedFiles?: string[];      // files that MUST be written, used for retry verification
  timeoutMs: number;
  model?: string;
}

export interface AgentResult {
  success: boolean;
  stdout: string;
  stderr: string;
  filesWritten: string[];
  exitCode: number | null;
}

export interface AgentRunner {
  run(invocation: AgentInvocation): Promise<AgentResult>;
}
