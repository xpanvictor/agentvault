/**
 * SettlementTracker — in-memory tracker for x402 payment settlements.
 *
 * Settlements are fire-and-forget HTTP calls to the FIL-x402 facilitator.
 * This service records each attempt so:
 *   - Failed settlements are visible in /health stats
 *   - Audit entries can reference the outcome
 *   - Pending settlements don't silently vanish
 */

export type SettlementStatus = 'pending' | 'settled' | 'failed';

export interface SettlementRecord {
  paymentId: string;
  agentId: string;
  resource: string;
  status: SettlementStatus;
  /** Number of settlement attempts made (incremented by updateStatus). */
  attempts: number;
  lastAttemptAt: number;
  settledAt?: number;
  error?: string;
}

export interface SettlementStats {
  pending: number;
  settled: number;
  failed: number;
  total: number;
}

export class SettlementTracker {
  private readonly records = new Map<string, SettlementRecord>();

  /**
   * Register a new settlement attempt as pending.
   * Call this immediately after deciding to settle, before the async call.
   */
  track(paymentId: string, agentId: string, resource: string): void {
    this.records.set(paymentId, {
      paymentId,
      agentId,
      resource,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: Date.now(),
    });
  }

  /**
   * Update the outcome of a settlement.
   * Increments attempt count and records the final status.
   */
  updateStatus(paymentId: string, status: SettlementStatus, error?: string): void {
    const record = this.records.get(paymentId);
    if (!record) return;

    record.status = status;
    record.attempts += 1;
    record.lastAttemptAt = Date.now();

    if (status === 'settled') {
      record.settledAt = Date.now();
      delete record.error;
    } else if (status === 'failed' && error) {
      record.error = error;
    }
  }

  getStats(): SettlementStats {
    let pending = 0;
    let settled = 0;
    let failed = 0;

    for (const r of this.records.values()) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'settled') settled++;
      else if (r.status === 'failed') failed++;
    }

    return { pending, settled, failed, total: this.records.size };
  }

  /**
   * Return all records, optionally filtered by status.
   * Sorted by lastAttemptAt descending (most recent first).
   */
  getAll(filter?: { status?: SettlementStatus }): SettlementRecord[] {
    let records = Array.from(this.records.values());
    if (filter?.status) {
      records = records.filter((r) => r.status === filter.status);
    }
    return records.sort((a, b) => b.lastAttemptAt - a.lastAttemptAt);
  }

  /** Return a single record by paymentId, or undefined if not found. */
  getByPaymentId(paymentId: string): SettlementRecord | undefined {
    return this.records.get(paymentId);
  }
}
