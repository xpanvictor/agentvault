import { z } from 'zod';

/**
 * PDP (Proof of Data Possession) status
 */
export type PDPStatus = 'pending' | 'verified' | 'failed';

/**
 * x402 payment payload (EIP-3009 authorization)
 */
export const PaymentSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
  signature: z.string(),
  token: z.string(),
});

export type Payment = z.infer<typeof PaymentSchema>;

/**
 * Payment requirements returned in 402 response
 * Tells the agent how to pay for the request
 */
export const PaymentRequirementsSchema = z.object({
  payTo: z.string(),              // Facilitator wallet address
  maxAmountRequired: z.string(),  // Amount in USDFC smallest units
  tokenAddress: z.string(),       // USDFC contract address
  chainId: z.number(),            // 314159 (Calibration) or 314 (Mainnet)
  resource: z.string().optional(), // API endpoint being accessed
  description: z.string().optional(),
});

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

/**
 * Request to store data
 * Note: Payment comes from x-payment header, not request body
 */
export const StoreRequestSchema = z.object({
  agentId: z.string().min(1),
  data: z.string().min(1),
  metadata: z.object({
    type: z.enum(['decision_log', 'conversation', 'dataset', 'state', 'other']).default('other'),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});

export type StoreRequest = z.infer<typeof StoreRequestSchema>;

/**
 * Response after storing data
 */
export interface StoreResponse {
  success: boolean;
  vaultId: string;
  pieceCid: string;
  agentId: string;
  storedAt: number;
  size: number;
  pdpStatus: PDPStatus;
  paymentId?: string;
  error?: string;
}

/**
 * Request to retrieve data
 * Note: Payment comes from x-payment header, not request body
 * The id (vaultId or pieceCid) comes from URL param
 */
export const RetrieveRequestSchema = z.object({
  agentId: z.string().min(1).optional(), // Optional - for logging/audit
});

export type RetrieveRequest = z.infer<typeof RetrieveRequestSchema>;

/**
 * Response when retrieving data
 */
export interface RetrieveResponse {
  success: boolean;
  data?: string;
  pieceCid: string;
  vaultId: string;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
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
  pieceCid: string;
  agentId: string;
  dataHash: string;
  size: number;
  storedAt: number;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
  metadata?: {
    type: string;
    description?: string;
    tags?: string[];
  };
  paymentId?: string;
}

/**
 * PDP verification response (lightweight check)
 */
export interface PDPVerifyResponse {
  exists: boolean;
  pieceCid: string;
  vaultId?: string;
  storedBy?: string;
  storedAt?: number;
  pdpVerified: boolean;
  pdpVerifiedAt?: number;
}

/**
 * Storage provider interface
 */
export interface IStorageProvider {
  upload(data: string, metadata?: object): Promise<UploadResult>;
  retrieve(pieceCid: string): Promise<RetrieveResult>;
  verifyPDP(pieceCid: string): Promise<PDPVerifyResult>;
}

export interface UploadResult {
  success: boolean;
  pieceCid: string;
  size: number;
  pdpStatus: PDPStatus;
  error?: string;
}

export interface RetrieveResult {
  success: boolean;
  data?: string;
  pdpStatus: PDPStatus;
  error?: string;
}

export interface PDPVerifyResult {
  verified: boolean;
  proof?: object;
  verifiedAt?: number;
  error?: string;
}

// Generic trait-like storage data for consistency
// Synapse & prolly use in other providers
export type StorageData = {
  data: string;
  metadata?: Record<string, unknown> | object;
  uploadedAt: number;
  size: number; // for consistency with mock type
}