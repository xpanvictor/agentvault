import { randomUUID } from 'node:crypto';
import type { AuditEntry, AuditTrailResponse } from '../types/agent.js';
import { loadJson, saveJson } from '../utils/persist.js';

type LogInput = Omit<AuditEntry, 'id' | 'timestamp'>;

/**
 * AuditService — tamper-evident audit log, persisted to data/audit.json.
 *
 * Records every agent operation (store, retrieve, verify, register).
 * Entries are append-only; nothing is ever deleted or mutated.
 */
export class AuditService {
  /** agentId → ordered list of audit entries */
  private readonly entries = new Map<string, AuditEntry[]>();

  constructor() {
    const saved = loadJson<Record<string, AuditEntry[]>>('audit.json', {});
    for (const [agentId, list] of Object.entries(saved)) {
      this.entries.set(agentId, list);
    }
  }

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
    this._save();

    return entry;
  }

  private _save(): void {
    const data: Record<string, AuditEntry[]> = {};
    for (const [k, v] of this.entries) data[k] = v;
    saveJson('audit.json', data);
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
