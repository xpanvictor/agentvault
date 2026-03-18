/**
 * E2E tests — start a real HTTP server and exercise the full stack
 * via actual fetch() calls over the network.
 *
 * All external dependencies (Filecoin, x402 API, viem signature verification)
 * are either mocked or bypassed via mock-mode config so no live services are
 * required.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ServerType } from '@hono/node-server';
import { StorageService } from '../services/storage/index.js';
import { IdentityService } from '../services/identity/index.js';
import { AuditService } from '../services/audit.js';
import { X402Client } from '../clients/x402.js';
import { SettlementTracker } from '../services/settlement.js';
import { RateLimiter } from '../services/rateLimit.js';
import { createAgentRoutes } from '../routes/index.js';
import type { Config } from '../types/config.js';

// ---------------------------------------------------------------------------
// Mock viem — MockIdentityProvider calls verifyMessage for agent registration
// ---------------------------------------------------------------------------
vi.mock('viem', () => ({
  verifyMessage: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Shared config — mock storage + mock x402, no external services needed
// ---------------------------------------------------------------------------
const config: Config = {
  server: { port: 0, host: '127.0.0.1' },
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

// ---------------------------------------------------------------------------
// Server bootstrap — shared across all tests
// ---------------------------------------------------------------------------
let httpServer: ServerType;
let baseUrl: string;

// Service instances exposed so individual tests can seed / inspect state
let storageService: StorageService;
let identityService: IdentityService;
let auditService: AuditService;
let settlementTracker: SettlementTracker;

/** A valid-format x-payment JSON payload (mock mode skips real verification) */
const MOCK_PAYMENT = JSON.stringify({
  from: '0xabc123',
  to: '0xdef456',
  value: '10000',
  validAfter: '0',
  validBefore: '9999999999',
  nonce: 'e2e_nonce_001',
  signature: '0xsig',
  token: '0xtoken',
});

