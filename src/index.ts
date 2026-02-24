import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './types/config.js';
import { StorageService } from './services/index.js';
import { X402Client } from './clients/index.js';
import { createAgentRoutes } from './routes/index.js';

// Load configuration
const config = loadConfig();

// Initialize services
const storageService = new StorageService(config);
const x402Client = new X402Client(config);

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', async (c) => {
  const storageStats = storageService.getStats();
  const x402Health = await x402Client.healthCheck();

  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    storage: storageStats,
    x402: {
      url: config.x402.apiUrl,
      healthy: x402Health.healthy,
      mock: config.x402.mock,
    },
  });
});

// Root endpoint
app.get('/', (c) => {
  const storageStats = storageService.getStats();

  return c.json({
    service: 'AgentVault',
    version: '0.1.0',
    description: 'Verifiable storage infrastructure for autonomous AI agents',
    endpoints: {
      health: 'GET /health',
      store: 'POST /agent/store',
      retrieve: 'GET /agent/retrieve/:id',
      verify: 'GET /agent/verify/:pieceCid',
      vaults: 'GET /agent/vaults/:agentId',
    },
    x402: {
      dependency: config.x402.apiUrl,
      mock: config.x402.mock,
    },
    storage: {
      provider: storageStats.provider,
      vaults: storageStats.vaults,
      agents: storageStats.agents,
    },
    facilitator: {
      address: config.facilitator.address,
    },
  });
});

// Mount agent routes
const agentRoutes = createAgentRoutes(storageService, x402Client, config);
app.route('/agent', agentRoutes);

// Start server
console.log(`Starting AgentVault on ${config.server.host}:${config.server.port}`);
console.log(`X402 API: ${config.x402.apiUrl} (mock: ${config.x402.mock})`);
console.log(`Facilitator: ${config.facilitator.address}`);

serve({
  fetch: app.fetch,
  port: config.server.port,
  hostname: config.server.host,
}, (info) => {
  console.log(`AgentVault running at http://${info.address}:${info.port}`);
});
