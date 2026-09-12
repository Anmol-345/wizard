# EVM dApp Generator — Technical Implementation & Architecture Specification

A local-first, agent-orchestrated pipeline that turns a natural-language dApp concept into a compiled, deployed, and fully-styled Next.js frontend wired to a live EVM contract.

---

## 1. Repository Structure & Starter Monorepo Blueprint

### 1.1 Monorepo layout (npm workspaces + Turborepo)

npm workspaces is sufficient for a local-first tool (no need for Nx-level remote caching), but Turborepo gives you free task graph caching for `compile`/`build` steps across regenerations.

```
evm-dapp-generator/
├── package.json                 # root workspace manifest
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── apps/
│   ├── cli/                     # orchestrator CLI (the "brain")
│   │   ├── src/
│   │   │   ├── index.ts         # entrypoint (commander/yargs)
│   │   │   ├── wizard/          # interactive prompt flow (clack/inquirer)
│   │   │   │   ├── networkPrompt.ts
│   │   │   │   ├── keyPrompt.ts
│   │   │   │   └── conceptPrompt.ts
│   │   │   ├── agents/          # agent runner abstraction
│   │   │   │   ├── AgentRunner.ts
│   │   │   │   ├── AntigravityRunner.ts
│   │   │   │   ├── OpenCodeRunner.ts
│   │   │   │   └── promptTemplates/
│   │   │   │       ├── solidity.system.md
│   │   │   │       └── frontend.system.md
│   │   │   ├── pipeline/
│   │   │   │   ├── generateContracts.ts
│   │   │   │   ├── compileLoop.ts
│   │   │   │   ├── deploy.ts
│   │   │   │   └── synthesizeFrontend.ts
│   │   │   ├── config/
│   │   │   │   ├── envWriter.ts     # writes .env safely (0600 perms)
│   │   │   │   └── hardhatConfigWriter.ts
│   │   │   └── utils/
│   │   │       ├── exec.ts          # safe subprocess wrapper
│   │   │       ├── logger.ts        # redacting logger
│   │   │       └── abi.ts           # ABI → TS type mapping
│   │   └── package.json
│   └── web-ui/                  # OPTIONAL local web UI (Next.js) alt to CLI wizard
│       ├── app/
│       ├── src/server/           # tRPC/local API routes that shell into apps/cli logic
│       └── package.json
├── packages/
│   ├── template-hardhat/        # golden-copy Hardhat project (not run directly, copied per-generation)
│   │   ├── contracts/
│   │   ├── scripts/deploy.ts.template
│   │   ├── hardhat.config.ts.template
│   │   └── package.json
│   ├── template-frontend/       # golden-copy Next.js + Wagmi + RainbowKit shell
│   │   ├── app/
│   │   ├── components/ui/       # shadcn primitives pre-installed
│   │   ├── lib/wagmi.ts.template
│   │   ├── lib/contract.ts.template
│   │   └── package.json
│   └── shared-types/            # Zod schemas + TS types shared cli <-> templates
│       └── src/
│           ├── networkConfig.ts
│           ├── contractManifest.ts
│           └── abiTypes.ts
└── generated/                   # OUTPUT dir — gitignored, one folder per project
    └── <project-slug>/
        ├── contracts/
        ├── frontend/
        └── project.manifest.json
```

Key structural decisions:

- **`packages/template-*` are never mutated in place.** Each generation run does a filesystem copy (`fs.cp` with `recursive: true`) into `generated/<slug>/` so the golden templates stay pristine and diffable in git, while output is disposable and gitignored.
- **`shared-types`** holds Zod schemas for the network config, the "contract manifest" (address, ABI, bytecode, deployer), and ABI-to-UI type mappings — imported by both the CLI (to validate agent output) and the frontend template (for compile-time typing after codegen).
- **`apps/web-ui`** is optional; if you skip it, the CLI wizard is the only interface. Keep it structurally isolated so it's purely a thin client over the same pipeline functions in `apps/cli/src/pipeline`.

### 1.2 Baseline template dependencies

`packages/template-hardhat/package.json`:

```json
{
  "name": "generated-contracts",
  "private": true,
  "devDependencies": {
    "hardhat": "^2.22.10",
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "@nomicfoundation/hardhat-verify": "^2.0.11",
    "@openzeppelin/contracts": "^5.0.2",
    "typescript": "^5.5.4",
    "ts-node": "^10.9.2",
    "dotenv": "^16.4.5"
  }
}
```

