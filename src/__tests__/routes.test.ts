import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAgentRoutes } from '../routes/agent.js';
import { StorageService } from '../services/storage/index.js';
import { IdentityService } from '../services/identity/index.js';
import { AuditService } from '../services/audit.js';
import { X402Client } from '../clients/x402.js';
import { SettlementTracker } from '../services/settlement.js';
import { RateLimiter } from '../services/rateLimit.js';
import type { Config } from '../types/config.js';

// ---------------------------------------------------------------------------
// Mock viem — identity service uses verifyMessage
// ---------------------------------------------------------------------------
vi.mock('viem', () => ({
  verifyMessage: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Config & helpers
// ---------------------------------------------------------------------------

const config: Config = {
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

/** A valid-format x-payment JSON (mock mode skips real verification) */
const mockPaymentHeader = JSON.stringify({
  from: '0xabc123',
  to: '0xdef456',
  value: '10000',
  validAfter: '0',
  validBefore: '9999999999',
  nonce: 'abc123',
  signature: '0xsig',
  token: '0xtoken',
});

function buildApp() {
  const storageService = new StorageService(config);
  const identityService = new IdentityService(config);
  const auditService = new AuditService();
  const x402Client = new X402Client(config);
  const settlementTracker = new SettlementTracker();
  const rateLimiter = new RateLimiter();

  const app = new Hono();
  const routes = createAgentRoutes(
    storageService,
    x402Client,
    config,
    identityService,
    auditService,
    settlementTracker,
    rateLimiter,
  );
  app.route('/agent', routes);

  return { app, storageService, identityService, auditService, settlementTracker, rateLimiter };
}

// ---------------------------------------------------------------------------
// POST /agent/store
// ---------------------------------------------------------------------------

describe('POST /agent/store', () => {
  it('returns 402 with payment requirements when no x-payment header', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent_test', data: 'hello' }),
    });

    expect(res.status).toBe(402);
    const body = await res.json() as Record<string, unknown>;
    expect(body.payTo).toBeTruthy();
    expect(body.maxAmountRequired).toBeTruthy();
  });

  it('stores data and returns 201 with vaultId when payment is provided', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payment': mockPaymentHeader,
      },
      body: JSON.stringify({ agentId: 'agent_001', data: 'hello world' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect((body.vaultId as string)).toMatch(/^vault_/);
    expect(body.agentId).toBe('agent_001');
  });

  it('returns 400 for invalid request body', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payment': mockPaymentHeader,
      },
      body: JSON.stringify({ agentId: 'a' }), // missing 'data'
    });

    expect(res.status).toBe(400);
  });

  it('syncs vault into identityService manifest after store', async () => {
    const { app, identityService, storageService } = buildApp();

    // Pre-register an agent so the manifest lookup works
    await identityService.registerAgent({
      address: '0xabc1230000000000000000000000000000000001',
      agentCard: { name: 'TestAgent', version: '1.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    });

    const agentId = identityService.getByAddress('0xabc1230000000000000000000000000000000001')!.agentId;

    const res = await app.request('/agent/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payment': mockPaymentHeader,
      },
      body: JSON.stringify({ agentId, data: 'manifest sync test' }),
    });

    expect(res.status).toBe(201);

    const agent = identityService.getById(agentId)!;
    expect(agent.storageManifest).toHaveLength(1);
    expect(agent.reputation.totalStored).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/retrieve/:id
// ---------------------------------------------------------------------------

describe('GET /agent/retrieve/:id', () => {
  it('returns 404 for unknown vault', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/retrieve/vault_unknown', {
      headers: { 'x-payment': mockPaymentHeader },
    });

    expect(res.status).toBe(404);
  });

  it('returns 402 when no x-payment header is provided', async () => {
    const { app, storageService } = buildApp();

    // Store something first
    const stored = await storageService.store({ agentId: 'agent_r', data: 'data to retrieve' });

    const res = await app.request(`/agent/retrieve/${stored.vaultId}`);
    expect(res.status).toBe(402);
  });

  it('retrieves data with valid payment', async () => {
    const { app, storageService } = buildApp();

    const stored = await storageService.store({ agentId: 'agent_r', data: 'retrieve me' });

    const res = await app.request(`/agent/retrieve/${stored.vaultId}`, {
      headers: { 'x-payment': mockPaymentHeader },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.data).toBe('retrieve me');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/verify/:pieceCid
// ---------------------------------------------------------------------------

describe('GET /agent/verify/:pieceCid', () => {
  it('returns exists=false for unknown pieceCid', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/verify/bafk_unknown');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.pdpVerified).toBe(false);
  });

  it('returns exists=true and pdpVerified for stored piece', async () => {
    const { app, storageService } = buildApp();

    const stored = await storageService.store({ agentId: 'agent_v', data: 'verify me' });

    const res = await app.request(`/agent/verify/${stored.pieceCid}`);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.exists).toBe(true);
    expect(body.pdpVerified).toBe(true);
    expect(body.storedBy).toBe('agent_v');
  });

  it('updates agent reputation after verify', async () => {
    const { app, storageService, identityService } = buildApp();

    // Register agent, store data, then verify
    await identityService.registerAgent({
      address: '0xabc1230000000000000000000000000000000002',
      agentCard: { name: 'VerifyAgent', version: '1.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    });

    const agent = identityService.getByAddress('0xabc1230000000000000000000000000000000002')!;

    // Add vault directly to manifest so updateManifestPDPStatus has something to update
    const stored = await storageService.store({ agentId: agent.agentId, data: 'verify test' });
    identityService.addToManifest(agent.agentId, {
      vaultId: stored.vaultId,
      pieceCid: stored.pieceCid,
      type: 'other',
      storedAt: stored.storedAt,
      size: stored.size ?? 0,
      pdpStatus: 'pending',
    });

    await app.request(`/agent/verify/${stored.pieceCid}`);

    const updated = identityService.getById(agent.agentId)!;
    expect(updated.storageManifest[0].pdpStatus).toBe('verified');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/vaults/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/vaults/:agentId', () => {
  it('returns empty vaults array for unknown agent', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/vaults/nobody');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.vaults).toEqual([]);
  });

  it('returns vaults for a known agent', async () => {
    const { app, storageService } = buildApp();

    await storageService.store({ agentId: 'agent_list', data: 'item 1' });
    await storageService.store({ agentId: 'agent_list', data: 'item 2' });

    const res = await app.request('/agent/vaults/agent_list');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(Array.isArray(body.vaults)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/audit/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/audit/:agentId', () => {
  it('returns empty audit trail for unknown agent', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/audit/nobody');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.agentId).toBe('nobody');
    expect((body.entries as unknown[]).length).toBe(0);
    expect((body.summary as Record<string, unknown>).totalOperations).toBe(0);
  });

  it('shows store audit entries after a store operation', async () => {
    const { app } = buildApp();

    await app.request('/agent/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payment': mockPaymentHeader,
      },
      body: JSON.stringify({ agentId: 'agent_audit', data: 'audit this' }),
    });

    const res = await app.request('/agent/audit/agent_audit');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect((body.summary as Record<string, unknown>).totalStored).toBe(1);
    expect((body.entries as unknown[]).length).toBe(1);
    const entry = (body.entries as Record<string, unknown>[])[0];
    expect(entry.action).toBe('store');
  });
});

// ---------------------------------------------------------------------------
// POST /agent/register
// ---------------------------------------------------------------------------

describe('POST /agent/register', () => {
  it('registers a new agent and returns 201', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xabc1230000000000000000000000000000000003',
        agentCard: { name: 'MyAgent', version: '1.0.0', x402Support: true },
        signature: `0x${'ab'.repeat(65)}`,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(true);
    expect((body.agentId as string)).toMatch(/^agent_/);
  });

  it('returns 200 and isNew=false for re-registration of same address', async () => {
    const { app } = buildApp();

    const payload = JSON.stringify({
      address: '0xabc1230000000000000000000000000000000004',
      agentCard: { name: 'Repeat', version: '1.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    });

    await app.request('/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    const res2 = await app.request('/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    expect(res2.status).toBe(200);
    const body = await res2.json() as Record<string, unknown>;
    expect(body.isNew).toBe(false);
  });

  it('returns 400 when viem rejects the signature', async () => {
    const { verifyMessage } = await import('viem');
    vi.mocked(verifyMessage).mockResolvedValueOnce(false);

    const { app } = buildApp();

    const res = await app.request('/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xabc1230000000000000000000000000000000005',
        agentCard: { name: 'BadSig', version: '1.0.0', x402Support: true },
        signature: `0x${'ab'.repeat(65)}`,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('registration_failed');
  });
});

// ---------------------------------------------------------------------------
// POST /agent/export-registry
// ---------------------------------------------------------------------------

describe('POST /agent/export-registry', () => {
  it('returns 503 when identity is not enabled', async () => {
    const { app } = buildApp(); // config.identity.enabled = false

    const res = await app.request('/agent/export-registry', { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('identity_not_enabled');
  });

  it('returns 501 when identity is enabled but provider is mock', async () => {
    // Build app with identity.enabled=true but still using MockIdentityProvider
    const identityEnabledConfig: Config = { ...config, identity: { enabled: true } };
    const storageService = new StorageService(identityEnabledConfig);
    const identityService = new IdentityService(identityEnabledConfig); // no SynapseIdentityProvider passed → mock
    const auditService = new AuditService();
    const x402Client = new X402Client(identityEnabledConfig);
    const settlementTracker = new SettlementTracker();
    const rateLimiter = new RateLimiter();

    const app = new Hono();
    const routes = createAgentRoutes(
      storageService, x402Client, identityEnabledConfig,
      identityService, auditService, settlementTracker, rateLimiter,
    );
    app.route('/agent', routes);

    const res = await app.request('/agent/export-registry', { method: 'POST' });
    expect(res.status).toBe(501);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('not_supported');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/settlements  &  GET /agent/settlements/:paymentId
// ---------------------------------------------------------------------------

describe('GET /agent/settlements', () => {
  it('returns empty list when no settlements have been tracked', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/settlements');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.records).toEqual([]);
    expect((body.stats as Record<string, unknown>).total).toBe(0);
  });

  it('returns 400 for an invalid status filter', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/settlements?status=invalid');
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('invalid_filter');
  });

  it('reflects settlements tracked during store operations', async () => {
    // In mock mode settlements are not actually tracked (block guarded by !config.x402.mock)
    // so we test that the list endpoint works correctly with directly seeded data
    const { app, settlementTracker } = buildApp();

    settlementTracker.track('nonce_001', 'agent_s', '/agent/store');
    settlementTracker.updateStatus('nonce_001', 'settled');
    settlementTracker.track('nonce_002', 'agent_s', '/agent/store');
    // nonce_002 remains pending

    const res = await app.request('/agent/settlements');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    const stats = body.stats as Record<string, unknown>;
    expect(stats.settled).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('filters by ?status=pending', async () => {
    const { app, settlementTracker } = buildApp();

    settlementTracker.track('n1', 'ag', '/store');
    settlementTracker.track('n2', 'ag', '/store');
    settlementTracker.updateStatus('n2', 'settled');

    const res = await app.request('/agent/settlements?status=pending');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect((body.records as Record<string, unknown>[])[0].paymentId).toBe('n1');
  });

  it('filters by ?status=failed', async () => {
    const { app, settlementTracker } = buildApp();

    settlementTracker.track('n3', 'ag', '/store');
    settlementTracker.updateStatus('n3', 'failed', 'timeout');

    const res = await app.request('/agent/settlements?status=failed');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect((body.records as Record<string, unknown>[])[0].error).toBe('timeout');
  });
});

describe('GET /agent/settlements/:paymentId', () => {
  it('returns 404 for an unknown paymentId', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/settlements/unknown_nonce');
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('not_found');
  });

  it('returns the settlement record for a known paymentId', async () => {
    const { app, settlementTracker } = buildApp();

    settlementTracker.track('nonce_lookup', 'agent_look', '/agent/retrieve/vault_01');
    settlementTracker.updateStatus('nonce_lookup', 'settled');

    const res = await app.request('/agent/settlements/nonce_lookup');
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.paymentId).toBe('nonce_lookup');
    expect(body.agentId).toBe('agent_look');
    expect(body.status).toBe('settled');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/:agentId', () => {
  it('returns 404 for unknown agentId', async () => {
    const { app } = buildApp();

    const res = await app.request('/agent/agent_unknown');
    expect(res.status).toBe(404);
  });

  it('returns agent details after registration', async () => {
    const { app } = buildApp();

    const regRes = await app.request('/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xabc1230000000000000000000000000000000006',
        agentCard: { name: 'LookupAgent', version: '2.0.0', x402Support: true },
        signature: `0x${'ab'.repeat(65)}`,
      }),
    });
    const reg = await regRes.json() as Record<string, unknown>;

    const res = await app.request(`/agent/${reg.agentId}`);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.found).toBe(true);
    const agent = body.agent as Record<string, unknown>;
    expect(agent.agentId).toBe(reg.agentId);
    expect((agent.agentCard as Record<string, unknown>).name).toBe('LookupAgent');
  });
});
