import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Config } from "../types/config.js";
import type {
  StorageService,
  IdentityService,
  AuditService,
} from "../services/index.js";
import type { X402Client, PaymentRequirements } from "../clients/x402.js";
import {
  Payment,
  PaymentSchema,
  StoreRequestSchema,
  type StoreResponse,
  type RetrieveResponse,
  type PDPVerifyResponse,
  type VaultEntry,
} from "../types/storage.js";
import { RegisterAgentSchema } from "../types/agent.js";
import { SettlementTracker } from "../services/settlement.js";
import type { SettlementStatus } from "../services/settlement.js";
import { RateLimiter } from "../services/rateLimit.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

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
  resource: string,
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
  config: Config,
  identityService: IdentityService,
  auditService: AuditService,
  settlementTracker: SettlementTracker,
  rateLimiter: RateLimiter,
) {
  const router = new Hono();

  /**
   * POST /agent/store
   * Store data with x402 payment
   */
  router.post("/store", zValidator("json", StoreRequestSchema), async (c) => {
    const body = c.req.valid("json");

    // Per-agent rate limit check (before payment verification to save API calls)
    const rl = rateLimiter.check(body.agentId);
    if (!rl.allowed) {
      auditService.log({
        agentId: body.agentId,
        action: "store",
        details: { success: false, error: "rate_limit_exceeded" },
      });
      return c.json(
        { error: "rate_limit_exceeded", resetAt: rl.resetAt, remaining: 0 },
        429,
        {
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      );
    }

    const paymentHeader = c.req.header("x-payment");
    const payment = extractPaymentHeader(paymentHeader);

    // Calculate cost based on data size
    const dataSize = Buffer.byteLength(body.data, "utf8");
    const cost = calculateStorageCost(dataSize);
    const requirements = buildPaymentRequirements(config, cost, "/agent/store");

    // No payment header → return 402 with requirements
    if (!payment) {
      return c.json(requirements, 402);
    }

    // Verify payment (skip if mock mode)
    if (!config.x402.mock) {
      const verifyResult = await x402Client.verifyPayment(
        payment,
        requirements,
      );

      if (!verifyResult.valid) {
        return c.json(
          { error: "payment_invalid", reason: verifyResult.reason },
          400,
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
      auditService.log({
        agentId: body.agentId,
        action: "store",
        details: { success: false, error: result.error },
      });
      return c.json({ error: "storage_failed", reason: result.error }, 500);
    }

    // Sync vault to agent's storage manifest
    identityService.addToManifest(body.agentId, {
      vaultId: result.vaultId,
      pieceCid: result.pieceCid,
      type: body.metadata?.type || "other",
      storedAt: result.storedAt,
      size: result.size ?? 0,
      pdpStatus: result.pdpStatus,
    });

    // Append audit entry
    auditService.log({
      agentId: body.agentId,
      action: "store",
      details: {
        vaultId: result.vaultId,
        pieceCid: result.pieceCid,
        size: result.size,
        paymentId: result.paymentId,
        pdpStatus: result.pdpStatus,
        success: true,
      },
    });

    // Async: settle payment with retry + tracking
    if (!config.x402.mock) {
      const paymentId = payment.nonce;
      settlementTracker.track(paymentId, body.agentId, "/agent/store");
      withRetry(() => x402Client.settlePayment(payment, requirements))
        .then(() => {
          settlementTracker.updateStatus(paymentId, "settled");
          auditService.log({
            agentId: body.agentId,
            action: "settle",
            details: { paymentId, success: true },
          });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Settlement failed";
          settlementTracker.updateStatus(paymentId, "failed", message);
          auditService.log({
            agentId: body.agentId,
            action: "settle",
            details: { paymentId, success: false, error: message },
          });
          logger.error({ paymentId, err }, "Settlement failed after retries");
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
  });

  /**
   * GET /agent/retrieve/:id
   * Retrieve data by vaultId or pieceCid with x402 payment
   */
  router.get("/retrieve/:id", async (c) => {
    const id = c.req.param("id");
    const paymentHeader = c.req.header("x-payment");
    const payment = extractPaymentHeader(paymentHeader);

    // First, check if vault exists to get size for pricing + agentId for rate limiting
    const vault = storageService.getVault(id);

    if (!vault) {
      return c.json(
        { error: "not_found", reason: `Vault not found: ${id}` },
        404,
      );
    }

    // Per-agent rate limit check
    const rl = rateLimiter.check(vault.agentId);
    if (!rl.allowed) {
      auditService.log({
        agentId: vault.agentId,
        action: "retrieve",
        details: {
          vaultId: vault.vaultId,
          success: false,
          error: "rate_limit_exceeded",
        },
      });
      return c.json(
        { error: "rate_limit_exceeded", resetAt: rl.resetAt, remaining: 0 },
        429,
        {
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      );
    }

    // Calculate cost based on stored data size
    const cost = calculateStorageCost(vault.size);
    const requirements = buildPaymentRequirements(
      config,
      cost,
      `/agent/retrieve/${id}`,
    );

    // No payment header → return 402 with requirements
    if (!payment) {
      return c.json(requirements, 402);
    }

    // Verify payment (skip if mock mode)
    if (!config.x402.mock) {
      const verifyResult = await x402Client.verifyPayment(
        payment,
        requirements,
      );

      if (!verifyResult.valid) {
        return c.json(
          { error: "payment_invalid", reason: verifyResult.reason },
          400,
        );
      }
    }

    // Retrieve the data
    const result = await storageService.retrieve(id);

    if (!result.success) {
      auditService.log({
        agentId: vault.agentId,
        action: "retrieve",
        details: {
          vaultId: vault.vaultId,
          pieceCid: vault.pieceCid,
          success: false,
          error: result.error,
        },
      });
      return c.json({ error: "retrieval_failed", reason: result.error }, 500);
    }

    // Increment agent's retrieval count in manifest
    identityService.recordRetrieve(vault.agentId);

    // Append audit entry
    auditService.log({
      agentId: vault.agentId,
      action: "retrieve",
      details: {
        vaultId: vault.vaultId,
        pieceCid: vault.pieceCid,
        size: vault.size,
        pdpStatus: result.pdpStatus,
        success: true,
      },
    });

    // Async: settle payment with retry + tracking
    if (!config.x402.mock) {
      const paymentId = payment.nonce;
      settlementTracker.track(
        paymentId,
        vault.agentId,
        `/agent/retrieve/${id}`,
      );
      withRetry(() => x402Client.settlePayment(payment, requirements))
        .then(() => {
          settlementTracker.updateStatus(paymentId, "settled");
          auditService.log({
            agentId: vault.agentId,
            action: "settle",
            details: { paymentId, success: true },
          });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Settlement failed";
          settlementTracker.updateStatus(paymentId, "failed", message);
          auditService.log({
            agentId: vault.agentId,
            action: "settle",
            details: { paymentId, success: false, error: message },
          });
          logger.error({ paymentId, err }, "Settlement failed after retries");
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
  router.get("/verify/:pieceCid", async (c) => {
    const pieceCid = c.req.param("pieceCid");

    const result = await storageService.verify(pieceCid);

    // Update agent's reputation and manifest PDP status
    if (result.exists && result.storedBy) {
      identityService.updateManifestPDPStatus(
        result.storedBy,
        pieceCid,
        result.pdpVerified ? "verified" : "pending",
      );

      auditService.log({
        agentId: result.storedBy,
        action: "verify",
        details: {
          pieceCid,
          vaultId: result.vaultId,
          pdpStatus: result.pdpVerified ? "verified" : "pending",
          success: result.pdpVerified,
        },
      });
    }

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
  router.get("/vaults/:agentId", async (c) => {
    const agentId = c.req.param("agentId");

    const vaults = storageService.getVaultsForAgent(agentId);

    // Map to summary format (exclude full data)
    const vaultSummaries = vaults.map((v: VaultEntry) => ({
      vaultId: v.vaultId,
      pieceCid: v.pieceCid,
      type: v.metadata?.type || "other",
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

  /**
   * GET /agent/audit/:agentId
   * Return full audit trail for an agent (FREE - no payment required)
   */
  router.get("/audit/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const trail = auditService.getForAgent(agentId);
    return c.json(trail);
  });

  /**
   * POST /agent/register
   * Register a new agent (ERC-8004).
   */
  router.post(
    "/register",
    zValidator("json", RegisterAgentSchema),
    async (c) => {
      const body = c.req.valid("json");

      // persisting the identity record so we have a real cardCid.
      let cardPieceCid = "mock-card-cid";
      if (config.identity.enabled) {
        const cardUpload = await storageService.store({
          // Use the Ethereum address as the vault owner for the card upload;
          // the proper agentId doesn't exist yet at this point.
          agentId: body.address,
          data: JSON.stringify(body.agentCard),
          metadata: {
            type: "agent_card",
            description: `Agent card for ${body.agentCard.name}`,
          },
        });

        if (!cardUpload.success) {
          return c.json(
            {
              error: "card_upload_failed",
              reason: cardUpload.error ?? "Storage error",
            },
            500,
          );
        }

        cardPieceCid = cardUpload.pieceCid;
      }

      let result: { agent: import("../types/agent.js").Agent; isNew: boolean };

      try {
        result = await identityService.registerAgent(body, cardPieceCid);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Registration failed";
        return c.json({ error: "registration_failed", reason: message }, 400);
      }

      const { agent, isNew } = result;

      // Append audit entry (use address as agentId pre-registration for idempotent re-reg)
      auditService.log({
        agentId: agent.agentId,
        action: "register",
        details: { success: true },
      });

      return c.json(
        {
          success: true,
          isNew,
          agentId: agent.agentId,
          address: agent.address,
          agentCard: agent.agentCard,
          cardCid: agent.cardPieceCid,
          registeredAt: agent.registeredAt,
          storageManifest: agent.storageManifest,
          reputation: agent.reputation,
        },
        isNew ? 201 : 200,
      );
    },
  );

  /**
   * POST /agent/export-registry
   * Snapshot the full agent registry to Filecoin and return the CID.
   * Store the returned CID as IDENTITY_REGISTRY_ADDRESS to restore state on restart.
   * Only works when IDENTITY_ENABLED=true and STORAGE_PROVIDER=synapse.
   */
  router.post("/export-registry", async (c) => {
    if (!config.identity.enabled) {
      return c.json(
        {
          error: "identity_not_enabled",
          reason: "Set IDENTITY_ENABLED=true to use this endpoint",
        },
        503,
      );
    }

    if (!identityService.supportsExport()) {
      return c.json(
        {
          error: "not_supported",
          reason: "Mock identity provider does not support registry export",
        },
        501,
      );
    }

    try {
      const cid = await identityService.exportRegistry();
      const { totalAgents } = identityService.getStats();
      return c.json({
        success: true,
        cid,
        exportedAt: Date.now(),
        agentCount: totalAgents,
        hint: `Set IDENTITY_REGISTRY_ADDRESS=${cid} to restore this registry on next start`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      logger.error({ err }, "Registry export failed");
      return c.json({ error: "export_failed", reason: message }, 500);
    }
  });

  /**
   * GET /agent/settlements
   * List all tracked settlements, optionally filtered by ?status=pending|settled|failed.
   * Sorted by lastAttemptAt descending (most recent first).
   * FREE — no payment required (operational endpoint).
   */
  router.get("/settlements", (c) => {
    const rawStatus = c.req.query("status");
    const validStatuses: SettlementStatus[] = ["pending", "settled", "failed"];

    if (rawStatus && !validStatuses.includes(rawStatus as SettlementStatus)) {
      return c.json(
        {
          error: "invalid_filter",
          reason: `status must be one of: ${validStatuses.join(", ")}`,
        },
        400,
      );
    }

    const filter = rawStatus
      ? { status: rawStatus as SettlementStatus }
      : undefined;
    const records = settlementTracker.getAll(filter);
    const stats = settlementTracker.getStats();

    return c.json({ stats, records, total: records.length });
  });

  /**
   * GET /agent/settlements/:paymentId
   * Look up a single settlement record by paymentId (the x402 payment nonce).
   * FREE — no payment required.
   */
  router.get("/settlements/:paymentId", (c) => {
    const paymentId = c.req.param("paymentId");
    const record = settlementTracker.getByPaymentId(paymentId);

    if (!record) {
      return c.json(
        {
          error: "not_found",
          reason: `No settlement found for paymentId: ${paymentId}`,
        },
        404,
      );
    }

    return c.json(record);
  });

  /**
   * GET /agent/:agentId
   * Get agent info including card, storage manifest and reputation.
   */
  router.get("/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const agent = identityService.getById(agentId);

    if (!agent) {
      return c.json({ found: false, error: "Agent not found" }, 404);
    }

    return c.json({
      found: true,
      agent: {
        agentId: agent.agentId,
        address: agent.address,
        agentCard: agent.agentCard,
        // Spec uses 'cardCid' (ERC-8004 naming); internally stored as cardPieceCid
        cardCid: agent.cardPieceCid,
        registeredAt: agent.registeredAt,
        storageManifest: agent.storageManifest.map((e) => ({
          vaultId: e.vaultId,
          pieceCid: e.pieceCid,
          type: e.type,
          storedAt: e.storedAt,
          size: e.size,
          pdpStatus: e.pdpStatus,
          pdpVerifiedAt: e.pdpVerifiedAt,
        })),
        reputation: agent.reputation,
      },
    });
  });

  return router;
}
