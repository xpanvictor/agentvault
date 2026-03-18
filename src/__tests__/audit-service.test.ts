import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from '../services/audit.js';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
  });

  // ---------------------------------------------------------------------------
  // log()
  // ---------------------------------------------------------------------------

  describe('log()', () => {
    it('assigns a unique id and timestamp to each entry', () => {
      const e1 = service.log({ agentId: 'a1', action: 'store', details: { success: true } });
      const e2 = service.log({ agentId: 'a1', action: 'retrieve', details: { success: true } });

      expect(e1.id).toBeTruthy();
      expect(e2.id).toBeTruthy();
      expect(e1.id).not.toBe(e2.id);
      expect(e1.timestamp).toBeGreaterThan(0);
    });

    it('stores details on the entry', () => {
      const entry = service.log({
        agentId: 'a1',
        action: 'store',
        details: { vaultId: 'vault_01', pieceCid: 'bafk01', size: 42, success: true },
      });

      expect(entry.details.vaultId).toBe('vault_01');
      expect(entry.details.size).toBe(42);
    });

    it('separates entries by agentId', () => {
      service.log({ agentId: 'a1', action: 'store', details: { success: true } });
      service.log({ agentId: 'a2', action: 'register', details: { success: true } });

      const trail1 = service.getForAgent('a1');
      const trail2 = service.getForAgent('a2');

      expect(trail1.entries).toHaveLength(1);
      expect(trail2.entries).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getForAgent()
  // ---------------------------------------------------------------------------

  describe('getForAgent()', () => {
    it('returns empty trail for an agent with no entries', () => {
      const trail = service.getForAgent('nobody');
      expect(trail.agentId).toBe('nobody');
      expect(trail.entries).toEqual([]);
      expect(trail.summary.totalOperations).toBe(0);
      expect(trail.summary.lastActivity).toBe(0);
    });

    it('correctly summarises store and retrieve counts', () => {
      const agentId = 'agent_summary';

      service.log({ agentId, action: 'store', details: { success: true } });
      service.log({ agentId, action: 'store', details: { success: true } });
      service.log({ agentId, action: 'retrieve', details: { success: true } });
      service.log({ agentId, action: 'verify', details: { success: true } });
      service.log({ agentId, action: 'register', details: { success: true } });

      const trail = service.getForAgent(agentId);

      expect(trail.summary.totalOperations).toBe(5);
      expect(trail.summary.totalStored).toBe(2);
      expect(trail.summary.totalRetrieved).toBe(1);
    });

    it('sets lastActivity to the most recent entry timestamp', async () => {
      const agentId = 'agent_time';

      service.log({ agentId, action: 'store', details: { success: true } });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));
      service.log({ agentId, action: 'retrieve', details: { success: true } });

      const trail = service.getForAgent(agentId);
      const timestamps = trail.entries.map((e) => e.timestamp);

      expect(trail.summary.lastActivity).toBe(Math.max(...timestamps));
    });

    it('preserves entry order (append-only)', () => {
      const agentId = 'agent_order';
      const actions = ['register', 'store', 'retrieve', 'verify'] as const;

      for (const action of actions) {
        service.log({ agentId, action, details: { success: true } });
      }

      const trail = service.getForAgent(agentId);
      expect(trail.entries.map((e) => e.action)).toEqual(actions);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns zeros when empty', () => {
      const stats = service.getStats();
      expect(stats.totalAgents).toBe(0);
      expect(stats.totalEntries).toBe(0);
    });

    it('counts agents and total entries across all agents', () => {
      service.log({ agentId: 'a1', action: 'store', details: { success: true } });
      service.log({ agentId: 'a1', action: 'retrieve', details: { success: true } });
      service.log({ agentId: 'a2', action: 'register', details: { success: true } });

      const stats = service.getStats();
      expect(stats.totalAgents).toBe(2);
      expect(stats.totalEntries).toBe(3);
    });
  });
});
