import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './types/config.js';
import { StorageService } from './services/index.js';

const config = loadConfig();
const app = new Hono();

// Initialize services
const storageService = new StorageService(config);

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', (c) => {
  const storageStats = storageService.getStats();
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    storage: storageStats,
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
      health: '/health',
      store: 'POST /agent/store',
      retrieve: 'GET /agent/retrieve/:id',
      verify: 'GET /agent/verify/:pieceCid',
      register: 'POST /agent/register',
      audit: 'GET /agent/audit/:agentId',
    },
    x402: {
      dependency: config.x402.apiUrl,
      status: 'pending_check',
    },
    storage: {
      provider: storageStats.provider,
      status: 'ready',
    },
  });
});

// Start server
console.log(`Starting AgentVault on ${config.server.host}:${config.server.port}`);

serve({
  fetch: app.fetch,
  port: config.server.port,
  hostname: config.server.host,
}, (info) => {
  console.log(`AgentVault running at http://${info.address}:${info.port}`);
});
