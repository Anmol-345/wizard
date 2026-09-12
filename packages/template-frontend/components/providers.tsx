"use client";

import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
// NOTE: config/contract.ts is written by the AI agent — it exports `generatedChain`
// Fallback to localhost if not yet generated
let generatedChain: Parameters<typeof getDefaultConfig>[0]["chains"][number];
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@/config/contract");
  generatedChain = mod.generatedChain;
} catch {
  const { defineChain } = require("viem");
  generatedChain = defineChain({
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  });
}

const config = getDefaultConfig({
  appName: "DApp Wizard",
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
