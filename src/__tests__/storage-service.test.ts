import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage/index.js';
import type { Config } from '../types/config.js';

const mockConfig: Config = {
  server: { port: 3500, host: '0.0.0.0' },
  x402: { apiUrl: 'http://localhost:3402', timeout: 5000, mock: true },
  facilitator: { address: '0x0000000000000000000000000000000000000000' },
  storage: { provider: 'mock' },
  filecoin: {
    network: 'calibration',
    chainId: 314159,
    rpcUrl: 'wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1',
    usdfcAddress: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
  },
  identity: { enabled: false },
  logging: { level: 'error' },
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService(mockConfig);
  });

  // ---------------------------------------------------------------------------
  // store()
  // ---------------------------------------------------------------------------

  describe('store()', () => {
    it('stores data and returns a vault with a valid vaultId', async () => {
      const result = await service.store({
        agentId: 'agent_test',
        data: 'hello world',
      });

      expect(result.success).toBe(true);
      expect(result.vaultId).toMatch(/^vault_/);
      expect(result.pieceCid).toBeTruthy();
      expect(result.agentId).toBe('agent_test');
      expect(result.size).toBeGreaterThan(0);
    });

    it('indexes the vault so retrieve() can find it', async () => {
      const stored = await service.store({ agentId: 'agent_test', data: 'foo' });

      expect(stored.success).toBe(true);

      const retrieved = await service.retrieve(stored.vaultId);
      expect(retrieved.success).toBe(true);
      expect(retrieved.data).toBe('foo');
    });

    it('accepts optional metadata', async () => {
      const result = await service.store({
        agentId: 'agent_test',
        data: 'some data',
        metadata: { type: 'memory', description: 'test memory', tags: ['a', 'b'] },
      });

      expect(result.success).toBe(true);

      const vault = service.getVault(result.vaultId);
      expect(vault?.metadata?.type).toBe('memory');
      expect(vault?.metadata?.description).toBe('test memory');
    });

    it('stores the paymentId when provided', async () => {
      const result = await service.store({
        agentId: 'agent_test',
        data: 'paid data',
        paymentId: 'pay_abc',
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('pay_abc');
    });
  });

  // ---------------------------------------------------------------------------
  // retrieve()
  // ---------------------------------------------------------------------------

  describe('retrieve()', () => {
    it('returns not-found error for unknown vaultId', async () => {
      const result = await service.retrieve('vault_does_not_exist');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('retrieves by pieceCid as well as vaultId', async () => {
      const stored = await service.store({ agentId: 'agent_a', data: 'by cid test' });

      const byVaultId = await service.retrieve(stored.vaultId);
      const byCid = await service.retrieve(stored.pieceCid);

      expect(byVaultId.success).toBe(true);
      expect(byCid.success).toBe(true);
      expect(byVaultId.data).toBe(byCid.data);
    });

    it('includes metadata in retrieved response', async () => {
      const stored = await service.store({
        agentId: 'agent_a',
        data: 'meta test',
        metadata: { type: 'document', description: 'my doc' },
      });

      const result = await service.retrieve(stored.vaultId);
      expect(result.success).toBe(true);
      expect(result.metadata?.type).toBe('document');
      expect(result.metadata?.storedBy).toBe('agent_a');
    });
  });

  // ---------------------------------------------------------------------------
  // verify()
  // ---------------------------------------------------------------------------

  describe('verify()', () => {
    it('returns exists=false for unknown pieceCid', async () => {
      const result = await service.verify('bafk_unknown');
      expect(result.exists).toBe(false);
      expect(result.pdpVerified).toBe(false);
    });

    it('returns exists=true and pdpVerified for a stored piece', async () => {
      const stored = await service.store({ agentId: 'agent_v', data: 'verify me' });

      const result = await service.verify(stored.pieceCid);
      expect(result.exists).toBe(true);
      expect(result.pdpVerified).toBe(true);
      expect(result.storedBy).toBe('agent_v');
    });
  });

  // ---------------------------------------------------------------------------
  // getVaultsForAgent()
  // ---------------------------------------------------------------------------

  describe('getVaultsForAgent()', () => {
    it('returns empty array for an agent with no vaults', () => {
      expect(service.getVaultsForAgent('nobody')).toEqual([]);
    });

    it('returns all vaults stored by a given agent', async () => {
      await service.store({ agentId: 'agent_x', data: 'first' });
      await service.store({ agentId: 'agent_x', data: 'second' });
      await service.store({ agentId: 'agent_y', data: 'other' });

      const xVaults = service.getVaultsForAgent('agent_x');
      expect(xVaults).toHaveLength(2);
      expect(xVaults.every((v) => v.agentId === 'agent_x')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    it('reports correct provider', () => {
      const stats = service.getStats();
      expect(stats.provider).toBe('mock');
    });

    it('increments vault and agent counts on store', async () => {
      await service.store({ agentId: 'a1', data: 'one' });
      await service.store({ agentId: 'a1', data: 'two' });
      await service.store({ agentId: 'a2', data: 'three' });

      const stats = service.getStats();
      expect(stats.vaults).toBe(3);
      expect(stats.agents).toBe(2);
    });
  });
});
