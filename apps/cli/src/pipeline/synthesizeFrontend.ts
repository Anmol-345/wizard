import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildUiSchema } from "../utils/abi.js";
import type { AgentRunner } from "../agents/AgentRunner.js";
import { logger } from "../utils/logger.js";
import { fixFrontendWithSelfHealing } from "./fixFrontend.js";
import { safeExec } from "../utils/exec.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Boilerplate files written deterministically (no AI needed) ───────────────

function buildProvidersCode(projectName: string, chainId: number, rpcUrl: string, gasSymbol: string): string {
  return `"use client";

import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { generatedChain } from "@/config/contract";

const config = getDefaultConfig({
  appName: "${projectName}",
  projectId: "YOUR_PROJECT_ID",
  chains: [generatedChain],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#8b5cf6",
            accentColorForeground: "white",
            borderRadius: "large",
            overlayBlur: "small",
          })}
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#18181b",
                border: "1px solid #27272a",
                color: "#f4f4f5",
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
`;
}

function buildNavbarCode(projectName: string, chainId: number): string {
  return `"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { CONTRACT_ADDRESS, generatedChain } from "@/config/contract";
import { Zap, AlertTriangle } from "lucide-react";

export function Navbar() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && chainId !== generatedChain.id;
  const shortAddr = \`\${CONTRACT_ADDRESS.slice(0, 6)}...\${CONTRACT_ADDRESS.slice(-4)}\`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/30">
              <Zap className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <span className="text-base font-bold text-zinc-100 tracking-tight">${projectName}</span>
              <span className="ml-2 text-xs font-medium text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-2 py-0.5">
                dApp
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isWrongNetwork && (
              <button
                onClick={() => switchChain({ chainId: generatedChain.id })}
                className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Switch Network
              </button>
            )}
            <ConnectButton label="Connect Wallet" showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
      </div>
    </header>
  );
}
`;
}