`packages/template-frontend/package.json`:

```json
{
  "name": "generated-frontend",
  "private": true,
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "wagmi": "^2.12.7",
    "viem": "^2.19.4",
    "@rainbow-me/rainbowkit": "^2.1.6",
    "@tanstack/react-query": "^5.51.23",
    "zod": "^3.23.8",
    "sonner": "^1.5.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "lucide-react": "^0.427.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.9",
    "postcss": "^8.4.41",
    "autoprefixer": "^10.4.20",
    "typescript": "^5.5.4"
  }
}
```

> Version pinning strategy: pin exact minor versions in the golden templates and run a scheduled `npm outdated` check in CI on the template packages only — never auto-upgrade inside a user's already-generated project.

---

## 2. Agent Execution & CLI Orchestrator Engine

### 2.1 Agent runner abstraction

Both `antigravity` (`agy`) and `opencode` are invoked as **non-interactive, single-shot subprocesses** — never as long-lived REPLs — so the orchestrator can treat them as pure functions: `(prompt, context) -> filesystem diff`.

```typescript
// apps/cli/src/agents/AgentRunner.ts
export interface AgentInvocation {
  systemPromptPath: string;   // path to .md file, never inlined as a shell arg
  userPrompt: string;
  workingDir: string;         // cwd the agent is allowed to write in
  allowedPaths: string[];     // glob allowlist enforced post-hoc
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
```

### 2.2 Safe subprocess execution (no shell injection)

The critical rule: **never build a command string and pass it to a shell.** Always call `execFile`/`spawn` with an argv array, so arguments are never interpreted by `/bin/sh`.

```typescript
// apps/cli/src/utils/exec.ts
import { spawn } from "node:child_process";
import { once } from "node:events";

export interface SafeExecOptions {
  cwd: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;      // pass an explicit, minimal env — never process.env directly
  maxBufferBytes?: number;
}

export async function safeExec(
  command: string,
  args: string[],               // <-- argv array, never a concatenated string
  opts: SafeExecOptions
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    shell: false,                // explicit: never let node pick a shell
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
  } finally {
    clearTimeout(timeout);
  }
}
```

Wiring an agent runner on top of this:

```typescript
// apps/cli/src/agents/AntigravityRunner.ts
import { readFile, mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { safeExec } from "../utils/exec";
import type { AgentRunner, AgentInvocation, AgentResult } from "./AgentRunner";

export class AntigravityRunner implements AgentRunner {
  async run(inv: AgentInvocation): Promise<AgentResult> {
    const systemPrompt = await readFile(inv.systemPromptPath, "utf-8");

    // Write the composed prompt to a temp file instead of an argv/env string.
    // This avoids argv length limits and avoids the prompt ever touching a shell.
    const promptDir = await mkdtemp(path.join(tmpdir(), "agy-prompt-"));
    const promptFile = path.join(promptDir, "prompt.md");
    await writeFile(promptFile, `${systemPrompt}\n\n---\n\n${inv.userPrompt}`, "utf-8");

    const before = await snapshotDir(inv.workingDir);

    const { stdout, stderr, exitCode } = await safeExec(
      "agy",
      [
        "run",
        "--non-interactive",
        "--prompt-file", promptFile,
        "--cwd", inv.workingDir,
        "--model", inv.model ?? "gemini-2.5-pro",
        "--yes",                       // auto-approve file writes, no interactive confirm
      ],
      {
        cwd: inv.workingDir,
        timeoutMs: inv.timeoutMs,
        env: minimalEnv(),             // see 2.3
      }
    );

    const after = await snapshotDir(inv.workingDir);
    const filesWritten = diffSnapshots(before, after)
      .filter((p) => isAllowed(p, inv.allowedPaths)); // post-hoc allowlist enforcement

    return { success: exitCode === 0, stdout, stderr, filesWritten, exitCode };
  }
}

function minimalEnv(): NodeJS.ProcessEnv {
  // Only pass through what the agent CLI strictly needs (its own API key var),
  // never the full parent env (which may contain the deployer private key).
  const allow = ["PATH", "HOME", "GEMINI_API_KEY", "ANTIGRAVITY_API_KEY"];
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => allow.includes(k))
  ) as NodeJS.ProcessEnv;
}
```

Key points:

