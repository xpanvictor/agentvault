import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClawVault }          from '../src/index.js';
import { AgentVaultClient }   from '../src/client.js';

// ---------------------------------------------------------------------------
// Mock viem — signature ops are exercised in E2E; here we just verify the
// registration message is built and sent correctly.
// ---------------------------------------------------------------------------
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address:       '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    signMessage:   vi.fn().mockResolvedValue('0xmocksig'),
    signTypedData: vi.fn().mockResolvedValue('0xmocktypedsigg'),
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_PK  = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const AGENT_ID = 'agent_abc123';

const storeResponse = {
  success:   true,
  vaultId:   'vault_001',
  pieceCid:  'bafk001',
  agentId:   AGENT_ID,
  storedAt:  1_000_000,
  size:      42,
  pdpStatus: 'verified',
};

const retrieveResponse = {
  success:       true,
  data:          'hello clawvault',
  pieceCid:      'bafk001',
  vaultId:       'vault_001',
  pdpStatus:     'verified',
  pdpVerifiedAt: 1_000_001,
};

const registerResponse = {
  success:         true,
  isNew:           true,
  agentId:         AGENT_ID,
  address:         '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  agentCard:       { name: 'TestAgent', version: '1.0.0', x402Support: true },
  cardCid:         'mock-card-cid',
  registeredAt:    1_000_000,
  storageManifest: [],
  reputation:      { totalStored: 0, totalRetrieved: 0, verificationScore: 100 },
};

const agentResponse = {
  found: true,
  agent: {
    agentId:         AGENT_ID,
    address:         '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    agentCard:       { name: 'TestAgent', version: '1.0.0', x402Support: true },
    cardCid:         'mock-card-cid',
    registeredAt:    1_000_000,
    storageManifest: [{ vaultId: 'vault_001' }],
    reputation:      { totalStored: 1, totalRetrieved: 0, verificationScore: 100 },
  },
};

const auditResponse = {
  agentId: AGENT_ID,
  entries: [
    { action: 'register', timestamp: 1_000_000, details: { success: true } },
    { action: 'store',    timestamp: 1_000_001, details: { success: true, vaultId: 'vault_001' } },
  ],
  summary: { totalOperations: 2, totalStored: 1, totalRetrieved: 0, totalVerified: 0 },
};

const paymentRequirements = {
  payTo:              '0xfacilitator',
  maxAmountRequired:  '10000',
  tokenAddress:       '0xtoken',
  chainId:            314159,
  resource:           '/agent/store',
};

/** Build a minimal Response-like object */
function mockRes(body: unknown, status = 200) {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// AgentVaultClient tests
// ---------------------------------------------------------------------------

describe('AgentVaultClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  describe('store()', () => {
    it('handles the 402 → sign → 201 flow', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockRes(paymentRequirements, 402))
        .mockResolvedValueOnce(mockRes(storeResponse, 201));

      const client = new AgentVaultClient('http://localhost:3500');
      const result = await client.store(AGENT_ID, 'hello', { type: 'other' });

      expect(result.vaultId).toBe('vault_001');
      expect(result.pieceCid).toBe('bafk001');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Second call must carry x-payment header
      const [, secondCallArgs] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect((secondCallArgs.headers as Record<string,string>)['x-payment']).toBeDefined();
    });

    it('throws when store returns a non-402 error', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ error: 'rate_limit_exceeded' }, 429));
      const client = new AgentVaultClient('http://localhost:3500');
      await expect(client.store(AGENT_ID, 'data')).rejects.toThrow();
    });
  });

  describe('retrieve()', () => {
    it('handles the 402 → sign → 200 flow', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockRes(paymentRequirements, 402))
        .mockResolvedValueOnce(mockRes(retrieveResponse, 200));

      const client = new AgentVaultClient('http://localhost:3500');
      const result = await client.retrieve('vault_001');

      expect(result.data).toBe('hello clawvault');
      expect(result.pdpStatus).toBe('verified');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws when vault not found (404)', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ error: 'not_found' }, 404));
      const client = new AgentVaultClient('http://localhost:3500');
      await expect(client.retrieve('vault_unknown')).rejects.toThrow();
    });
  });

  describe('register()', () => {
    it('posts registration and returns agent info', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(registerResponse, 201));
      const client = new AgentVaultClient('http://localhost:3500');
      const result = await client.register(
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        { name: 'TestAgent', version: '1.0.0', x402Support: true },
        '0xsig',
      );
      expect(result.agentId).toBe(AGENT_ID);
      expect(result.isNew).toBe(true);
    });

    it('throws when server returns an error', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ error: 'registration_failed', reason: 'bad sig' }, 400));
      const client = new AgentVaultClient('http://localhost:3500');
      await expect(
        client.register('0xbad', {}, '0xbadsig'),
      ).rejects.toThrow('bad sig');
    });
  });

  describe('getAgent()', () => {
    it('returns agent data for known agentId', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(agentResponse, 200));
      const client = new AgentVaultClient('http://localhost:3500');
      const agent  = await client.getAgent(AGENT_ID);
      expect(agent?.agentId).toBe(AGENT_ID);
    });

    it('returns null for unknown agentId', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ found: false }, 404));
      const client = new AgentVaultClient('http://localhost:3500');
      const agent  = await client.getAgent('agent_unknown');
      expect(agent).toBeNull();
    });
  });

  describe('getAudit()', () => {
    it('returns audit entries and summary', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(auditResponse, 200));
      const client = new AgentVaultClient('http://localhost:3500');
      const result = await client.getAudit(AGENT_ID);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].action).toBe('register');
    });
  });
});

