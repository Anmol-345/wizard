export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  gasSymbol: string;
  isTestnet: boolean;
  blockExplorerUrl?: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  // Ethereum
  "eth-mainnet": { id: "eth-mainnet", name: "Ethereum Mainnet", chainId: 1, rpcUrl: "https://eth.llamarpc.com", gasSymbol: "ETH", isTestnet: false },
  "eth-sepolia": { id: "eth-sepolia", name: "Ethereum Sepolia", chainId: 11155111, rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", gasSymbol: "ETH", isTestnet: true },
  
  // Polygon
  "polygon-mainnet": { id: "polygon-mainnet", name: "Polygon Mainnet", chainId: 137, rpcUrl: "https://polygon-rpc.com", gasSymbol: "POL", isTestnet: false },
  "polygon-amoy": { id: "polygon-amoy", name: "Polygon Amoy", chainId: 80002, rpcUrl: "https://rpc-amoy.polygon.technology", gasSymbol: "POL", isTestnet: true },
  
  // Avalanche
  "avax-mainnet": { id: "avax-mainnet", name: "Avalanche C-Chain", chainId: 43114, rpcUrl: "https://api.avax.network/ext/bc/C/rpc", gasSymbol: "AVAX", isTestnet: false },
  "avax-fuji": { id: "avax-fuji", name: "Avalanche Fuji", chainId: 43113, rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc", gasSymbol: "AVAX", isTestnet: true },
  
  // BNB Chain
  "bnb-mainnet": { id: "bnb-mainnet", name: "BNB Smart Chain", chainId: 56, rpcUrl: "https://bsc-dataseed.binance.org", gasSymbol: "BNB", isTestnet: false },
  "bnb-testnet": { id: "bnb-testnet", name: "BNB Testnet", chainId: 97, rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545", gasSymbol: "tBNB", isTestnet: true },
  
  // Base
  "base-mainnet": { id: "base-mainnet", name: "Base Mainnet", chainId: 8453, rpcUrl: "https://mainnet.base.org", gasSymbol: "ETH", isTestnet: false },
  "base-sepolia": { id: "base-sepolia", name: "Base Sepolia", chainId: 84532, rpcUrl: "https://sepolia.base.org", gasSymbol: "ETH", isTestnet: true },
  
  // Arbitrum
  "arb-mainnet": { id: "arb-mainnet", name: "Arbitrum One", chainId: 42161, rpcUrl: "https://arb1.arbitrum.io/rpc", gasSymbol: "ETH", isTestnet: false },
  "arb-sepolia": { id: "arb-sepolia", name: "Arbitrum Sepolia", chainId: 421614, rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc", gasSymbol: "ETH", isTestnet: true },
  
  // Optimism
  "op-mainnet": { id: "op-mainnet", name: "Optimism Mainnet", chainId: 10, rpcUrl: "https://mainnet.optimism.io", gasSymbol: "ETH", isTestnet: false },
  "op-sepolia": { id: "op-sepolia", name: "Optimism Sepolia", chainId: 11155420, rpcUrl: "https://sepolia.optimism.io", gasSymbol: "ETH", isTestnet: true },
  
  // Solana via Neon EVM (Allows deploying Solidity to Solana ecosystem)
  "neon-mainnet": { id: "neon-mainnet", name: "Neon EVM (Solana)", chainId: 245022934, rpcUrl: "https://neon-proxy-mainnet.pyth.network", gasSymbol: "NEON", isTestnet: false },
  "neon-devnet": { id: "neon-devnet", name: "Neon EVM Devnet (Solana)", chainId: 245022926, rpcUrl: "https://devnet.neonevm.org", gasSymbol: "NEON", isTestnet: true },
  
  // Robinhood Network (Placeholder / Generic L2 if applicable)
  "robinhood-testnet": { id: "robinhood-testnet", name: "Robinhood Network Testnet", chainId: 1337, rpcUrl: "https://rpc.robinhood.network", gasSymbol: "RBH", isTestnet: true },
  
  // Botchain (Placeholder)
  "botchain-mainnet": { id: "botchain-mainnet", name: "Botchain Mainnet", chainId: 1338, rpcUrl: "https://rpc.botchain.network", gasSymbol: "BOT", isTestnet: false },
  
  // Local
  "localhost": { id: "localhost", name: "Localhost (Hardhat)", chainId: 31337, rpcUrl: "http://127.0.0.1:8545", gasSymbol: "ETH", isTestnet: true },
};