function buildPageCode(projectName: string, contractAddress: string, chainId: number, conceptPrompt: string): string {
  // Derive a short, readable description from the concept prompt (first sentence / up to 120 chars)
  const conceptDescription = conceptPrompt.trim().length > 120
    ? conceptPrompt.trim().slice(0, 117) + "..."
    : conceptPrompt.trim();

  return `import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatCards } from "@/components/dashboard/StatCards";
import { ContractActions } from "@/components/dashboard/ContractActions";

export default function Home() {
  return (
    <>
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8 space-y-12 md:space-y-16">
        <DashboardHeader />
        <StatCards />
        <ContractActions />

        <footer className="mt-16 border-t border-zinc-200 dark:border-zinc-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>Built with <span className="font-semibold text-zinc-900 dark:text-zinc-100">DApp Wizard</span> · Wagmi v2 · RainbowKit · Next.js</p>
          <p className="font-mono">Chain ID: ${chainId}</p>
        </footer>
      </main>
    </>
  );
}
`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function synthesizeFrontend(
  projectDir: string,
  agent: AgentRunner,
  conceptPrompt: string
) {
  logger.info("Synthesizing frontend...");

  const manifestPath = path.join(projectDir, "project.manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);

  const { address, chainId, abi } = manifest;
  const rpcUrl = manifest.rpcUrl ?? "http://127.0.0.1:8545";
  const gasSymbol = manifest.gasSymbol ?? "ETH";
  const chainIdNum = Number(chainId);

  // Use the project folder name as the display name — the user typed it explicitly.
  // e.g. "reviewplz" → "Reviewplz", "vote-karo" → "Vote Karo"
  const projectName = path.basename(projectDir)
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const frontendDir = path.join(projectDir, "frontend");

  // ── Step 1: Write UI schema for the agent ──
  const uiSchema = buildUiSchema(abi);
  const uiDir = path.join(frontendDir, "lib", "ui");
  await mkdir(uiDir, { recursive: true });
  await writeFile(path.join(uiDir, "schema.json"), JSON.stringify(uiSchema, null, 2));

  // Copy useContractField template
  const hookTemplatePath = path.resolve(
    __dirname, "..", "..", "..", "..", "packages", "template-frontend", "lib", "ui", "useContractField.ts.template"
  );
  try {
    const hookCode = await readFile(hookTemplatePath, "utf-8");
    await writeFile(path.join(uiDir, "useContractField.ts"), hookCode);
  } catch (err: any) {
    logger.warn(`Could not copy useContractField template: ${err.message}`);
  }

  // ── Step 2: Write structural boilerplate files deterministically ──
  logger.info("Writing structural boilerplate files...");

  // 2a. globals.css — also wire up the display font variable
  const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 263.4 70% 50.4%;
    --primary-foreground: 210 40% 98%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 263.4 70% 50.4%;
    --radius: 0.75rem;
  }
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-zinc-950 text-zinc-100 antialiased;
    font-family: var(--font-inter), system-ui, -apple-system, sans-serif;
  }
  .font-display {
    font-family: var(--font-display), var(--font-inter), system-ui, sans-serif;
  }
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: #52525b; }

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
  opacity: 0.35;
}
`;
  // 2b. layout.tsx — two fonts: Inter (body) + Space Grotesk (display/headings)
  const layoutCode = `import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "${projectName} | dApp Dashboard",
  description: "Smart contract dashboard for ${projectName} — built with DApp Wizard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={\`dark \${inter.variable} \${spaceGrotesk.variable}\`}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;

  // Write all structural files
  await writeFile(path.join(frontendDir, "app", "globals.css"), globalsCss);
  await writeFile(path.join(frontendDir, "app", "layout.tsx"), layoutCode);
  await writeFile(
    path.join(frontendDir, "components", "providers.tsx"),
    buildProvidersCode(projectName, chainIdNum, rpcUrl, gasSymbol)
  );

  // Ensure directories exist
  await mkdir(path.join(frontendDir, "components", "layout"), { recursive: true });
  await mkdir(path.join(frontendDir, "components", "dashboard"), { recursive: true });
  await mkdir(path.join(frontendDir, "config"), { recursive: true });

  await writeFile(
    path.join(frontendDir, "components", "layout", "Navbar.tsx"),
    buildNavbarCode(projectName, chainIdNum)
  );
  await writeFile(
    path.join(frontendDir, "app", "page.tsx"),
    buildPageCode(projectName, address, chainIdNum, conceptPrompt)
  );

  // ── Write config/contract.ts deterministically ──
  // This is ALWAYS written from the manifest so the app boots even if the AI
  // skips writing it. The AI may overwrite it with a richer typed version.
  const contractTs = [
    `import { defineChain } from "viem";`,
    ``,
    `export const CONTRACT_ADDRESS = ${JSON.stringify(address)} as \`0x\${string}\`;`,
    ``,
    `export const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)} as const;`,
    ``,
    `export const generatedChain = defineChain({`,
    `  id: ${chainIdNum},`,
    `  name: "Localhost",`,
    `  nativeCurrency: { name: "${gasSymbol}", symbol: "${gasSymbol}", decimals: 18 },`,
    `  rpcUrls: { default: { http: [${JSON.stringify(rpcUrl)}] } },`,
    `});`,
  ].join("\n");
  await writeFile(path.join(frontendDir, "config", "contract.ts"), contractTs);

  // ── Write next.config.mjs (webpack stubs for @x402/* and walletconnect optional peer deps) ──
  const nextConfigCode = `/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
      "@x402/evm": false,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};
export default nextConfig;\n`;
  await writeFile(path.join(frontendDir, "next.config.mjs"), nextConfigCode);

  // ── Write dashboard component stubs (AI will overwrite with real implementations) ──
  const headerStub = `"use client";\nexport function DashboardHeader() {\n  return <div>Loading header...</div>;\n}\n`;
  const statStub = `"use client";\nexport function StatCards() {\n  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-400 text-sm">Loading stats\u2026</div></div>;\n}\n`;
  const actionsStub = `"use client";\nexport function ContractActions() {\n  return <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-400 text-sm">Loading actions\u2026</div></div>;\n}\n`;
  const dashDir = path.join(frontendDir, "components", "dashboard");
  const headerPath = path.join(dashDir, "DashboardHeader.tsx");
  const statPath = path.join(dashDir, "StatCards.tsx");
  const actionsPath = path.join(dashDir, "ContractActions.tsx");
  // Write stubs so page.tsx never has a missing import — AI will overwrite these
  await writeFile(headerPath, headerStub);
  await writeFile(statPath, statStub);
  await writeFile(actionsPath, actionsStub);

  logger.info("Structural files written. Invoking AI agent for contract-specific components...");


  // ── Step 3: Invoke AI agent for the 3 contract-specific dashboard files ──
  const systemTemplatePath = path.resolve(
    __dirname, "..", "..", "src", "agents", "promptTemplates", "frontend.system.md"
  );
  const systemPrompt = await readFile(systemTemplatePath, "utf-8");
  logger.info("System prompt loaded — AI will derive visual identity from concept.");

  const userPrompt = [
    "### DApp Concept",
    conceptPrompt,
    "",
    "### Contract Manifest",
    `Address: ${address}`,
    `Chain ID: ${chainIdNum}`,
    `RPC URL: ${rpcUrl}`,
    `Gas Symbol: ${gasSymbol}`,
    "",
    "### ABI UI Schema (use this to generate the components)",
    JSON.stringify(uiSchema, null, 2),
    "",
    "### Raw ABI (use this for the wagmi hooks — import CONTRACT_ABI from @/config/contract)",
    JSON.stringify(abi, null, 2),
  ].join("\n");

  const res = await agent.run({
    systemPromptOverride: systemPrompt,
    userPrompt,
    workingDir: frontendDir,
    allowedPaths: [
      "components/dashboard/**/*.tsx",
    ],
    expectedFiles: [
      "components/dashboard/DashboardHeader.tsx",
      "components/dashboard/StatCards.tsx",
      "components/dashboard/ContractActions.tsx",
    ],
    timeoutMs: 300_000,
  });

  if (!res.success) {
    logger.warn(`AI agent returned non-zero exit — will still attempt build fix loop.`);
  }

  // ── Step 4: npm install (ensure deps are present) ──
  logger.info("Installing frontend dependencies...");
  const npxCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  await safeExec(npxCmd, ["install", "--prefer-offline"], {
    cwd: frontendDir,
    timeoutMs: 120_000,
    env: process.env,
  });

  // ── Step 5: Build + self-heal loop ──
  logger.info("Running build validation and self-healing loop...");
  const fixResult = await fixFrontendWithSelfHealing(frontendDir, agent, conceptPrompt);

  if (!fixResult.success) {
    logger.warn(`Build still failing after ${fixResult.attempts} fix attempts. Manual review may be needed.`);
  } else {
    logger.info(`Build passed after ${fixResult.attempts} attempt(s).`);
  }

  logger.info("Frontend synthesis complete.");
}

