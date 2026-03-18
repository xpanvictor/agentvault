import type { AgentVaultClient } from '../client.js';

export interface IdentityParams {
  /**
   * AgentId to look up. Omit to return the calling agent's own identity.
   * Useful for cross-agent verification: Agent B can look up Agent A.
   */
  agentId?: string;
}

export interface IdentityToolResult {
  agentId: string;
  address: string;
  name: string;
  version: string;
  cardCid: string;
  registeredAt: number;
  x402Support: boolean;
  storageVaultCount: number;
  reputation: {
    totalStored: number;
    totalRetrieved: number;
    verificationScore: number;
  };
  /** True when this agent is successfully resolved in the AgentVault registry. */
  verified: boolean;
}

/**
 * vault.identity() — get or verify an ERC-8004 agent identity.
 *
 * When called without params, returns the calling agent's own identity.
 * When called with an agentId, looks up another agent — enabling trustless
 * cross-agent identity verification.
 */
export async function identity(
  client: AgentVaultClient,
  selfAgentId: string,
  params: IdentityParams = {},
): Promise<IdentityToolResult> {
  const targetId = params.agentId ?? selfAgentId;
  const agent = await client.getAgent(targetId);

  if (!agent) {
    return {
      agentId:           targetId,
      address:           '',
      name:              '',
      version:           '',
      cardCid:           '',
      registeredAt:      0,
      x402Support:       false,
      storageVaultCount: 0,
      reputation:        { totalStored: 0, totalRetrieved: 0, verificationScore: 0 },
      verified:          false,
    };
  }

  const card = agent.agentCard as Record<string, unknown>;

  return {
    agentId:           agent.agentId,
    address:           agent.address,
    name:              (card.name as string)    ?? '',
    version:           (card.version as string) ?? '',
    cardCid:           agent.cardCid,
    registeredAt:      agent.registeredAt,
    x402Support:       (card.x402Support as boolean) ?? false,
    storageVaultCount: agent.storageManifest.length,
    reputation:        agent.reputation,
    verified:          true,
  };
}

/** MCP-compatible tool definition for vault.identity */
export const identityToolDef = {
  name:        'vault_identity',
  description: 'Get or verify an ERC-8004 agent identity from the AgentVault registry. Omit agentId to return the calling agent\'s own identity. Pass another agent\'s agentId for cross-agent verification.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type:        'string',
        description: 'AgentId to look up. Omit for self-identity.',
      },
    },
    required: [],
  },
} as const;