- **Prompts go through a temp file, never a CLI argument.** This sidesteps both shell-injection risk and OS argv length limits, and means the "prompt" is never visible in `ps aux`.
- **`shell: false`** on every `spawn` call — non-negotiable.
- **`minimalEnv()`** is a strict allowlist. The deployment private key must never be present in the environment passed to `agy`/`opencode`, because a compromised or hallucinating agent that runs `env` or writes debug output could leak it. The private key is only ever read inside the Node process for the deployment step (§3.2), never exposed to a subprocess used for code generation.
- **`allowedPaths` + post-hoc diffing**: after each agent run, snapshot the working directory before/after and reject (delete + fail the step) any file written outside the expected template subtree — this guards against path-traversal style writes (`../../.env`) if the agent's own sandboxing is imperfect.

### 2.3 `opencode` variant

Same interface, different argv shape — `opencode` typically accepts a config file rather than flags:

```typescript
// apps/cli/src/agents/OpenCodeRunner.ts
const { stdout, stderr, exitCode } = await safeExec(
  "opencode",
  [
    "run",
    "--config", configFile,     // JSON: { model: "gemini-2.5-pro", mode: "non-interactive" }
    "--prompt-file", promptFile,
    "--project", inv.workingDir,
  ],
  { cwd: inv.workingDir, timeoutMs: inv.timeoutMs, env: minimalEnv() }
);
```

Abstracting both behind `AgentRunner` lets `pipeline/generateContracts.ts` and `pipeline/synthesizeFrontend.ts` stay agent-agnostic — selectable via a `--agent antigravity|opencode` CLI flag.

---

## 3. Compilation, Self-Healing, & Deployment Pipeline

### 3.1 Self-healing compile loop

```typescript
// apps/cli/src/pipeline/compileLoop.ts
import { safeExec } from "../utils/exec";
import type { AgentRunner } from "../agents/AgentRunner";

const MAX_RETRIES = 3;

export async function compileWithSelfHealing(
  projectDir: string,
  agent: AgentRunner,
  conceptPrompt: string
): Promise<{ success: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { stdout, stderr, exitCode } = await safeExec(
      "npx",
      ["hardhat", "compile", "--show-stack-traces"],
      { cwd: projectDir, timeoutMs: 120_000, env: minimalCompileEnv() }
    );

    if (exitCode === 0) return { success: true, attempts: attempt };

    if (attempt === MAX_RETRIES) return { success: false, attempts: attempt };

    // Feed the raw solc/hardhat error output back to the agent as a
    // structured fix-it prompt — never re-send the whole original concept,
    // just the diff-relevant failure context, to keep token usage bounded.
    const fixPrompt = buildFixPrompt({ stderr, stdout, conceptPrompt });
    await agent.run({
      systemPromptPath: "apps/cli/src/agents/promptTemplates/solidity.system.md",
      userPrompt: fixPrompt,
      workingDir: projectDir,
      allowedPaths: ["contracts/**/*.sol"],
      timeoutMs: 180_000,
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
```

### 3.2 Dynamic Hardhat runtime config — no hardcoded secrets

The generated `hardhat.config.ts` never contains a literal RPC URL, chain ID, or private key. It reads from a **per-project `.env`** written once by the CLI wizard, loaded via `dotenv`, with the private key normalized and validated before use.

```typescript
// packages/template-hardhat/hardhat.config.ts.template
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizedPrivateKey(): string {
  const raw = requireEnv("DEPLOYER_PRIVATE_KEY");
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not a valid 32-byte hex key.");
  }
  return hex;
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    custom: {
      url: requireEnv("RPC_URL"),
      chainId: Number(requireEnv("CHAIN_ID")),
      accounts: [normalizedPrivateKey()],
    },
  },
};

export default config;
```

The CLI writes this `.env` itself (never lets the agent write it):

```typescript
// apps/cli/src/config/envWriter.ts
import { writeFile, chmod } from "node:fs/promises";
import path from "node:path";

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
  await writeFile(envPath, contents, { mode: 0o600 }); // owner read/write only
  await chmod(envPath, 0o600);                          // enforce even if umask overrides
}
```

### 3.3 Deployment execution & manifest extraction

