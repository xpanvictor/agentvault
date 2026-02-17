import { z } from 'zod';

/**
 * Agent registration request
 */
export const RegisterAgentSchema = z.object({
  // Agent wallet address
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),

  // Agent metadata (will be stored on Filecoin)
  agentCard: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    version: z.string().default('1.0.0'),
    capabilities: z.array(z.string()).optional(),
    protocols: z.array(z.enum(['mcp', 'a2a', 'x402', 'other'])).optional(),
    endpoints: z.object({
      api: z.string().url().optional(),
      webhook: z.string().url().optional(),
    }).optional(),
    x402Support: z.boolean().default(true),
  }),

  // Signature proving ownership of address
  signature: z.string(),
});

export type RegisterAgentRequest = z.infer<typeof RegisterAgentSchema>;

/**
 * Registered agent record
 */
export interface Agent {
  agentId: string;
  address: string;
  agentCard: {
    name: string;
    description?: string;
    version: string;
    capabilities?: string[];
    protocols?: string[];
    endpoints?: {
      api?: string;
      webhook?: string;
    };
    x402Support: boolean;
  };
  cardCid: string;
  registeredAt: number;
  storageManifest: StorageManifestEntry[];
  reputation: {
    totalStored: number;
    totalRetrieved: number;
    verificationScore: number;
  };
}

/**
 * Storage manifest entry - tracks what an agent has stored
 */
export interface StorageManifestEntry {
  vaultId: string;
  cid: string;
  type: string;
  storedAt: number;
  size: number;
}

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: 'store' | 'retrieve' | 'verify' | 'register';
  details: {
    cid?: string;
    vaultId?: string;
    size?: number;
    paymentId?: string;
    success: boolean;
    error?: string;
  };
}

/**
 * Agent lookup response
 */
export interface AgentLookupResponse {
  found: boolean;
  agent?: Agent;
  error?: string;
}

/**
 * Audit trail response
 */
export interface AuditTrailResponse {
  agentId: string;
  entries: AuditEntry[];
  summary: {
    totalOperations: number;
    totalStored: number;
    totalRetrieved: number;
    lastActivity: number;
  };
}
