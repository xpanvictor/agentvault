import type { AgentVaultClient } from '../client.js';

export interface RecallParams {
  /** VaultId (vault_xxx) or PieceCID (bafk…) returned from vault.store() */
  id: string;
}

export interface RecallToolResult {
  data: string;
  vaultId: string;
  pieceCid: string;
  pdpStatus: string;
  /** True when Filecoin has issued a PDP proof for this piece. */
  pdpVerified: boolean;
  pdpVerifiedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * vault.recall() — retrieve data from Filecoin with PDP proof.
 *
 * Handles the x402 payment flow automatically (same as vault.store).
 * Returns the raw data plus proof-of-storage metadata so callers can
 * verify the data is cryptographically attested on Filecoin.
 */
export async function recall(
  client: AgentVaultClient,
  params: RecallParams,
): Promise<RecallToolResult> {
  const result = await client.retrieve(params.id);

  return {
    data:          result.data,
    vaultId:       result.vaultId,
    pieceCid:      result.pieceCid,
    pdpStatus:     result.pdpStatus,
    pdpVerified:   result.pdpStatus === 'verified',
    pdpVerifiedAt: result.pdpVerifiedAt,
    metadata:      result.metadata,
  };
}

/** MCP-compatible tool definition for vault.recall */
export const recallToolDef = {
  name:        'vault_recall',
  description: 'Retrieve data from Filecoin by vaultId or PieceCID. Returns the data along with a PDP proof verifying it is stored on-chain. Requires an automatic x402 micropayment.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type:        'string',
        description: 'VaultId (vault_xxx) or PieceCID (bafk…) from vault.store()',
      },
    },
    required: ['id'],
  },
} as const;
