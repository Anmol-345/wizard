import * as p from "@clack/prompts";

export async function runConceptPrompt() {
  const concept = await p.text({
    message: "Describe the smart contract you want to build:",
    placeholder: "An ERC20 token named DappCoin...",
    validate: (value) => {
      if (!value) return "Please provide a concept description.";
    }
  });

  if (p.isCancel(concept)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return concept as string;
}
