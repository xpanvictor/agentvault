import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { webSocket, http } from 'viem';
import { loadConfig } from './types/config.js';
import {
  StorageService,
  IdentityService,
  AuditService,
  SynapseIdentityProvider,
} from './services/index.js';
import type { IIdentityProvider } from './services/index.js';
import { SettlementTracker } from './services/settlement.js';
import { RateLimiter } from './services/rateLimit.js';
import { X402Client } from './clients/index.js';
import { createAgentRoutes } from './routes/index.js';
import { createLogger } from './utils/logger.js';

async function main() {
  // Load configuration
  const config = loadConfig();

  // Create a config-driven logger for the application
  const log = createLogger(config.logging.level);

  // Initialize core services
  const storageService = new StorageService(config);
  const x402Client = new X402Client(config);
  const auditService = new AuditService();
  const settlementTracker = new SettlementTracker();
  const rateLimiter = new RateLimiter();

  // Optionally bootstrap SynapseIdentityProvider for Filecoin-backed persistence.
  // Requires IDENTITY_ENABLED=true, STORAGE_PROVIDER=synapse, STORAGE_PRIVATE_KEY set.
  // Set IDENTITY_REGISTRY_ADDRESS to a previous exportRegistry() CID to restore state.
  let identityProvider: IIdentityProvider | undefined;
  if (
    config.identity.enabled &&
    config.storage.provider === 'synapse' &&
    config.storage.privateKey
  ) {
    const identityPK = config.storage.privateKey!;
    const identityAccount = privateKeyToAccount(identityPK as `0x${string}`);
    const identityRpcUrl = config.filecoin.rpcUrl;
    const identityTransport = identityRpcUrl.startsWith('wss://') || identityRpcUrl.startsWith('ws://')
      ? webSocket(identityRpcUrl)
      : http(identityRpcUrl);

    const synapse = Synapse.create({
      chain: StorageService.chainNameMapper(config.filecoin.network),
      account: identityAccount,
      transport: identityTransport,
    });

    if (config.identity.registryAddress) {
      identityProvider = await SynapseIdentityProvider.fromRegistryCid(
        synapse,
        config.identity.registryAddress,
      );
    } else {
      identityProvider = new SynapseIdentityProvider(synapse);
    }
  }

  const identityService = new IdentityService(config, identityProvider);

  // Create Hono app
  const app = new Hono();

  // Middleware — CORS + structured pino request logging
  app.use('*', cors());
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      'request',
    );
  });

  // Health check
  app.get('/health', async (c) => {
    const storageStats = storageService.getStats();
    const x402Health = await x402Client.healthCheck();
    const auditStats = auditService.getStats();
    const settlementStats = settlementTracker.getStats();
    const identityStats = identityService.getStats();

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      storage: storageStats,
      identity: identityStats,
      audit: auditStats,
      settlement: settlementStats,
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
        audit: 'GET /agent/audit/:agentId',
        register: 'POST /agent/register',
        agent: 'GET /agent/:agentId',
        exportRegistry: 'POST /agent/export-registry',
        settlements: 'GET /agent/settlements',
        settlement: 'GET /agent/settlements/:paymentId',
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

  // Start server
  log.info(
    { host: config.server.host, port: config.server.port },
    'Starting AgentVault',
  );
  log.info(
    { url: config.x402.apiUrl, mock: config.x402.mock },
    'X402 API configured',
  );
  log.info({ address: config.facilitator.address }, 'Facilitator configured');

  const server = serve(
    {
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host,
    },
    (info) => {
      log.info({ address: info.address, port: info.port }, 'AgentVault running');
    },
  );

  // Graceful shutdown — auto-export identity registry, then stop accepting connections
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down AgentVault');

    // Auto-export registry to Filecoin so state survives the restart.
    // Only runs when IDENTITY_ENABLED=true and STORAGE_PROVIDER=synapse.
    if (config.identity.enabled && identityService.supportsExport()) {
      try {
        const cid = await Promise.race([
          identityService.exportRegistry(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('export timeout')), 10_000),
          ),
        ]);
        log.info(
          { cid },
          'Registry exported — set IDENTITY_REGISTRY_ADDRESS to this CID to restore on next start',
        );
      } catch (err) {
        log.error({ err }, 'Failed to export identity registry on shutdown');
      }
    }

    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
  process.on('SIGINT',  () => { shutdown('SIGINT').catch(() => process.exit(1)); });
}

main().catch((err) => {
  // Use console.error here as logger may not be initialised yet
  console.error('Failed to start AgentVault:', err);
  process.exit(1);
});
