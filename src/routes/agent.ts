import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Config } from '../types/config.js';
import type { StorageService } from '../services/index.js';
import type { X402Client, PaymentRequirements } from '../clients/x402.js';
import {
  Payment,
  PaymentSchema,
  StoreRequestSchema,
  type StoreResponse,
  type RetrieveResponse,
  type PDPVerifyResponse,
  type VaultEntry,
} from '../types/storage.js';

/**
 * Extract payment from x-payment header
 */
function extractPaymentHeader(headerValue: string | undefined): Payment | null {
  if (!headerValue) return null;

  try {
    const parsed = JSON.parse(headerValue);
    const result = PaymentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Calculate storage cost in USDFC units
 * Pricing: $0.001 per KB, minimum $0.01
 */
function calculateStorageCost(sizeBytes: number): string {
  const pricePerKb = 0.001;
  const sizeKb = Math.ceil(sizeBytes / 1024);
  const price = Math.max(pricePerKb * sizeKb, 0.01);

  // Convert to USDFC units (6 decimals)
  const usdfcUnits = BigInt(Math.floor(price * 1_000_000));
  return usdfcUnits.toString();
}

/**
 * Build payment requirements for 402 response
 */
function buildPaymentRequirements(
  config: Config,
  cost: string,
  resource: string
): PaymentRequirements {
  return {
    payTo: config.facilitator.address,
    maxAmountRequired: cost,
    tokenAddress: config.filecoin.usdfcAddress,
    chainId: config.filecoin.chainId,
    resource,
  };
}

/**
 * Create agent routes
 */
export function createAgentRoutes(
  storageService: StorageService,
  x402Client: X402Client,
  config: Config
) {
  const router = new Hono();

  /**
   * POST /agent/store
   * Store data with x402 payment
   */
  router.post(
    '/store',
    zValidator('json', StoreRequestSchema),
    async (c) => {
      const body = c.req.valid('json');
      const paymentHeader = c.req.header('x-payment');
      const payment = extractPaymentHeader(paymentHeader);

      // Calculate cost based on data size
      const dataSize = Buffer.byteLength(body.data, 'utf8');
      const cost = calculateStorageCost(dataSize);
      const requirements = buildPaymentRequirements(config, cost, '/agent/store');

      // No payment header → return 402 with requirements
      if (!payment) {
        return c.json(requirements, 402);
      }

      // Verify payment (skip if mock mode)
      if (!config.x402.mock) {
        const verifyResult = await x402Client.verifyPayment(payment, requirements);

        if (!verifyResult.valid) {
          return c.json(
            { error: 'payment_invalid', reason: verifyResult.reason },
            400
          );
        }
      }

      // Store the data
      const result = await storageService.store({
        agentId: body.agentId,
        data: body.data,
        metadata: body.metadata,
      });

      if (!result.success) {
        return c.json(
          { error: 'storage_failed', reason: result.error },
          500
        );
      }

      // Async: settle payment (fire and forget)
      if (!config.x402.mock) {
        x402Client.settlePayment(payment, requirements).catch((err) => {
          console.error('Settlement failed:', err);
        });
      }

      const response: StoreResponse = {
        success: true,
        vaultId: result.vaultId,
        pieceCid: result.pieceCid,
        agentId: result.agentId,
        storedAt: result.storedAt,
        size: result.size,
        pdpStatus: result.pdpStatus,
        paymentId: result.paymentId,
      };

      return c.json(response, 201);
    }
  );

  /**
   * GET /agent/retrieve/:id
   * Retrieve data by vaultId or pieceCid with x402 payment
   */
  router.get('/retrieve/:id', async (c) => {
    const id = c.req.param('id');
    const paymentHeader = c.req.header('x-payment');
    const payment = extractPaymentHeader(paymentHeader);

    // First, check if vault exists to get size for pricing
    const vault = storageService.getVault(id);

    if (!vault) {
      return c.json({ error: 'not_found', reason: `Vault not found: ${id}` }, 404);
    }

    // Calculate cost based on stored data size
    const cost = calculateStorageCost(vault.size);
    const requirements = buildPaymentRequirements(config, cost, `/agent/retrieve/${id}`);

    // No payment header → return 402 with requirements
    if (!payment) {
      return c.json(requirements, 402);
    }

    // Verify payment (skip if mock mode)
    if (!config.x402.mock) {
      const verifyResult = await x402Client.verifyPayment(payment, requirements);

      if (!verifyResult.valid) {
        return c.json(
          { error: 'payment_invalid', reason: verifyResult.reason },
          400
        );
      }
    }

    // Retrieve the data
    const result = await storageService.retrieve(id);

    if (!result.success) {
      return c.json(
        { error: 'retrieval_failed', reason: result.error },
        500
      );
    }

    // Async: settle payment (fire and forget)
    if (!config.x402.mock) {
      x402Client.settlePayment(payment, requirements).catch((err) => {
        console.error('Settlement failed:', err);
      });
    }

    const response: RetrieveResponse = {
      success: true,
      data: result.data,
      pieceCid: result.pieceCid,
      vaultId: result.vaultId,
      pdpStatus: result.pdpStatus,
      pdpVerifiedAt: result.pdpVerifiedAt,
      metadata: result.metadata,
    };

    return c.json(response);
  });

  /**
   * GET /agent/verify/:pieceCid
   * Verify PDP proof (FREE - no payment required)
   */
  router.get('/verify/:pieceCid', async (c) => {
    const pieceCid = c.req.param('pieceCid');

    const result = await storageService.verify(pieceCid);

    const response: PDPVerifyResponse = {
      exists: result.exists,
      pieceCid: result.pieceCid,
      vaultId: result.vaultId,
      storedBy: result.storedBy,
      storedAt: result.storedAt,
      pdpVerified: result.pdpVerified,
      pdpVerifiedAt: result.pdpVerifiedAt,
    };

    return c.json(response);
  });

  /**
   * GET /agent/vaults/:agentId
   * List all vaults for an agent (FREE - no payment required)
   */
  router.get('/vaults/:agentId', async (c) => {
    const agentId = c.req.param('agentId');

    const vaults = storageService.getVaultsForAgent(agentId);

    // Map to summary format (exclude full data)
    const vaultSummaries = vaults.map((v: VaultEntry) => ({
      vaultId: v.vaultId,
      pieceCid: v.pieceCid,
      type: v.metadata?.type || 'other',
      size: v.size,
      storedAt: v.storedAt,
      pdpStatus: v.pdpStatus,
    }));

    return c.json({
      agentId,
      vaults: vaultSummaries,
      total: vaults.length,
    });
  });

  return router;
}