```typescript
// packages/template-hardhat/scripts/deploy.ts.template
import { ethers } from "hardhat";
import { writeFileSync } from "node:fs";

async function main() {
  const factory = await ethers.getContractFactory("{{CONTRACT_NAME}}");
  const contract = await factory.deploy(/* {{CONSTRUCTOR_ARGS}} */);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const artifact = await import(`../artifacts/contracts/{{CONTRACT_NAME}}.sol/{{CONTRACT_NAME}}.json`);

  const manifest = {
    address,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedAt: new Date().toISOString(),
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
  };

  writeFileSync("../project.manifest.json", JSON.stringify(manifest, null, 2));
  console.log(`Deployed to ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

```typescript
// apps/cli/src/pipeline/deploy.ts
export async function deployContract(projectDir: string) {
  const { stdout, stderr, exitCode } = await safeExec(
    "npx",
    ["hardhat", "run", "scripts/deploy.ts", "--network", "custom"],
    { cwd: projectDir, timeoutMs: 180_000, env: minimalCompileEnv() }
  );
  if (exitCode !== 0) {
    throw new DeploymentError(classifyDeployError(stderr));
  }
  return readManifest(projectDir);
}
```

`project.manifest.json` becomes the single source of truth that `synthesizeFrontend.ts` and the UI-mapping layer (§4.2) consume — the frontend template never re-derives the ABI itself.

---

## 4. UI Synthesis & Design Prompt Engineering

### 4.1 System prompt injected for frontend generation

This is passed as the `systemPromptPath` file content (`frontend.system.md`) ahead of the user's dApp concept, when invoking the agent for the Next.js synthesis step:

```markdown
# ROLE
You are a senior product design engineer generating a production frontend
for a single Solidity smart contract. You are NOT writing a generic CRUD
admin panel — you are designing a polished, opinionated dApp UI.

# HARD CONSTRAINTS
- Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui primitives
  (already installed in components/ui/), wagmi v2, viem, RainbowKit.
- Do not install new npm packages. Use only what's in package.json.
- Do not modify lib/wagmi.ts, lib/contract.ts, or any file under app/api/.
- Every contract "write" function must render as its own Card with:
  a form (typed inputs matching ABI param types), a submit button that shows
  a spinner while the tx is pending, and a toast (via `sonner`) on submit,
  success, and failure — using the tx hash for the success toast link.
- Every contract "read" function must render as a live-updating value using
  `useReadContract`, with a skeleton loading state, refetched on relevant
  write-function success (query invalidation, not polling).
- Numeric inputs bound to `uint256`/`int256` ABI params must be BigInt-safe:
  parse with `parseUnits`/native BigInt, never `Number()`.
- Address inputs must validate with viem's `isAddress` before enabling submit.

# VISUAL DIRECTION
- Dark mode by default, with a CSS variable-driven theme (no hardcoded hex
  outside globals.css) so the shadcn theme tokens remain the single source
  of truth for color.
- Layout: a responsive CSS grid of cards (1 col mobile, 2 col tablet,
  3 col desktop), a sticky header with the RainbowKit ConnectButton and
  contract address (truncated, with copy-to-clipboard).
- Subtle glassmorphism on cards: translucent background + backdrop-blur,
  1px border at low opacity, soft shadow — not flat white cards.
- Micro-interactions: button press scale, skeleton shimmer on loading,
  toast slide-in, hover elevation on cards. Prefer Tailwind transitions
  over introducing an animation library.
- Typography: one clear heading scale, generous line-height, no more than
  two font weights on a single screen.

# OUTPUT
Write only inside app/, components/, and lib/ui/. Do not print explanations
to stdout — write files directly. When finished, ensure `npm run build`
would succeed (no unused imports, no `any` in exported function signatures).
```

The user's actual dApp concept (e.g. "an on-chain raffle where users buy tickets with the gas token") is appended below this as the user turn, plus the `project.manifest.json` contents so the agent has the real ABI rather than inventing one.

### 4.2 Deterministic ABI → typed UI control mapping

Rather than trusting the agent to reliably hand-roll type handling for every parameter, the orchestrator pre-computes a **UI schema** from the ABI in TypeScript (deterministic, not LLM-generated) and hands the agent that schema as structured context — the agent's job becomes "style and lay out these already-typed forms," not "figure out what type `uint256` implies."

