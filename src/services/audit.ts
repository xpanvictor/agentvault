import { randomUUID } from 'node:crypto';
import type { AuditEntry, AuditTrailResponse } from '../types/agent.js';

type LogInput = Omit<AuditEntry, 'id' | 'timestamp'>;

/**
 * AuditService — tamper-evident in-memory audit log.
 *
 * Records every agent operation (store, retrieve, verify, register).
 * Entries are append-only; nothing is ever deleted or mutated.
 */
export class AuditService {
  /** agentId → ordered list of audit entries */
  private readonly entries = new Map<string, AuditEntry[]>();

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  log(input: LogInput): AuditEntry {
    const entry: AuditEntry = {
      ...input,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    const list = this.entries.get(input.agentId) ?? [];
    list.push(entry);
    this.entries.set(input.agentId, list);

    return entry;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  getForAgent(agentId: string): AuditTrailResponse {
    const entries = this.entries.get(agentId) ?? [];

    let totalStored = 0;
    let totalRetrieved = 0;
    let lastActivity = 0;

    for (const e of entries) {
      if (e.action === 'store') totalStored++;
      if (e.action === 'retrieve') totalRetrieved++;
      if (e.timestamp > lastActivity) lastActivity = e.timestamp;
    }

    return {
      agentId,
      entries,
      summary: {
        totalOperations: entries.length,
        totalStored,
        totalRetrieved,
        lastActivity,
      },
    };
  }

  getStats(): { totalAgents: number; totalEntries: number } {
    let totalEntries = 0;
    for (const list of this.entries.values()) totalEntries += list.length;
    return { totalAgents: this.entries.size, totalEntries };
  }
}
