import { spawn } from "child_process";
import path from "path";
import os from "os";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";

async function test() {
  const workingDir = "C:\\Users\\victus\\Documents\\My Codes\\Dapp Wizard\\generated\\answermeplz";
  
  const originalPrompt = `# ROLE
You are a senior Solidity engineer responsible for generating a secure, production-ready EVM smart contract based on a user's description.

# CONSTRAINTS
- Stack: Solidity ^0.8.26, OpenZeppelin v5.
- Modify the \`contracts/\` directory by writing your own \`.sol\` file. (The template has already been cleared).
- Write the file directly. You are running in an automated pipeline.
- DO NOT run any terminal commands (like npm install, hardhat compile, etc). The pipeline will compile the contract for you.
- IMPORTANT: When you have written the \`.sol\` file, you MUST stop calling tools to end your turn. Do not wait or ask for confirmation.
- Output high-quality, documented Solidity code.

# CRITICAL DESIGN RULE: STOP DEFAULTING TO TOKENS!
**Unless the user explicitly uses the word "token", "coin", or "currency", DO NOT GENERATE AN ERC20 CONTRACT!**

If the user asks for a "Review App", "Voting App", "Todo List", "Feedback System", etc.:
- YOU MUST write a custom data-structure contract (e.g., using \`struct\` and \`mapping\`).
- YOU MUST write custom logic functions (e.g., \`submitReview\`, \`vote\`, \`addTodo\`).
- DO NOT INCLUDE \`mint\`, \`transfer\`, \`balanceOf\`, \`totalSupply\`.

**HARD BANS:**
- ❌ Do NOT generate an ERC20 token unless the prompt literally asks for a cryptocurrency.
- ❌ Do NOT generate an NFT (ERC721) unless the prompt literally asks for a collectible/NFT.

**SELF-CHECK before writing:**
1. Did I just generate an ERC20 token for a Review/Feedback app? If yes, DELETE IT and write a real review contract.
2. Does my contract have functions that actually match what the user wants to do?

---

create a voting app where user can post question and other can vote yes or no`;

  const tmpFile = path.join(os.tmpdir(), `dapp-wizard-${randomUUID()}.md`);
  await writeFile(tmpFile, originalPrompt, "utf-8");

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
    "--print-timeout", `5m`,
    "--model", "Gemini 3.1 Pro (High)"
  ];

  console.log("Spawning agy with args:", args);

  const child = spawn("agy.exe", args, {
    cwd: workingDir,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    console.log("Exited with code:", code);
  });
}

test();
