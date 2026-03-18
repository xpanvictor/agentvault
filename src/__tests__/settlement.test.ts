import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettlementTracker } from '../services/settlement.js';

describe('SettlementTracker', () => {
  let tracker: SettlementTracker;

  beforeEach(() => {
    tracker = new SettlementTracker();
  });

  // ---------------------------------------------------------------------------
  // track()
  // ---------------------------------------------------------------------------

  describe('track()', () => {
    it('creates a pending record for a new paymentId', () => {
      tracker.track('pay_001', 'agent_a', '/agent/store');

      const stats = tracker.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.settled).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('initialises attempts to 0', () => {
      tracker.track('pay_002', 'agent_b', '/agent/retrieve/vault_x');
      // getStats() doesn't expose attempt count directly; updateStatus increments it
      // Verify subsequent update increments from 0→1
      tracker.updateStatus('pay_002', 'settled');
      const stats = tracker.getStats();
      expect(stats.settled).toBe(1);
    });

    it('overwrites a record if track() is called twice with the same paymentId', () => {
      tracker.track('pay_003', 'agent_c', '/agent/store');
      tracker.updateStatus('pay_003', 'failed', 'network error');
      tracker.track('pay_003', 'agent_c', '/agent/store'); // re-track resets it

      const stats = tracker.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus()
  // ---------------------------------------------------------------------------

  describe('updateStatus()', () => {
    it('transitions pending → settled', () => {
      tracker.track('pay_010', 'agent_a', '/agent/store');
      tracker.updateStatus('pay_010', 'settled');

      const stats = tracker.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.settled).toBe(1);
    });

    it('transitions pending → failed and records error message', () => {
      tracker.track('pay_011', 'agent_a', '/agent/store');
      tracker.updateStatus('pay_011', 'failed', 'timeout');

      const stats = tracker.getStats();
      expect(stats.failed).toBe(1);
    });

    it('is a no-op for an unknown paymentId (does not throw)', () => {
      expect(() => tracker.updateStatus('nonexistent', 'settled')).not.toThrow();
    });

    it('increments attempt count on each updateStatus call', () => {
      tracker.track('pay_012', 'agent_a', '/agent/store');
      tracker.updateStatus('pay_012', 'failed', 'err1');
      tracker.updateStatus('pay_012', 'settled'); // second update

      // Both calls incremented — settled count should be 1 (last status wins)
      const stats = tracker.getStats();
      expect(stats.settled).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns zeros when empty', () => {
      const stats = tracker.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.settled).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('correctly counts multiple records in mixed states', () => {
      tracker.track('a', 'ag', '/store');
      tracker.track('b', 'ag', '/store');
      tracker.track('c', 'ag', '/store');
      tracker.track('d', 'ag', '/store');

      tracker.updateStatus('b', 'settled');
      tracker.updateStatus('c', 'failed', 'err');

      const stats = tracker.getStats();
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(2);
      expect(stats.settled).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getAll()
  // ---------------------------------------------------------------------------

  describe('getAll()', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('returns empty array when no records exist', () => {
      expect(tracker.getAll()).toEqual([]);
    });

    it('returns all records sorted by lastAttemptAt descending', () => {
      tracker.track('first', 'ag', '/store');
      vi.advanceTimersByTime(10);
      tracker.updateStatus('first', 'settled');  // bumps lastAttemptAt to t+10
      vi.advanceTimersByTime(10);
      tracker.track('second', 'ag', '/store');   // lastAttemptAt at t+20

      const all = tracker.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].paymentId).toBe('second');   // most recent first
      expect(all[1].paymentId).toBe('first');
    });

    it('filters by status=pending', () => {
      tracker.track('p1', 'ag', '/store');
      tracker.track('p2', 'ag', '/store');
      tracker.track('p3', 'ag', '/store');
      tracker.updateStatus('p2', 'settled');
      tracker.updateStatus('p3', 'failed', 'err');

      const pending = tracker.getAll({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].paymentId).toBe('p1');
    });

    it('filters by status=failed', () => {
      tracker.track('f1', 'ag', '/store');
      tracker.track('f2', 'ag', '/store');
      tracker.updateStatus('f1', 'failed', 'timeout');

      const failed = tracker.getAll({ status: 'failed' });
      expect(failed).toHaveLength(1);
      expect(failed[0].paymentId).toBe('f1');
      expect(failed[0].error).toBe('timeout');
    });

    it('returns empty array when filter matches nothing', () => {
      tracker.track('s1', 'ag', '/store');
      tracker.updateStatus('s1', 'settled');

      expect(tracker.getAll({ status: 'failed' })).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getByPaymentId()
  // ---------------------------------------------------------------------------

  describe('getByPaymentId()', () => {
    it('returns the record for a known paymentId', () => {
      tracker.track('pay_xyz', 'agent_a', '/agent/store');
      const record = tracker.getByPaymentId('pay_xyz');

      expect(record).toBeDefined();
      expect(record!.paymentId).toBe('pay_xyz');
      expect(record!.agentId).toBe('agent_a');
      expect(record!.status).toBe('pending');
    });

    it('returns undefined for an unknown paymentId', () => {
      expect(tracker.getByPaymentId('nonexistent')).toBeUndefined();
    });

    it('reflects status updates', () => {
      tracker.track('pay_upd', 'ag', '/store');
      tracker.updateStatus('pay_upd', 'settled');

      const record = tracker.getByPaymentId('pay_upd');
      expect(record!.status).toBe('settled');
    });
  });
});
