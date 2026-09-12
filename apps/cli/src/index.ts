#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import color from "picocolors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./utils/logger.js";
import { AntigravityRunner } from "./agents/AntigravityRunner.js";
import { synthesizeFrontend } from "./pipeline/synthesizeFrontend.js";
import { generateContracts } from "./pipeline/generateContracts.js";

const program = new Command();

program
  .name("dapp-wizard")
  .description("EVM dApp Frontend Generator — powered by AI")
  .version("1.0.0");

// ─── `generate` — full AI frontend generation from a concept prompt ──────────
program
  .command("generate")
  .alias("g")
  .description("Generate a premium dApp frontend UI from a natural language prompt")
  .option("--slug <slug>", "Project name slug (skips interactive prompt)")
  .option("--model <model>", "Override the agy model (e.g. gemini-2.5-pro)")
  .action(async (opts) => {
    p.intro(color.bgMagenta(color.white(" ⚡ DApp Wizard — AI Frontend Generator ")));

    // ── 1. Concept prompt ──
    const concept = await p.text({
      message: "Describe your smart contract and dApp:",
      placeholder: "A governance token called VoteToken where users can mint, transfer, and check balances...",
      validate: (v) => (!v?.trim() ? "Please describe your contract." : undefined),
    });
    if (p.isCancel(concept)) { p.cancel("Cancelled."); process.exit(0); }

    // ── 2. Project slug ──
    const slugInput = opts.slug ?? await p.text({
      message: "Project name (used as folder name):",
      placeholder: "my-dapp",
      defaultValue: "my-dapp",
      validate: (v) => {
        if (!v?.trim()) return "Name is required.";
        if (!/^[a-z0-9-]+$/.test(v)) return "Use lowercase letters, numbers, and hyphens only.";
      },
    });
    if (p.isCancel(slugInput)) { p.cancel("Cancelled."); process.exit(0); }
    const slug = slugInput as string;

    // ── 3. Contract address (optional) ──
    const addressInput = await p.text({
      message: "Deployed contract address (press Enter to use a placeholder):",
      placeholder: "0x… leave blank for mock address",
      defaultValue: "0x0000000000000000000000000000000000000000",
    });
    if (p.isCancel(addressInput)) { p.cancel("Cancelled."); process.exit(0); }
    const address = (addressInput as string).trim() || "0x0000000000000000000000000000000000000000";

    // ── 4. Resolve paths ──
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootDir = path.resolve(__dirname, "..", "..", "..");
    const generatedDir = path.join(process.cwd(), "generated", slug);
    const frontendDir = path.join(generatedDir, "frontend");

    const spinner = p.spinner();

    try {
      // ── 5. Scaffold base template ──
      spinner.start("Scaffolding templates…");
      await fs.mkdir(generatedDir, { recursive: true });
      // Scaffold frontend
      await fs.cp(
        path.join(rootDir, "packages", "template-frontend"),
        frontendDir,
        { recursive: true }
      );
      // Scaffold hardhat (smart contract environment)
      await fs.cp(
        path.join(rootDir, "packages", "template-hardhat"),
        generatedDir,
        { recursive: true }
      );

      // Strip .template extensions from hardhat files
      const hardhatFiles = await fs.readdir(generatedDir, { recursive: true });
      for (const file of hardhatFiles) {
        if (typeof file === "string" && file.endsWith(".template")) {
          const oldPath = path.join(generatedDir, file);
          const newPath = path.join(generatedDir, file.replace(/\.template$/, ""));
          await fs.rename(oldPath, newPath);
        }
      }

      spinner.stop(color.green("✓ Templates scaffolded"));

      // ── 6. Generate Smart Contract & ABI via AI ──
      const agent = new AntigravityRunner();
      if (opts.model) (agent as any)._model = opts.model;

      p.log.step("Generating smart contract & ABI — this takes a minute…");
      await generateContracts(generatedDir, agent, concept as string);

      // Overwrite the address/chainId if the user provided it (the AI might have used a placeholder)
      try {
        const manifestPath = path.join(generatedDir, "project.manifest.json");
        const manifestRaw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestRaw);
        manifest.address = address;
        manifest.chainId = "31337";
        manifest.rpcUrl = "http://127.0.0.1:8545";
        manifest.gasSymbol = "ETH";

        // Prompt user to select which functions to include in the UI
        if (manifest.abi && Array.isArray(manifest.abi)) {
          const functions = manifest.abi.filter((item: any) => item.type === "function");
          if (functions.length > 0) {
            const options = functions.map((f: any) => ({
              value: f.name,
              label: f.name,
              hint: f.stateMutability === "view" || f.stateMutability === "pure" ? "read" : "write"
            }));
            const selectedFunctions = await p.multiselect({
              message: "Select which smart contract functions to include in the UI:",
              options,
              required: true
            });
            if (p.isCancel(selectedFunctions)) {
              p.cancel("Cancelled.");
              process.exit(0);
            }
            manifest.includedFunctions = selectedFunctions;
          }
        }

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      } catch (e) {
        logger.warn("Could not patch project.manifest.json with custom address.");
      }

      // ── 7. AI frontend synthesis ──
      p.log.step("Starting AI Frontend generation — this takes 2–5 minutes…");
      p.log.info(color.dim("agy output will stream below:\n"));

      await synthesizeFrontend(generatedDir, agent, concept as string);

      // ── 8. Done ──
      p.outro(
        color.green(`✅  Generated: generated/${slug}/frontend\n\n`) +
        color.bold("Next steps:\n") +
        color.dim(`  cd generated/${slug}/frontend\n`) +
        color.dim(`  npm install\n`) +
        color.dim(`  npm run dev\n`) +
        color.dim(`  → open http://localhost:3000`)
      );

    } catch (err: any) {
      spinner.stop(color.red("✗ Generation failed"), 1);
      logger.error(err.message || String(err));
      process.exit(1);
    }
  });

// Keep `init` as alias for `generate` for backwards compat
program
  .command("init")
  .description("Alias for generate")
  .option("--slug <slug>", "Project name slug")
  .option("--model <model>", "Override the agy model")
  .action(async (opts) => {
    // Re-invoke generate
    const generateCmd = program.commands.find(c => c.name() === "generate")!;
    await generateCmd.parseAsync(process.argv.slice(2).filter(a => a !== "init"), { from: "user" });
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

program.parse(process.argv);
