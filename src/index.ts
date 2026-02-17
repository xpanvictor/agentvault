import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './types/config.js';

const config = loadConfig();
const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'AgentVault',
    version: '0.1.0',
    description: 'Verifiable storage infrastructure for autonomous AI agents',
    endpoints: {
      health: '/health',
      store: 'POST /agent/store',
      retrieve: 'GET /agent/retrieve/:id',
      verify: 'GET /agent/verify/:cid',
      register: 'POST /agent/register',
      audit: 'GET /agent/audit/:agentId',
    },
    x402: {
      dependency: config.x402.apiUrl,
      status: 'pending_check',
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
