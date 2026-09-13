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
import { deployContract } from "./pipeline/deploy.js";
import { CHAINS, ChainConfig } from "./config/chains.js";
import { estimateDeploymentCost } from "./pipeline/estimateGas.js";
import * as dotenv from "dotenv";

// Load workspace .env for burner wallet
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
dotenv.config({ path: path.resolve(_dirname, "..", "..", "..", ".env") });


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

    // ── 3. Chain Selection ──
    const chainOptions = Object.values(CHAINS).map(c => ({
      value: c,
      label: `${c.name} ${c.isTestnet ? "(Testnet)" : "(Mainnet)"}`
    }));
    chainOptions.push({
      value: "custom" as any,
      label: "Custom RPC..."
    });

    const selectedChainResponse = await p.select({
      message: "Which chain do you want to build for?",
      options: chainOptions,
      maxItems: 10,
    });
    if (p.isCancel(selectedChainResponse)) { p.cancel("Cancelled."); process.exit(0); }
    
    let chainConfig: ChainConfig;
    if (selectedChainResponse === "custom") {
      const customRpc = await p.text({ message: "Enter Custom RPC URL:", validate: (v) => !v ? "Required" : undefined });
      if (p.isCancel(customRpc)) { p.cancel("Cancelled."); process.exit(0); }
      const customChainId = await p.text({ message: "Enter Chain ID:", validate: (v) => !v ? "Required" : undefined });
      if (p.isCancel(customChainId)) { p.cancel("Cancelled."); process.exit(0); }
      
      chainConfig = {
        id: "custom",
        name: "Custom Chain",
        chainId: Number(customChainId),
        rpcUrl: customRpc as string,
        gasSymbol: "ETH",
        isTestnet: false
      };
    } else {
      chainConfig = selectedChainResponse as ChainConfig;
    }

    // ── 4. Deployment Mode ──
    const deployMode = await p.select({
      message: "Do you want to deploy the contract automatically?",
      options: [
        { value: "deploy", label: "Yes, deploy it live using my burner wallet (.env)" },
        { value: "ui-only", label: "No, just generate the UI (I will deploy manually later)" }
      ]
    });
    if (p.isCancel(deployMode)) { p.cancel("Cancelled."); process.exit(0); }

    let burnerKey = process.env.DEPLOYER_PRIVATE_KEY;
    let burnerAddress = process.env.DEPLOYER_ADDRESS;

    if (deployMode === "deploy") {
      if (!burnerKey || !burnerAddress) {
        p.log.error(color.red("DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS is missing from your workspace .env file!"));
        process.exit(1);
      }
      
      const spinnerGas = p.spinner();
      spinnerGas.start("Estimating deployment cost...");
      const estimatedCost = await estimateDeploymentCost(chainConfig.rpcUrl, burnerAddress);
      spinnerGas.stop(color.blue("Estimation complete"));

      const confirm = await p.confirm({
        message: `\n${color.bgBlue(color.white(" DEPLOYMENT ESTIMATE "))}\n` +
                 `Chain: ${chainConfig.name}\n` +
                 `Burner Wallet: ${burnerAddress}\n` +
                 `Estimated Cost: ~${estimatedCost} ${chainConfig.gasSymbol}\n\n` +
                 `Ensure your burner wallet is funded on this chain. Proceed?`,
        initialValue: true
      });
      if (!confirm || p.isCancel(confirm)) { p.cancel("Cancelled."); process.exit(0); }
    }

    let address = "0x0000000000000000000000000000000000000000";
    if (deployMode === "ui-only") {
      const addressInput = await p.text({
        message: "Enter placeholder/existing contract address (press Enter to use mock):",
        placeholder: "0x…",
        defaultValue: "0x0000000000000000000000000000000000000000",
      });
      if (p.isCancel(addressInput)) { p.cancel("Cancelled."); process.exit(0); }
      address = (addressInput as string).trim() || address;
    }

    // ── 5. Resolve paths ──
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

      // ── 7. Configure Network and Optionally Deploy ──
      
      // Write the .env file to the hardhat project so it can deploy using the selected chain and burner key
      const projectEnv = `RPC_URL=${chainConfig.rpcUrl}\nCHAIN_ID=${chainConfig.chainId}\nDEPLOYER_PRIVATE_KEY=${burnerKey || "0x0000000000000000000000000000000000000000000000000000000000000001"}\n`;
      await fs.writeFile(path.join(generatedDir, ".env"), projectEnv);
      
      // If deploy mode, run the deployment
      if (deployMode === "deploy") {
        p.log.step(`Deploying to ${chainConfig.name}...`);
        
        // We need to parse the generated contract name from the manifest to deploy it.
        const manifestRaw = await fs.readFile(path.join(generatedDir, "project.manifest.json"), "utf-8");
        const manifestParsed = JSON.parse(manifestRaw);
        
        // We assume the deployContract function deploys and returns the deployed address
        try {
          // This will run hardhat deploy and the script will patch the manifest with the real address
          await deployContract(generatedDir, manifestParsed.name || "Contract", manifestParsed.fileName || "Contract.sol");
          p.log.success("Contract successfully deployed!");
          
          // Re-read manifest to get the deployed address
          const newManifestRaw = await fs.readFile(path.join(generatedDir, "project.manifest.json"), "utf-8");
          const newManifest = JSON.parse(newManifestRaw);
          address = newManifest.address;
        } catch (err: any) {
          logger.error(`Deployment failed: ${err.message}`);
          p.log.warn("Falling back to UI-only mode with a placeholder address.");
        }
      }

      // Overwrite the address/chainId in manifest
      try {
        const manifestPath = path.join(generatedDir, "project.manifest.json");
        const manifestRaw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestRaw);
        manifest.address = address;
        manifest.chainId = chainConfig.chainId.toString();
        manifest.rpcUrl = chainConfig.rpcUrl;
        manifest.gasSymbol = chainConfig.gasSymbol;
        manifest.chainName = chainConfig.name;

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

      // ── 8. AI frontend synthesis ──
      p.log.step("Starting AI Frontend generation — this takes 2–5 minutes…");
      p.log.info(color.dim("agy output will stream below:\n"));

      await synthesizeFrontend(generatedDir, agent, concept as string);

      // ── 9. Done ──
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