beforeAll(async () => {
  storageService = new StorageService(config);
  identityService = new IdentityService(config);
  auditService = new AuditService();
  const x402Client = new X402Client(config);
  settlementTracker = new SettlementTracker();
  const rateLimiter = new RateLimiter();

  const app = new Hono();
  app.use('*', cors());

  // Health check (mirrors index.ts)
  app.get('/health', async (c) => {
    const x402Health = await x402Client.healthCheck();
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      storage: storageService.getStats(),
      identity: identityService.getStats(),
      audit: auditService.getStats(),
      settlement: settlementTracker.getStats(),
      x402: { url: config.x402.apiUrl, healthy: x402Health.healthy, mock: config.x402.mock },
    });
  });

  // Root info endpoint (mirrors index.ts)
  app.get('/', (c) =>
    c.json({ service: 'AgentVault', version: '0.1.0' }),
  );

  const agentRoutes = createAgentRoutes(
    storageService,
    x402Client,
    config,
    identityService,
    auditService,
    settlementTracker,
    rateLimiter,
  );
  app.route('/agent', agentRoutes);

  // Start server on a random OS-assigned port
  await new Promise<void>((resolve) => {
    httpServer = serve(
      { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
      (info) => {
        baseUrl = `http://127.0.0.1:${info.port}`;
        resolve();
      },
    );
  });
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function get(path: string, headers?: Record<string, string>) {
  return fetch(`${baseUrl}${path}`, { headers });
}

function post(path: string, body: unknown, headers?: Record<string, string>) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns service info', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.service).toBe('AgentVault');
    expect(body.version).toBe('0.1.0');
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns status=ok with all subsystem stats', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.timestamp).toBe('string');
    // Subsystem keys present
    expect(body.storage).toBeDefined();
    expect(body.audit).toBeDefined();
    expect(body.settlement).toBeDefined();
    expect(body.identity).toBeDefined();
    // x402 mock mode flag set correctly
    const x402 = body.x402 as Record<string, unknown>;
    expect(x402.mock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /agent/store
// ---------------------------------------------------------------------------

describe('POST /agent/store', () => {
  it('returns 402 with payment requirements when no x-payment header', async () => {
    const res = await post('/agent/store', { agentId: 'e2e_agent', data: 'hello' });
    expect(res.status).toBe(402);
    const body = await res.json() as Record<string, unknown>;
    expect(body.payTo).toBeDefined();
    expect(body.maxAmountRequired).toBeDefined();
    expect(body.tokenAddress).toBeDefined();
  });

  it('returns 400 when request body is invalid (missing data field)', async () => {
    const res = await post(
      '/agent/store',
      { agentId: 'e2e_agent' },
      { 'x-payment': MOCK_PAYMENT },
    );
    expect(res.status).toBe(400);
  });

  it('stores data and returns 201 with vaultId when payment is provided', async () => {
    const res = await post(
      '/agent/store',
      { agentId: 'e2e_agent_001', data: 'hello from E2E' },
      { 'x-payment': MOCK_PAYMENT },
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect((body.vaultId as string)).toMatch(/^vault_/);
    expect(body.agentId).toBe('e2e_agent_001');
    expect(typeof body.pieceCid).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Full store → retrieve → verify flow
// ---------------------------------------------------------------------------

describe('store → retrieve → verify integration', () => {
  it('stores, retrieves, and verifies a vault end-to-end', async () => {
    // --- Store ---
    const storeRes = await post(
      '/agent/store',
      { agentId: 'e2e_flow_agent', data: 'integration payload', metadata: { type: 'state' } },
      { 'x-payment': MOCK_PAYMENT },
    );
    expect(storeRes.status).toBe(201);
    const stored = await storeRes.json() as Record<string, unknown>;
    const vaultId = stored.vaultId as string;
    const pieceCid = stored.pieceCid as string;

    // --- Retrieve without payment → 402 ---
    const noPayRes = await get(`/agent/retrieve/${vaultId}`);
    expect(noPayRes.status).toBe(402);

    // --- Retrieve with payment → 200 ---
    const retrieveRes = await get(
      `/agent/retrieve/${vaultId}`,
      { 'x-payment': MOCK_PAYMENT },
    );
    expect(retrieveRes.status).toBe(200);
    const retrieved = await retrieveRes.json() as Record<string, unknown>;
    expect(retrieved.success).toBe(true);
    expect(retrieved.data).toBe('integration payload');
    expect(retrieved.vaultId).toBe(vaultId);

    // --- Verify ---
    const verifyRes = await get(`/agent/verify/${pieceCid}`);
    expect(verifyRes.status).toBe(200);
    const verified = await verifyRes.json() as Record<string, unknown>;
    expect(verified.exists).toBe(true);
    expect(verified.pdpVerified).toBe(true);
    expect(verified.storedBy).toBe('e2e_flow_agent');
    expect(verified.pieceCid).toBe(pieceCid);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/retrieve/:id — edge cases
// ---------------------------------------------------------------------------

describe('GET /agent/retrieve/:id', () => {
  it('returns 404 for an unknown vaultId', async () => {
    const res = await get('/agent/retrieve/vault_nonexistent', { 'x-payment': MOCK_PAYMENT });
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/verify/:pieceCid
// ---------------------------------------------------------------------------

describe('GET /agent/verify/:pieceCid', () => {
  it('returns exists=false for an unknown pieceCid', async () => {
    const res = await get('/agent/verify/bafk_not_real');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.exists).toBe(false);
    expect(body.pdpVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/vaults/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/vaults/:agentId', () => {
  it('returns empty vaults list for unknown agent', async () => {
    const res = await get('/agent/vaults/agent_nobody');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.total).toBe(0);
    expect(body.vaults).toEqual([]);
  });

  it('returns stored vaults for a known agent', async () => {
    // Store two items for a unique agent
    const agentId = 'e2e_vault_list_agent';
    await post('/agent/store', { agentId, data: 'item A' }, { 'x-payment': MOCK_PAYMENT });
    await post('/agent/store', { agentId, data: 'item B' }, { 'x-payment': MOCK_PAYMENT });

    const res = await get(`/agent/vaults/${agentId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.total).toBe(2);
    expect(Array.isArray(body.vaults)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/audit/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/audit/:agentId', () => {
  it('returns empty audit trail for unknown agent', async () => {
    const res = await get('/agent/audit/agent_no_history');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.entries as unknown[]).length).toBe(0);
    expect((body.summary as Record<string, unknown>).totalOperations).toBe(0);
  });

  it('shows store audit entry after a store operation', async () => {
    const agentId = 'e2e_audit_agent';
    await post('/agent/store', { agentId, data: 'audit test' }, { 'x-payment': MOCK_PAYMENT });

    const res = await get(`/agent/audit/${agentId}`);
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    const entries = body.entries as Record<string, unknown>[];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].action).toBe('store');
  });
});

// ---------------------------------------------------------------------------
// POST /agent/register
// ---------------------------------------------------------------------------

describe('POST /agent/register', () => {
  it('registers a new agent and returns 201', async () => {
    const res = await post('/agent/register', {
      address: '0xe2e0000000000000000000000000000000000001',
      agentCard: { name: 'E2EAgent', version: '1.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(true);
    expect((body.agentId as string)).toMatch(/^agent_/);
  });

  it('returns 200 and isNew=false when the same address registers again', async () => {
    const payload = {
      address: '0xe2e0000000000000000000000000000000000002',
      agentCard: { name: 'Idempotent', version: '1.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    };
    await post('/agent/register', payload);
    const res2 = await post('/agent/register', payload);
    expect(res2.status).toBe(200);
    const body = await res2.json() as Record<string, unknown>;
    expect(body.isNew).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/:agentId
// ---------------------------------------------------------------------------

describe('GET /agent/:agentId', () => {
  it('returns 404 for an unknown agentId', async () => {
    const res = await get('/agent/agent_e2e_nobody');
    expect(res.status).toBe(404);
  });

  it('returns agent data after registration', async () => {
    const regRes = await post('/agent/register', {
      address: '0xe2e0000000000000000000000000000000000003',
      agentCard: { name: 'LookupE2E', version: '3.0.0', x402Support: true },
      signature: `0x${'ab'.repeat(65)}`,
    });
    const reg = await regRes.json() as Record<string, unknown>;

    const res = await get(`/agent/${reg.agentId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.found).toBe(true);
    const agent = body.agent as Record<string, unknown>;
    expect(agent.agentId).toBe(reg.agentId);
    expect((agent.agentCard as Record<string, unknown>).name).toBe('LookupE2E');
  });
});

// ---------------------------------------------------------------------------
// GET /agent/settlements  &  GET /agent/settlements/:paymentId
// ---------------------------------------------------------------------------

describe('GET /agent/settlements', () => {
  it('returns settlement list with stats', async () => {
    // Seed two records directly so we do not depend on mock-mode settling
    settlementTracker.track('e2e_pay_001', 'e2e_ag', '/agent/store');
    settlementTracker.updateStatus('e2e_pay_001', 'settled');
    settlementTracker.track('e2e_pay_002', 'e2e_ag', '/agent/store');
    // e2e_pay_002 stays pending

    const res = await get('/agent/settlements');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const stats = body.stats as Record<string, unknown>;
    // Stats accumulate from all tests — just verify keys exist and counts are sensible
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.settled).toBe('number');
    expect(Array.isArray(body.records)).toBe(true);
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await get('/agent/settlements?status=bogus');
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('invalid_filter');
  });

  it('filters by ?status=pending', async () => {
    settlementTracker.track('e2e_filter_001', 'e2e_filter_ag', '/agent/store');
    // leave as pending

    const res = await get('/agent/settlements?status=pending');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const records = body.records as Record<string, unknown>[];
    expect(records.every((r) => r.status === 'pending')).toBe(true);
  });
});

describe('GET /agent/settlements/:paymentId', () => {
  it('returns 404 for unknown paymentId', async () => {
    const res = await get('/agent/settlements/pay_not_real');
    expect(res.status).toBe(404);
  });

  it('returns the settlement record for a known paymentId', async () => {
    settlementTracker.track('e2e_lookup_pay', 'e2e_lookup_ag', '/agent/retrieve/v1');
    settlementTracker.updateStatus('e2e_lookup_pay', 'failed', 'network error');

    const res = await get('/agent/settlements/e2e_lookup_pay');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.paymentId).toBe('e2e_lookup_pay');
    expect(body.status).toBe('failed');
    expect(body.error).toBe('network error');
  });
});

// ---------------------------------------------------------------------------
// POST /agent/export-registry
// ---------------------------------------------------------------------------

describe('POST /agent/export-registry', () => {
  it('returns 503 when identity is disabled (default config)', async () => {
    const res = await fetch(`${baseUrl}/agent/export-registry`, { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('identity_not_enabled');
  });
});

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

describe('CORS', () => {
  it('returns Access-Control-Allow-Origin header on GET /health', async () => {
    const corsRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://example.com' },
    });
    expect(corsRes.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});
