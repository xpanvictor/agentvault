import { z } from 'zod';
import type { PDPStatus } from './storage.js';

// ---------------------------------------------------------------------------
// AgentCard — ERC-8004 compliant agent card schema
// ---------------------------------------------------------------------------

/**
 * AgentCardSchema — Zod validation for an ERC-8004 agent card.
 *
 * Describes an agent's identity, capabilities and supported protocols.
 * Stored on Filecoin at registration time.
 */
export const AgentCardSchema = z.object({
  /** Human-readable name for the agent. */
  name: z.string().min(1).max(100),

  /** Optional free-text description of what the agent does. */
  description: z.string().max(500).optional(),

  /** Semver-compatible version string. */
  version: z.string().default('1.0.0'),

  /**
   * List of capability identifiers this agent exposes.
   * e.g. ['search', 'summarize', 'analyze']
   */
  capabilities: z.array(z.string()).optional(),

  /**
   * Communication protocols the agent supports.
   * Constrained to known values to aid discovery/filtering.
   */
  protocols: z.array(z.enum(['mcp', 'a2a', 'x402', 'other'])).optional(),

  /** Well-known endpoint URLs for reaching this agent. */
  endpoints: z
    .object({
      /** Primary REST/JSON-RPC API endpoint. */
      api: z.string().url().optional(),
      /** Webhook for async event delivery. */
      webhook: z.string().url().optional(),
    })
    .optional(),

  /**
   * Whether this agent supports x402 micropayments.
   * Defaults to true — all AgentVault clients are expected to support it.
   */
  x402Support: z.boolean().default(true),
});

/** TypeScript type inferred from AgentCardSchema. */
export type AgentCard = z.infer<typeof AgentCardSchema>;

// ---------------------------------------------------------------------------
// Agent registration request
// ---------------------------------------------------------------------------

/**
 * RegisterAgentSchema — full registration payload.
 * Composes AgentCardSchema so card validation rules are shared.
 */
export const RegisterAgentSchema = z.object({
  /** Agent wallet address (EIP-55 checksummed or lowercase). */
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),

  /** Agent card metadata (will be uploaded to Filecoin). */
  agentCard: AgentCardSchema,

  /** EIP-191 personal_sign signature proving ownership of `address`. */
  signature: z.string(),
});

export type RegisterAgentRequest = z.infer<typeof RegisterAgentSchema>;

/**
 * Registered agent record — stored in IdentityService.
 */
export interface Agent {
  agentId: string;
  address: string;
  /** Validated agent card (see AgentCard / AgentCardSchema). */
  agentCard: AgentCard;
  /** PieceCID of the agent card pinned to Filecoin. */
  cardPieceCid: string;
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
  pieceCid: string;
  type: string;
  storedAt: number;
  size: number;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
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
    pieceCid?: string;
    vaultId?: string;
    size?: number;
    paymentId?: string;
    pdpStatus?: PDPStatus;
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
