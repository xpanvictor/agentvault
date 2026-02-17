import { z } from 'zod';

/**
 * Request to store data
 */
export const StoreRequestSchema = z.object({
  // Agent identification
  agentId: z.string().min(1),

  // Data to store
  data: z.string().min(1),

  // Optional metadata
  metadata: z.object({
    type: z.enum(['decision_log', 'conversation', 'dataset', 'state', 'other']).default('other'),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),

  // x402 payment (EIP-3009 authorization)
  payment: z.object({
    from: z.string(),
    to: z.string(),
    value: z.string(),
    validAfter: z.string(),
    validBefore: z.string(),
    nonce: z.string(),
    signature: z.string(),
    token: z.string(),
  }),
});

export type StoreRequest = z.infer<typeof StoreRequestSchema>;

/**
 * Response after storing data
 */
export interface StoreResponse {
  success: boolean;
  vaultId: string;
  cid: string;
  agentId: string;
  storedAt: number;
  size: number;
  paymentId?: string;
  error?: string;
}

/**
 * Request to retrieve data
 */
export const RetrieveRequestSchema = z.object({
  // Identify what to retrieve
  cid: z.string().optional(),
  vaultId: z.string().optional(),

  // Agent making the request
  agentId: z.string().min(1),

  // x402 payment for retrieval
  payment: z.object({
    from: z.string(),
    to: z.string(),
    value: z.string(),
    validAfter: z.string(),
    validBefore: z.string(),
    nonce: z.string(),
    signature: z.string(),
    token: z.string(),
  }),
}).refine(data => data.cid || data.vaultId, {
  message: 'Either cid or vaultId must be provided',
});

export type RetrieveRequest = z.infer<typeof RetrieveRequestSchema>;

/**
 * Response when retrieving data
 */
export interface RetrieveResponse {
  success: boolean;
  data?: string;
  cid: string;
  vaultId: string;
  metadata?: {
    type: string;
    description?: string;
    tags?: string[];
    storedAt: number;
    storedBy: string;
  };
  error?: string;
}

/**
 * Vault entry stored in the index
 */
export interface VaultEntry {
  vaultId: string;
  cid: string;
  agentId: string;
  dataHash: string;
  size: number;
  storedAt: number;
  metadata?: {
    type: string;
    description?: string;
    tags?: string[];
  };
  paymentId?: string;
}

/**
 * Verification response
 */
export interface VerifyResponse {
  exists: boolean;
  cid: string;
  vaultId?: string;
  storedBy?: string;
  storedAt?: number;
  verified: boolean;
}
