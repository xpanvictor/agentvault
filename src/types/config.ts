import { z } from 'zod';

/**
 * Configuration schema for AgentVault
 */
export const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(3500),
    host: z.string().default('0.0.0.0'),
  }),
  x402: z.object({
    apiUrl: z.string().url(),
    timeout: z.number().default(30000),
  }),
  storage: z.object({
    provider: z.enum(['mock', 'web3storage', 'lighthouse']).default('mock'),
    web3StorageToken: z.string().optional(),
  }),
  identity: z.object({
    enabled: z.boolean().default(false),
    registryAddress: z.string().optional(),
    chainRpc: z.string().optional(),
  }),
  filecoin: z.object({
    network: z.enum(['calibration', 'mainnet']).default('calibration'),
    rpc: z.string().url(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config = {
    server: {
      port: parseInt(process.env.PORT || '3500'),
      host: process.env.HOST || '0.0.0.0',
    },
    x402: {
      apiUrl: process.env.X402_API_URL || 'http://localhost:3402',
      timeout: parseInt(process.env.X402_API_TIMEOUT || '30000'),
    },
    storage: {
      provider: (process.env.STORAGE_PROVIDER || 'mock') as 'mock' | 'web3storage' | 'lighthouse',
      web3StorageToken: process.env.WEB3_STORAGE_TOKEN,
    },
    identity: {
      enabled: process.env.IDENTITY_ENABLED === 'true',
      registryAddress: process.env.IDENTITY_REGISTRY_ADDRESS,
      chainRpc: process.env.IDENTITY_CHAIN_RPC,
    },
    filecoin: {
      network: (process.env.FILECOIN_NETWORK || 'calibration') as 'calibration' | 'mainnet',
      rpc: process.env.FILECOIN_RPC || 'https://api.calibration.node.glif.io/rpc/v1',
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    },
  };

  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
}
