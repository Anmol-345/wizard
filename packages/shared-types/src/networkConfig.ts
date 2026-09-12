import { z } from "zod";

export const NetworkConfigSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.number().int().positive(),
  gasSymbol: z.string().min(1),
  privateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a valid 32-byte hex private key starting with 0x")
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
