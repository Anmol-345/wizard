import * as p from "@clack/prompts";

export async function runNetworkPrompt() {
  const group = await p.group(
    {
      rpcUrl: () => p.text({
        message: "Enter the RPC URL",
        placeholder: "http://127.0.0.1:8545",
        defaultValue: "http://127.0.0.1:8545",
      }),
      chainId: () => p.text({
        message: "Enter the Chain ID",
        placeholder: "31337",
        defaultValue: "31337",
      }),
      gasSymbol: () => p.text({
        message: "Enter the Native Gas Symbol",
        placeholder: "ETH",
        defaultValue: "ETH",
      }),
      privateKey: () => p.password({
        message: "Enter your deployer private key (0x...)",
        validate: (value) => {
          if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return "Must be a valid 32-byte hex key starting with 0x";
        }
      })
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    }
  );

  return {
    ...group,
    chainId: Number(group.chainId)
  };
}
