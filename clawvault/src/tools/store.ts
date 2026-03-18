import type { AgentVaultClient, StoreMeta, StoreResult } from '../client.js';

export interface StoreParams {
  /** The data to store — JSON string, plain text, or any string payload. */
  data: string;
  /** Vault type for search and audit filtering. Defaults to 'other'. */
  type?: StoreMeta['type'];
  /** Human-readable description stored alongside the data. */
  description?: string;
  /** Searchable tags. */
  tags?: string[];
}

export interface StoreToolResult {
  vaultId: string;
  pieceCid: string;
  size: number;
  pdpStatus: string;
  /** True when PDP proof has been verified on Filecoin. */
  verified: boolean;
}

/**
 * vault.store() — store agent data verifiably on Filecoin.
 *
 * Handles the x402 payment flow automatically:
 *  1. Probes the endpoint (→ 402 with payment requirements)
 *  2. Signs an EIP-3009 TransferWithAuthorization
 *  3. Retries with the signed payment header (→ 201 with vault info)
 */
export async function store(
  client: AgentVaultClient,
  agentId: string,
  params: StoreParams,
): Promise<StoreToolResult> {
  const meta: StoreMeta = {
    type: params.type ?? 'other',
    ...(params.description ? { description: params.description } : {}),
    ...(params.tags        ? { tags: params.tags }               : {}),
  };

  const result: StoreResult = await client.store(agentId, params.data, meta);

  return {
    vaultId:   result.vaultId,
    pieceCid:  result.pieceCid,
    size:      result.size,
    pdpStatus: result.pdpStatus,
    verified:  result.pdpStatus === 'verified',
  };
}

/** MCP-compatible tool definition for vault.store */
export const storeToolDef = {
  name:        'vault_store',
  description: 'Store agent data verifiably on Filecoin with automatic x402 micropayment. Returns a PieceCID that anyone can use to verify the data exists on-chain.',
  inputSchema: {
    type: 'object',
    properties: {
      data:        { type: 'string', description: 'Data to store (text, JSON, etc.)' },
      type:        { type: 'string', enum: ['decision_log', 'conversation', 'dataset', 'state', 'other'], description: 'Vault type' },
      description: { type: 'string', description: 'Human-readable description' },
      tags:        { type: 'array', items: { type: 'string' }, description: 'Searchable tags' },
    },
    required: ['data'],
  },
} as const;
