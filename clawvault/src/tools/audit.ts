import type { AgentVaultClient, AuditEntry } from '../client.js';

export interface AuditParams {
  /** AgentId to audit. Defaults to the calling agent's own agentId. */
  agentId?: string;
  /** Return only the most recent N entries. Defaults to all. */
  limit?: number;
}

export interface AuditToolResult {
  agentId: string;
  entries: AuditEntry[];
  summary: {
    totalOperations: number;
    totalStored: number;
    totalRetrieved: number;
    totalVerified: number;
  };
}

/**
 * vault.audit() — return the tamper-evident operation history for an agent.
 *
 * Every store, retrieve, verify, and register operation is logged with a
 * timestamp, action type, and outcome.  Because the underlying data is
 * stored on Filecoin with PDP proofs, the audit trail is independently
 * verifiable — not just a database row.
 */
export async function audit(
  client: AgentVaultClient,
  selfAgentId: string,
  params: AuditParams = {},
): Promise<AuditToolResult> {
  const targetId = params.agentId ?? selfAgentId;
  const result = await client.getAudit(targetId);

  let entries = result.entries;
  if (params.limit && params.limit > 0) {
    entries = entries.slice(-params.limit);
  }

  const summary = result.summary as Record<string, unknown>;

  return {
    agentId: result.agentId,
    entries,
    summary: {
      totalOperations: (summary.totalOperations as number) ?? entries.length,
      totalStored:     (summary.totalStored     as number) ?? 0,
      totalRetrieved:  (summary.totalRetrieved  as number) ?? 0,
      totalVerified:   (summary.totalVerified   as number) ?? 0,
    },
  };
}

/** MCP-compatible tool definition for vault.audit */
export const auditToolDef = {
  name:        'vault_audit',
  description: 'Return the tamper-evident audit trail for an agent. Every store, retrieve, verify, and register operation is logged. Pass another agent\'s agentId to audit their history.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type:        'string',
        description: 'AgentId to audit. Omit for self.',
      },
      limit: {
        type:        'number',
        description: 'Return only the N most recent entries.',
      },
    },
    required: [],
  },
} as const;