// ---------------------------------------------------------------------------
// ClawVault plugin tests
// ---------------------------------------------------------------------------

describe('ClawVault', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  function makeVault(agentId?: string) {
    return new ClawVault({
      url:       'http://localhost:3500',
      privateKey: MOCK_PK,
      agentId,
      agentCard: { name: 'TestAgent', version: '1.0.0', x402Support: true },
    });
  }

  // ─── Auto-registration ─────────────────────────────────────────────────────

  describe('getAgentId()', () => {
    it('returns the pre-configured agentId without registering', async () => {
      const vault = makeVault(AGENT_ID);
      const id    = await vault.getAgentId();
      expect(id).toBe(AGENT_ID);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('auto-registers and caches agentId on first call', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(registerResponse, 201));
      const vault = makeVault();
      const id    = await vault.getAgentId();
      expect(id).toBe(AGENT_ID);
    });

    it('only registers once even when called concurrently', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(registerResponse, 201));
      const vault = makeVault();
      const [id1, id2] = await Promise.all([vault.getAgentId(), vault.getAgentId()]);
      expect(id1).toBe(id2);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── vault.store() ─────────────────────────────────────────────────────────

  describe('store()', () => {
    it('returns vaultId + pieceCid + verified flag', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockRes(paymentRequirements, 402))
        .mockResolvedValueOnce(mockRes(storeResponse, 201));

      const vault  = makeVault(AGENT_ID);
      const result = await vault.store({ data: 'my decision', type: 'decision_log' });

      expect(result.vaultId).toBe('vault_001');
      expect(result.pieceCid).toBe('bafk001');
      expect(result.verified).toBe(true);
    });
  });

  // ─── vault.recall() ────────────────────────────────────────────────────────

  describe('recall()', () => {
    it('returns data + pdpVerified flag', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockRes(paymentRequirements, 402))
        .mockResolvedValueOnce(mockRes(retrieveResponse, 200));

      const vault  = makeVault(AGENT_ID);
      const result = await vault.recall({ id: 'vault_001' });

      expect(result.data).toBe('hello clawvault');
      expect(result.pdpVerified).toBe(true);
    });
  });

  // ─── vault.identity() ──────────────────────────────────────────────────────

  describe('identity()', () => {
    it('returns own identity when no params given', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(agentResponse, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.identity();

      expect(result.agentId).toBe(AGENT_ID);
      expect(result.name).toBe('TestAgent');
      expect(result.verified).toBe(true);
      expect(result.x402Support).toBe(true);
      expect(result.storageVaultCount).toBe(1);
    });

    it('returns another agent\'s identity when agentId given', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({
        found: true,
        agent: { ...agentResponse.agent, agentId: 'agent_other' },
      }, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.identity({ agentId: 'agent_other' });
      expect(result.agentId).toBe('agent_other');
      expect(result.verified).toBe(true);
    });

    it('returns verified=false for an unknown agentId', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ found: false }, 404));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.identity({ agentId: 'agent_ghost' });
      expect(result.verified).toBe(false);
    });
  });

  // ─── vault.audit() ─────────────────────────────────────────────────────────

  describe('audit()', () => {
    it('returns entries and summary', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(auditResponse, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.audit();

      expect(result.entries).toHaveLength(2);
      expect(result.summary.totalStored).toBe(1);
    });

    it('respects the limit param', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(auditResponse, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.audit({ limit: 1 });
      expect(result.entries).toHaveLength(1);
    });

    it('audits another agent when agentId is given', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes({ ...auditResponse, agentId: 'agent_other' }, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.audit({ agentId: 'agent_other' });
      expect(result.agentId).toBe('agent_other');
    });
  });

  // ─── MCP tool interface ────────────────────────────────────────────────────

  describe('tools', () => {
    it('exposes 4 MCP tool definitions', () => {
      const vault = makeVault(AGENT_ID);
      expect(vault.tools).toHaveLength(4);
      const names = vault.tools.map((t) => t.name);
      expect(names).toContain('vault_store');
      expect(names).toContain('vault_recall');
      expect(names).toContain('vault_identity');
      expect(names).toContain('vault_audit');
    });

    it('each tool definition has a name, description and inputSchema', () => {
      const vault = makeVault(AGENT_ID);
      for (const tool of vault.tools) {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe('callTool()', () => {
    it('dispatches vault_store by tool name', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockRes(paymentRequirements, 402))
        .mockResolvedValueOnce(mockRes(storeResponse, 201));

      const vault  = makeVault(AGENT_ID);
      const result = await vault.callTool('vault_store', { data: 'test' }) as Record<string,unknown>;
      expect(result.vaultId).toBe('vault_001');
    });

    it('dispatches vault_identity by tool name', async () => {
      fetchSpy.mockResolvedValueOnce(mockRes(agentResponse, 200));
      const vault  = makeVault(AGENT_ID);
      const result = await vault.callTool('vault_identity', {}) as Record<string,unknown>;
      expect(result.verified).toBe(true);
    });

    it('throws for an unknown tool name', async () => {
      const vault = makeVault(AGENT_ID);
      await expect(vault.callTool('vault_unknown', {})).rejects.toThrow('unknown tool');
    });
  });
});
