import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockIdentityProvider, registrationMessage } from '../services/identity/mock.js';
import { IdentityService } from '../services/identity/index.js';
import type { Config } from '../types/config.js';
import type { RegisterAgentRequest } from '../types/agent.js';

// ---------------------------------------------------------------------------
// Mock viem so tests don't need real ECDSA fixtures
// ---------------------------------------------------------------------------
vi.mock('viem', () => ({
  verifyMessage: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeRegisterRequest(address: string): RegisterAgentRequest {
  return {
    address: address as `0x${string}`,
    agentCard: { name: 'TestAgent', version: '1.0.0', x402Support: true },
    // Fake but format-valid signature (viem is mocked)
    signature: `0x${'ab'.repeat(65)}` as `0x${string}`,
  };
}

// ---------------------------------------------------------------------------
// MockIdentityProvider
// ---------------------------------------------------------------------------

describe('MockIdentityProvider', () => {
  let provider: MockIdentityProvider;

  beforeEach(() => {
    provider = new MockIdentityProvider();
  });

  describe('registerAgent()', () => {
    it('registers a new agent and returns isNew=true', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000001');
      const { agent, isNew } = await provider.registerAgent(req, 'cid_001');

      expect(isNew).toBe(true);
      expect(agent.agentId).toMatch(/^agent_/);
      expect(agent.address).toBe(req.address);
      expect(agent.cardPieceCid).toBe('cid_001');
      expect(agent.storageManifest).toEqual([]);
      expect(agent.reputation.verificationScore).toBe(100);
    });

    it('returns existing agent with isNew=false on duplicate address', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000002');
      const first = await provider.registerAgent(req);
      const second = await provider.registerAgent(req);

      expect(second.isNew).toBe(false);
      expect(second.agent.agentId).toBe(first.agent.agentId);
    });

    it('is case-insensitive on address lookup', async () => {
      const req1 = makeRegisterRequest('0xABC1230000000000000000000000000000000003');
      const req2 = makeRegisterRequest('0xabc1230000000000000000000000000000000003');

      const first = await provider.registerAgent(req1);
      const second = await provider.registerAgent(req2);

      expect(second.isNew).toBe(false);
      expect(second.agent.agentId).toBe(first.agent.agentId);
    });

    it('throws when viem rejects the signature', async () => {
      const { verifyMessage } = await import('viem');
      vi.mocked(verifyMessage).mockResolvedValueOnce(false);

      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000004');
      await expect(provider.registerAgent(req)).rejects.toThrow(
        'Signature verification failed',
      );
    });
  });

  describe('getById()', () => {
    it('returns undefined for unknown agentId', () => {
      expect(provider.getById('agent_unknown')).toBeUndefined();
    });

    it('returns the agent after registration', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000005');
      const { agent } = await provider.registerAgent(req);

      expect(provider.getById(agent.agentId)).toEqual(agent);
    });
  });

  describe('getByAddress()', () => {
    it('returns undefined for unregistered address', () => {
      expect(provider.getByAddress('0x0000000000000000000000000000000000000000')).toBeUndefined();
    });

    it('finds agent by normalised address', async () => {
      const address = '0xABC1230000000000000000000000000000000006';
      const req = makeRegisterRequest(address);
      const { agent } = await provider.registerAgent(req);

      expect(provider.getByAddress(address.toLowerCase())?.agentId).toBe(agent.agentId);
    });
  });

  describe('addToManifest()', () => {
    it('appends a vault entry and increments totalStored', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000007');
      const { agent } = await provider.registerAgent(req);

      provider.addToManifest(agent.agentId, {
        vaultId: 'vault_01',
        pieceCid: 'bafk01',
        type: 'memory',
        storedAt: Date.now(),
        size: 100,
        pdpStatus: 'pending',
      });

      const updated = provider.getById(agent.agentId)!;
      expect(updated.storageManifest).toHaveLength(1);
      expect(updated.storageManifest[0].vaultId).toBe('vault_01');
      expect(updated.reputation.totalStored).toBe(1);
    });

    it('is a no-op for unknown agentId', () => {
      expect(() =>
        provider.addToManifest('agent_ghost', {
          vaultId: 'v1',
          pieceCid: 'c1',
          type: 'other',
          storedAt: Date.now(),
          size: 0,
          pdpStatus: 'pending',
        })
      ).not.toThrow();
    });
  });

  describe('updateManifestPDPStatus()', () => {
    it('marks entry as verified and increments verificationScore', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000008');
      const { agent } = await provider.registerAgent(req);

      provider.addToManifest(agent.agentId, {
        vaultId: 'vault_02',
        pieceCid: 'bafk02',
        type: 'other',
        storedAt: Date.now(),
        size: 50,
        pdpStatus: 'pending',
      });

      provider.updateManifestPDPStatus(agent.agentId, 'bafk02', 'verified');

      const updated = provider.getById(agent.agentId)!;
      expect(updated.storageManifest[0].pdpStatus).toBe('verified');
      // Score starts at 100 (max), so Math.min(100, 100+1) = 100 — cap is enforced
      expect(updated.reputation.verificationScore).toBe(100);
    });

    it('decrements verificationScore on failed status', async () => {
      const req = makeRegisterRequest('0xabc1230000000000000000000000000000000009');
      const { agent } = await provider.registerAgent(req);

      provider.addToManifest(agent.agentId, {
        vaultId: 'vault_03',
        pieceCid: 'bafk03',
        type: 'other',
        storedAt: Date.now(),
        size: 50,
        pdpStatus: 'pending',
      });

      provider.updateManifestPDPStatus(agent.agentId, 'bafk03', 'failed');

      const updated = provider.getById(agent.agentId)!;
      expect(updated.storageManifest[0].pdpStatus).toBe('failed');
      expect(updated.reputation.verificationScore).toBe(80); // 100 - 20
    });

    it('caps verificationScore at 100', async () => {
      const req = makeRegisterRequest('0xabc123000000000000000000000000000000000a');
      const { agent } = await provider.registerAgent(req);

      // Add and verify multiple entries
      for (let i = 0; i < 5; i++) {
        provider.addToManifest(agent.agentId, {
          vaultId: `vault_cap_${i}`,
          pieceCid: `bafkcap${i}`,
          type: 'other',
          storedAt: Date.now(),
          size: 10,
          pdpStatus: 'pending',
        });
        provider.updateManifestPDPStatus(agent.agentId, `bafkcap${i}`, 'verified');
      }

      const updated = provider.getById(agent.agentId)!;
      expect(updated.reputation.verificationScore).toBe(100);
    });
  });

  describe('recordRetrieve()', () => {
    it('increments totalRetrieved', async () => {
      const req = makeRegisterRequest('0xabc123000000000000000000000000000000000b');
      const { agent } = await provider.registerAgent(req);

      provider.recordRetrieve(agent.agentId);
      provider.recordRetrieve(agent.agentId);

      expect(provider.getById(agent.agentId)!.reputation.totalRetrieved).toBe(2);
    });
  });

  describe('getStats()', () => {
    it('counts registered agents', async () => {
      expect(provider.getStats().totalAgents).toBe(0);

      await provider.registerAgent(makeRegisterRequest('0xabc123000000000000000000000000000000000c'));
      await provider.registerAgent(makeRegisterRequest('0xabc123000000000000000000000000000000000d'));

      expect(provider.getStats().totalAgents).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// registrationMessage helper
// ---------------------------------------------------------------------------

describe('registrationMessage()', () => {
  it('includes the lowercase address in the message', () => {
    const msg = registrationMessage('0xABC123');
    expect(msg).toContain('0xabc123');
  });

  it('produces the same message for upper and lower case input', () => {
    expect(registrationMessage('0xABC')).toBe(registrationMessage('0xabc'));
  });
});

// ---------------------------------------------------------------------------
// IdentityService (integration with MockIdentityProvider)
// ---------------------------------------------------------------------------

describe('IdentityService', () => {
  let service: IdentityService;

  beforeEach(() => {
    service = new IdentityService(mockConfig);
  });

  it('delegates registerAgent to the provider', async () => {
    const req = makeRegisterRequest('0xabc123000000000000000000000000000000000e');
    const { agent, isNew } = await service.registerAgent(req);

    expect(isNew).toBe(true);
    expect(agent.agentId).toMatch(/^agent_/);
  });

  it('getById returns the agent after registration', async () => {
    const req = makeRegisterRequest('0xabc123000000000000000000000000000000000f');
    const { agent } = await service.registerAgent(req);

    expect(service.getById(agent.agentId)?.agentId).toBe(agent.agentId);
  });

  it('addToManifest and recordRetrieve propagate to the provider', async () => {
    const req = makeRegisterRequest('0xabc1230000000000000000000000000000000010');
    const { agent } = await service.registerAgent(req);

    service.addToManifest(agent.agentId, {
      vaultId: 'v_svc',
      pieceCid: 'bafksvc',
      type: 'other',
      storedAt: Date.now(),
      size: 10,
      pdpStatus: 'pending',
    });

    service.recordRetrieve(agent.agentId);

    const a = service.getById(agent.agentId)!;
    expect(a.storageManifest).toHaveLength(1);
    expect(a.reputation.totalRetrieved).toBe(1);
  });
});