/**
 * Deterministic-only synthesis — writes all structural boilerplate files WITHOUT
 * calling the AI agent. Used for fast testing via `dapp-wizard init --skip-ai`.
 */
export async function synthesizeFrontendDeterministic(
  projectDir: string,
  conceptPrompt: string
) {
  logger.info("Running deterministic-only frontend synthesis (no AI)...");

  const manifestPath = path.join(projectDir, "project.manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);

  const { address, chainId, abi } = manifest;
  const rpcUrl = manifest.rpcUrl ?? "http://127.0.0.1:8545";
  const gasSymbol = manifest.gasSymbol ?? "ETH";
  const chainIdNum = Number(chainId);

  const projectName = conceptPrompt
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const frontendDir = path.join(projectDir, "frontend");

  // Write UI schema
  const uiSchema = buildUiSchema(abi);
  const uiDir = path.join(frontendDir, "lib", "ui");
  await mkdir(uiDir, { recursive: true });
  await writeFile(path.join(uiDir, "schema.json"), JSON.stringify(uiSchema, null, 2));

  // Ensure directories exist
  await mkdir(path.join(frontendDir, "components", "layout"), { recursive: true });
  await mkdir(path.join(frontendDir, "components", "dashboard"), { recursive: true });
  await mkdir(path.join(frontendDir, "config"), { recursive: true });

  // Write all structural + config files
  const globalsCss = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer base {\n  :root {\n    --background: 240 10% 3.9%;\n    --foreground: 0 0% 98%;\n    --primary: 263.4 70% 50.4%;\n    --primary-foreground: 210 40% 98%;\n    --secondary: 240 3.7% 15.9%;\n    --secondary-foreground: 0 0% 98%;\n    --muted: 240 3.7% 15.9%;\n    --muted-foreground: 240 5% 64.9%;\n    --border: 240 3.7% 15.9%;\n    --input: 240 3.7% 15.9%;\n    --ring: 263.4 70% 50.4%;\n    --radius: 0.75rem;\n  }\n}\n\n@layer base {\n  * { @apply border-border; }\n  body { @apply bg-zinc-950 text-zinc-100 antialiased; }\n}\n`;

  await writeFile(path.join(frontendDir, "app", "globals.css"), globalsCss);
  await writeFile(path.join(frontendDir, "app", "layout.tsx"),
    `import type { Metadata } from "next";\nimport { Inter } from "next/font/google";\nimport "./globals.css";\nimport "@rainbow-me/rainbowkit/styles.css";\nimport { Providers } from "@/components/providers";\nconst inter = Inter({ subsets: ["latin"] });\nexport const metadata: Metadata = { title: "${projectName} | dApp Dashboard" };\nexport default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {\n  return (<html lang="en" className="dark"><body className={inter.className}><Providers>{children}</Providers></body></html>);\n}\n`
  );
  await writeFile(path.join(frontendDir, "components", "providers.tsx"), buildProvidersCode(projectName, chainIdNum, rpcUrl, gasSymbol));
  await writeFile(path.join(frontendDir, "components", "layout", "Navbar.tsx"), buildNavbarCode(projectName, chainIdNum));
  await writeFile(path.join(frontendDir, "app", "page.tsx"), buildPageCode(projectName, address, chainIdNum, conceptPrompt));

  // Write a placeholder config/contract.ts
  const contractTs = `import { defineChain } from "viem";\n\nexport const CONTRACT_ADDRESS = "${address}" as \`0x\${string}\`;\nexport const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)} as const;\n\nexport const generatedChain = defineChain({\n  id: ${chainIdNum},\n  name: "Localhost",\n  nativeCurrency: { name: "${gasSymbol}", symbol: "${gasSymbol}", decimals: 18 },\n  rpcUrls: { default: { http: ["${rpcUrl}"] } },\n});\n`;
  await writeFile(path.join(frontendDir, "config", "contract.ts"), contractTs);

  // Write placeholder dashboard stubs
  await writeFile(
    path.join(frontendDir, "components", "dashboard", "StatCards.tsx"),
    `"use client";\nexport function StatCards() {\n  return (\n    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">\n      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-400 text-sm">Run without --skip-ai to generate stat cards.</div>\n    </div>\n  );\n}\n`
  );
  await writeFile(
    path.join(frontendDir, "components", "dashboard", "ContractActions.tsx"),
    `"use client";\nexport function ContractActions() {\n  return (\n    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">\n      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-400 text-sm">Run without --skip-ai to generate contract action forms.</div>\n    </div>\n  );\n}\n`
  );

  logger.info("Deterministic synthesis complete.");
}