```typescript
// apps/cli/src/utils/abi.ts
import type { Abi, AbiFunction, AbiParameter } from "viem";

export type UiControlType =
  | "text" | "textarea" | "number-bigint" | "address" | "bool" | "bytes";

export interface UiField {
  name: string;
  solidityType: string;
  control: UiControlType;
  validation: { required: true } & Record<string, unknown>;
}

export interface UiFunctionSpec {
  name: string;
  kind: "read" | "write" | "payable";
  fields: UiField[];
  outputs: { name: string; solidityType: string }[];
}

export function buildUiSchema(abi: Abi): UiFunctionSpec[] {
  return (abi.filter((item) => item.type === "function") as AbiFunction[]).map((fn) => ({
    name: fn.name,
    kind: fn.stateMutability === "view" || fn.stateMutability === "pure"
      ? "read"
      : fn.stateMutability === "payable" ? "payable" : "write",
    fields: fn.inputs.map(mapParamToField),
    outputs: fn.outputs.map((o) => ({ name: o.name || "value", solidityType: o.type })),
  }));
}

function mapParamToField(param: AbiParameter): UiField {
  const t = param.type;
  if (t === "address") {
    return { name: param.name || "address", solidityType: t, control: "address", validation: { required: true, isAddress: true } };
  }
  if (t === "bool") {
    return { name: param.name || "flag", solidityType: t, control: "bool", validation: { required: true } };
  }
  if (t.startsWith("uint") || t.startsWith("int")) {
    return { name: param.name || "amount", solidityType: t, control: "number-bigint", validation: { required: true, min: t.startsWith("uint") ? "0" : undefined } };
  }
  if (t.startsWith("bytes")) {
    return { name: param.name || "data", solidityType: t, control: "bytes", validation: { required: true, hexPattern: t === "bytes" ? "^0x([0-9a-fA-F]{2})*$" : `^0x[0-9a-fA-F]{${(Number(t.replace("bytes","")) || 32) * 2}}$` } };
  }
  // string, tuple, arrays fall back to a validated textarea + JSON.parse for tuples/arrays
  return { name: param.name || "value", solidityType: t, control: t === "string" ? "text" : "textarea", validation: { required: true } };
}
```

This `UiFunctionSpec[]` is serialized to `lib/ui/schema.json` inside the generated frontend before the agent runs, and the system prompt instructs the agent to **import and render from this schema** rather than re-deriving types itself — collapsing "does the LLM correctly infer that `uint256` needs BigInt handling" from a probabilistic question into a deterministic, pre-solved one. The corresponding React hook wiring (`useReadContract`/`useWriteContract` with the right `args` array, `parseUnits` for numeric fields, `isAddress` gating the submit button) is generated as **static template code** (not agent-authored) in `lib/ui/useContractField.ts`, further shrinking the surface area the LLM has to get right.

---

## 5. Local Security, Key Hygiene & Edge Cases

### 5.1 Preventing private key leakage

- **`.env` is `0600`-permissioned** at write time (§3.2) and the template ships a `.gitignore` that is written to disk *before* any agent runs, containing at minimum:
  ```
  .env
  .env.*
  !.env.example
  cache/
  artifacts/
  node_modules/
  ```
- **Git init is deferred** until after `.gitignore` exists — never `git init && git add .` in one step where a race could stage the key.
- **Redacting logger**: every log sink (CLI stdout, any file logs) passes through a redaction transform that regexes out `0x[0-9a-fA-F]{64}` patterns and replaces with `[REDACTED_KEY]` before writing, as defense-in-depth against the key ending up in a Hardhat stack trace or agent stdout echo.
  ```typescript
  // apps/cli/src/utils/logger.ts
  const PRIVATE_KEY_PATTERN = /0x[0-9a-fA-F]{64}/g;
  export function redact(input: string): string {
    return input.replace(PRIVATE_KEY_PATTERN, "[REDACTED_KEY]");
  }
  ```
- **The key never crosses into the agent subprocess environment** (§2.2 `minimalEnv`) — it is read only inside the Node orchestrator process and inside the Hardhat child process for the deploy step specifically, which itself only receives it via `.env` file read, never an argv flag (argv is visible via `ps`).
- **Pre-commit hook** installed into the generated project (`husky` or a plain `.git/hooks/pre-commit` shell stub) that greps staged diffs for the private-key hex pattern and blocks the commit if found, as a last line of defense for users who later push the generated project to their own remote.

### 5.2 Failure handling

