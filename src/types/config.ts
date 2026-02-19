import { z } from 'zod';

/**
 * Configuration schema for AgentVault
 *
 * Storage uses @filoz/synapse-sdk with wallet-based auth (no API key)
 * See: https://docs.filecoin.cloud/developer-guides/synapse/
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
    provider: z.enum(['mock', 'synapse']).default('mock'),
    // Wallet private key for Synapse SDK authentication
    privateKey: z.string().optional(),
  }),
  filecoin: z.object({
    network: z.enum(['calibration', 'mainnet']).default('calibration'),
    // WebSocket RPC URL for Synapse SDK
    rpcUrl: z.string().default('wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1'),
    // USDFC token contract address
    usdfcAddress: z.string().default('0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0'),
  }),
  identity: z.object({
    enabled: z.boolean().default(false),
    registryAddress: z.string().optional(),
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
      provider: (process.env.STORAGE_PROVIDER || 'mock') as 'mock' | 'synapse',
      privateKey: process.env.STORAGE_PRIVATE_KEY,
    },
    filecoin: {
      network: (process.env.FILECOIN_NETWORK || 'calibration') as 'calibration' | 'mainnet',
      rpcUrl: process.env.FILECOIN_RPC_URL || 'wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1',
      usdfcAddress: process.env.USDFC_ADDRESS || '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
    },
    identity: {
      enabled: process.env.IDENTITY_ENABLED === 'true',
      registryAddress: process.env.IDENTITY_REGISTRY_ADDRESS,
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