// ─── `tweak` — ask AI to fix or modify an existing project ──────────
program
  .command("tweak")
  .alias("t")
  .description("Ask AI to tweak, fix, or modify an existing generated project")
  .option("--model <model>", "Override the agy model (e.g. gemini-2.5-pro)")
  .action(async (opts) => {
    p.intro(color.bgCyan(color.black(" 🛠️ DApp Wizard — Tweak Mode ")));

    const _filename = fileURLToPath(import.meta.url);
    const _dirname = path.dirname(_filename);
    const rootDir = path.resolve(_dirname, "..", "..", "..");
    const generatedDir = path.join(rootDir, "generated");
    
    try {
      const items = await fs.readdir(generatedDir, { withFileTypes: true });
      const folders = items.filter(item => item.isDirectory()).map(item => item.name);
      if (folders.length === 0) throw new Error();
      
      const projectSlug = await p.select({
        message: "Which project would you like to tweak?",
        options: folders.map(f => ({ value: f, label: f }))
      });
      if (p.isCancel(projectSlug)) { p.cancel("Cancelled."); process.exit(0); }
      
      const tweakInstruction = await p.text({
        message: "What would you like the AI to change or fix?",
        placeholder: "e.g., Fix the broken wagmi integration in ContractActions",
        validate: (v) => (!v?.trim() ? "Please provide an instruction." : undefined),
      });
      if (p.isCancel(tweakInstruction)) { p.cancel("Cancelled."); process.exit(0); }
      
      const projectDir = path.join(generatedDir, projectSlug as string);
      
      p.log.step(`Applying tweaks to ${projectSlug}…`);
      p.log.info(color.dim("agy output will stream below:\n"));
      
      const agent = new AntigravityRunner();
      if (opts.model) (agent as any)._model = opts.model;
      
      const systemPromptPath = path.resolve(_dirname, "..", "src", "agents", "promptTemplates", "tweak.system.md");
      
      const res = await agent.run({
        systemPromptPath,
        userPrompt: tweakInstruction as string,
        workingDir: projectDir,
        allowedPaths: ["**/*"],
        expectedFiles: [], 
        timeoutMs: 900_000,
        model: opts.model || "gemini-1.5-pro",
      });
      
      if (!res.success) {
        p.log.error(color.red(`Tweak failed: ${res.stderr || res.stdout}`));
        process.exit(1);
      }
      
      p.outro(color.green(`✅  Tweaks successfully applied to ${projectSlug}!`));
    } catch (e: any) {
      p.log.error(color.red("Could not find any generated projects. Run `generate` first."));
      console.error(e);
      process.exit(1);
    }
  });

program.parse(process.argv);
