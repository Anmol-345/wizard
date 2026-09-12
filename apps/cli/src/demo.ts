import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { writeProjectEnv } from "./config/envWriter.js";
import { AntigravityRunner } from "./agents/AntigravityRunner.js";
import { generateContracts } from "./pipeline/generateContracts.js";
import { compileWithSelfHealing } from "./pipeline/compileLoop.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Starting Non-Interactive Demo...");

  const slug = "demo-dapp";
  const concept = "An ERC20 token named DappCoin with a mint function limited to the owner. Include an initial supply of 1000000 tokens.";
  const config = {
    rpcUrl: "http://127.0.0.1:8545", // Local dummy
    chainId: 31337,
    gasSymbol: "ETH",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" 
  };

  const rootDir = path.resolve(__dirname, "..", "..", "..");
  const generatedDir = path.join(rootDir, "generated", slug);
  const contractsDir = path.join(generatedDir, "contracts");

  // Cleanup previous runs
  await fs.rm(generatedDir, { recursive: true, force: true });

  console.log(`Scaffolding project in ${generatedDir}...`);
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.cp(path.join(rootDir, "packages", "template-hardhat"), contractsDir, { recursive: true });
  
  await writeProjectEnv(contractsDir, config);

  const agent = new AntigravityRunner();
  
  console.log("\n[1/2] Generating contracts via Agent...");
  console.log(`Prompt: "${concept}"`);
  
  await generateContracts(contractsDir, agent, concept);
  
  console.log("\n[2/2] Compiling contracts (with self-healing)...");
  const compileResult = await compileWithSelfHealing(contractsDir, agent, concept);
  if (!compileResult.success) {
    throw new Error("Compilation failed.");
  }

  console.log("\nSuccess! Let's look at the generated contract:");
  
  const files = await fs.readdir(path.join(contractsDir, "contracts"));
  const solFile = files.find(f => f.endsWith(".sol"));
  if (solFile) {
    const code = await fs.readFile(path.join(contractsDir, "contracts", solFile), "utf-8");
    console.log(`\n--- ${solFile} ---\n`);
    console.log(code);
    console.log(`\n------------------\n`);
  }

  console.log("Demo dry-run complete!");
}

main().catch(console.error);