| Failure mode | Detection | Handling |
|---|---|---|
| RPC timeout / unreachable | `ECONNREFUSED`/`ETIMEDOUT` on `provider.getNetwork()` before deploy | Pre-flight RPC health check with 5s timeout before starting the compile step at all; fail fast with an actionable message rather than burning agent calls first |
| RPC rate limiting (429) | HTTP 429 or JSON-RPC `-32005` | Exponential backoff (3 attempts, 2s/4s/8s) at the provider level via a custom `viem` transport wrapper; surface remaining-quota hints if the RPC returns them |
| Gas estimation failure | `eth_estimateGas` revert | Catch and re-run `eth_call` at the same block to extract the revert reason; surface the decoded custom error (via the ABI's error fragments) rather than a raw hex selector |
| Out-of-gas | Tx receipt `status: 0` with gas used ≈ gas limit | Detect the near-limit pattern specifically and suggest a manual `--gas-limit` override flag rather than generically retrying (retrying blindly wastes gas on custom/local chains with no mempool replacement) |
| Nonce mismatch | `nonce too low` / `replacement transaction underpriced` | Before deploy, fetch `eth_getTransactionCount(address, "pending")` explicitly rather than trusting Hardhat's cached nonce, since local/custom chains are frequently reset between runs |
| Chain ID mismatch (user typo) | Compare `CHAIN_ID` env to `eth_chainId` response at pre-flight | Hard-fail before any compile/deploy attempt — this is the single most common footgun for custom-network setups |

```typescript
function classifyDeployError(stderr: string): DeploymentErrorKind {
  if (/nonce too low|replacement transaction underpriced/i.test(stderr)) return "NONCE_MISMATCH";
  if (/insufficient funds/i.test(stderr)) return "INSUFFICIENT_FUNDS";
  if (/out of gas|gas required exceeds/i.test(stderr)) return "OUT_OF_GAS";
  if (/ECONNREFUSED|ETIMEDOUT/i.test(stderr)) return "RPC_UNREACHABLE";
  if (/429|rate limit/i.test(stderr)) return "RPC_RATE_LIMITED";
  return "UNKNOWN";
}
```

---

## 6. Phased Implementation Roadmap

### Phase 1 — Minimal viable scaffolding (weeks 1–2)
- Monorepo skeleton, `packages/template-hardhat` and `packages/template-frontend` as static golden copies (hand-written, no agent involvement yet).
- CLI wizard collects network config + private key + writes `.env` (§3.2, §5.1).
- **No agent integration yet** — deliverable is: wizard → copy templates → `hardhat compile` → `hardhat deploy` on a hardcoded sample contract (`ERC20.sol` from OpenZeppelin) succeeds end to end.
- Deliverable: a human can run the CLI and get a deployed ERC-20 + a static, unstyled frontend that reads its `name()`/`symbol()`.

### Phase 2 — Agent-driven contract generation (weeks 3–4)
- Implement `AgentRunner` abstraction + `AntigravityRunner`/`OpenCodeRunner` (§2).
- Implement the self-healing compile loop (§3.1) with real agent calls, capped at 3 retries, tested against deliberately broken prompts to validate the retry loop actually converges.
- Deliverable: natural-language concept → agent-written, compiling Solidity contract, deployed via the Phase 1 pipeline.

### Phase 3 — Agent-driven frontend synthesis (weeks 5–6)
- Build the deterministic ABI→UI schema generator (§4.2).
- Write and iterate on `frontend.system.md` (§4.1) against 5–10 varied contract shapes (ERC-20, ERC-721, raffle/lottery, staking, multisig-lite) to validate the UI prompt generalizes.
- Wire `useContractField.ts` static hook templates so the agent only handles layout/styling, not type logic.
- Deliverable: end-to-end run from concept → deployed contract → styled, typed, working Next.js frontend, launched via `npm run dev`.

### Phase 4 — Full automated polish & hardening (weeks 7–8+)
- Redacting logger, pre-commit hook injection, RPC pre-flight checks, structured error classification (§5) fully wired into the pipeline with user-facing actionable messages (not raw stack traces).
- Add a `--dry-run` mode that runs contract generation + compile but skips deployment, for iterating on contract logic without spending gas.
- Add project regeneration support: re-run frontend synthesis only (skip contract/deploy) when a user tweaks the UI prompt but keeps the same deployed contract, reading the existing `project.manifest.json`.
- Add a lightweight local web UI (`apps/web-ui`) as an alternative front door to the same pipeline functions, if the CLI wizard proves the concept.
- Deliverable: polished, documented, open-source-ready v1.0 with a test suite covering the compile-retry loop, the ABI→UI mapper, and the error classifier.