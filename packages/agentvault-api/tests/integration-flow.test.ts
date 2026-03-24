import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  AgentVaultClient,
  AgentVaultError,
  ViemX402PaymentSigner,
  createSignedRegisterAgentRequest,
} from "../src/index.js";
import type {
  AgentCard,
  ListSettlementsResponse,
  RegisterAgentResponse,
  RetrieveResponse,
  StoreResponse,
  StoreRequest,
} from "../src/index.js";

const baseUrl = process.env.BaseAgentVaultUrl ?? "http://localhost:3500";
const privateKey =
  (process.env.AGENTVAULT_TEST_PRIVATE_KEY as `0x${string}` | undefined) ??
  (process.env.STORAGE_PRIVATE_KEY as `0x${string}` | undefined);
const explicitStorePaymentHeader =
  process.env.AGENTVAULT_TEST_XPAYMENT_HEADER_STORE ??
  process.env.AGENTVAULT_TEST_XPAYMENT_HEADER;
const explicitRetrievePaymentHeader =
  process.env.AGENTVAULT_TEST_XPAYMENT_HEADER_RETRIEVE;
const envTokenName = process.env.AGENTVAULT_TEST_TOKEN_NAME;
const envTokenVersion = process.env.AGENTVAULT_TEST_TOKEN_VERSION;
const demoLogs = process.env.AGENTVAULT_TEST_DEMO_LOGS !== "false";
const signerAddress = privateKey
  ? privateKeyToAccount(privateKey).address
  : undefined;
const signerProfile = {
  tokenName: envTokenName ?? "USDFC",
  tokenVersion: envTokenVersion ?? "1",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logScene(title: string, payload?: Record<string, unknown>) {
  if (!demoLogs) return;
  console.log(`\n========== ${title} ==========`);
  if (payload) {
    console.log(JSON.stringify(payload, null, 2));
  }
}

function short(value: string, head = 12, tail = 8): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

async function storeWithOptionalHeaderFallback(
  client: AgentVaultClient,
  request: StoreRequest,
  header?: string,
): Promise<StoreResponse> {
  if (!header) {
    return client.store(request);
  }

  try {
    return await client.store(request, header);
  } catch (err) {
    if (err instanceof AgentVaultError && err.status === 402) {
      // Header may be stale/invalid/non-JSON; retry with signer-managed flow.
      return client.store(request);
    }
    throw err;
  }
}

async function retrieveWithOptionalHeaderFallback(
  client: AgentVaultClient,
  id: string,
  header?: string,
): Promise<RetrieveResponse> {
  if (!header) {
    return client.retrieve(id);
  }

  try {
    return await client.retrieve(id, header);
  } catch (err) {
    if (err instanceof AgentVaultError && err.status === 402) {
      // Header may be stale/invalid/non-JSON; retry with signer-managed flow.
      return client.retrieve(id);
    }
    throw err;
  }
}

async function eventually<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: {
    retries?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, value: T) => void;
  } = {},
): Promise<T> {
  const retries = options.retries ?? 12;
  const intervalMs = options.intervalMs ?? 500;

  let lastValue: T | undefined;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    lastValue = await fn();
    options.onAttempt?.(attempt + 1, lastValue);
    if (predicate(lastValue)) {
      return lastValue;
    }
    await sleep(intervalMs);
  }

  return lastValue as T;
}

describe("AgentVaultClient live integration flow", () => {
  const client = new AgentVaultClient(
    privateKey
      ? {
          baseUrl,
          paymentSigner: new ViemX402PaymentSigner(privateKey, signerProfile),
        }
      : {
          baseUrl,
        },
  );

  it("runs end-to-end register/store/retrieve/verify/audit/settlements flow", async () => {
    logScene("Scene 0: Test configuration", {
      baseUrl,
      signerAddress,
      signerDomain: `${signerProfile.tokenName}/${signerProfile.tokenVersion}`,
      explicitStoreHeader: Boolean(explicitStorePaymentHeader),
      explicitRetrieveHeader: Boolean(explicitRetrievePaymentHeader),
    });

    const health = await client.getHealth();
    expect(health.status).toBe("ok");
    logScene("Scene 1: Health check", {
      status: health.status,
      storageProvider: health.storage.provider,
      x402: health.x402,
    });

    const root = await client.getRoot();
    expect(root.service).toBe("AgentVault");
    logScene("Scene 2: Root service info", {
      service: root.service,
      version: root.version,
      facilitator: root.facilitator.address,
      endpoints: root.endpoints,
    });

    if (!privateKey) {
      throw new Error(
        "No private key found for integration test registration. Set AGENTVAULT_TEST_PRIVATE_KEY or STORAGE_PRIVATE_KEY in .env.",
      );
    }

    const card: AgentCard = {
      name: `AgentVaultApiTest-${Date.now()}`,
      version: "1.0.0",
      x402Support: true,
      capabilities: ["integration_test"],
      protocols: ["x402", "mcp"],
    };

    const payload = await createSignedRegisterAgentRequest(privateKey, card);
    logScene("Scene 3: Registration payload signed", {
      address: payload.address,
      cardName: card.name,
    });

    const registered: RegisterAgentResponse = await client.registerAgent(payload);

    expect(registered.success).toBe(true);
    expect(registered.agentId.startsWith("agent_")).toBe(true);
    logScene("Scene 4: Agent registered", {
      agentId: registered.agentId,
      address: registered.address,
      cardCid: short(registered.cardCid),
      isNew: registered.isNew,
    });

    const agent = await client.getAgent(registered.agentId);
    expect(agent.found).toBe(true);
    expect(agent.agent?.address.toLowerCase()).toBe(registered.address.toLowerCase());
    logScene("Scene 5: Agent lookup", {
      found: agent.found,
      manifestEntries: agent.agent?.storageManifest.length ?? 0,
      reputation: agent.agent?.reputation,
    });

    let stored: StoreResponse | undefined;
    const storeRequest: StoreRequest = {
      agentId: registered.agentId,
      data: JSON.stringify({
        type: "integration_flow",
        at: new Date().toISOString(),
        random: Math.random().toString(36).slice(2),
      }),
      metadata: {
        type: "decision_log",
        description: "agentvault-api integration test",
        tags: ["integration", "package", "live"],
      },
    };

    const storePaymentHeader = health.x402.mock
      ? "mock-payment-header"
      : explicitStorePaymentHeader;
    logScene("Scene 6: Store request", {
      agentId: storeRequest.agentId,
      metadata: storeRequest.metadata,
      paymentMode: storePaymentHeader
        ? health.x402.mock
          ? "mock header"
          : "explicit header"
        : "auto signer",
    });

    if (storePaymentHeader) {
      stored = await storeWithOptionalHeaderFallback(
        client,
        storeRequest,
        storePaymentHeader,
      );
    } else {
      let storeError: unknown;
      try {
        const signerClient = new AgentVaultClient({
          baseUrl,
          paymentSigner: new ViemX402PaymentSigner(privateKey, signerProfile),
        });
        stored = await signerClient.store(storeRequest);
      } catch (err) {
        storeError = err;
      }

      if (!stored) {
        if (
          storeError instanceof AgentVaultError &&
          String(storeError.message).includes("validAfter")
        ) {
          throw new Error(
            "x402 verification rejected validAfter/validBefore types. This is a backend/x402 contract mismatch. " +
              "Set X402_MOCK=true for local flow tests, or align payment field types between AgentVault and FIL-x402.",
          );
        }
        if (
          storeError instanceof AgentVaultError &&
          String(storeError.message).includes("invalid_signature")
        ) {
          throw new Error(
            "x402 invalid_signature with the configured USDFC signer profile. Set AGENTVAULT_TEST_PRIVATE_KEY to a valid funded key, " +
              "or set AGENTVAULT_TEST_XPAYMENT_HEADER with a known-good signed payment. " +
              `Signer address used: ${signerAddress ?? "<none>"}. ` +
              `Signer domain: ${signerProfile.tokenName}/${signerProfile.tokenVersion}. ` +
              "You can configure these in packages/agentvault-api/.env (see .env.example).",
          );
        }
        throw storeError;
      }
    }

    if (!stored) {
      throw new Error("Store step did not produce a result");
    }

    expect(stored.success).toBe(true);
    expect(stored.vaultId.startsWith("vault_")).toBe(true);
    expect(stored.pieceCid.length).toBeGreaterThan(10);
    logScene("Scene 7: Store completed", {
      vaultId: stored.vaultId,
      pieceCid: short(stored.pieceCid),
      size: stored.size,
      pdpStatus: stored.pdpStatus,
      paymentId: stored.paymentId,
    });

    // Important: a signed x-payment nonce is one-time use.
    // Do not reuse AGENTVAULT_TEST_XPAYMENT_HEADER_STORE for retrieve.
    const retrievePayment = health.x402.mock
      ? "mock-payment-header"
      : explicitRetrievePaymentHeader;
    logScene("Scene 8: Retrieve request", {
      id: stored.vaultId,
      paymentMode: retrievePayment
        ? health.x402.mock
          ? "mock header"
          : "explicit header"
        : "auto signer",
    });

    const retrieved: RetrieveResponse = await retrieveWithOptionalHeaderFallback(
      client,
      stored.vaultId,
      retrievePayment,
    );

    expect(retrieved.success).toBe(true);
    expect(retrieved.vaultId).toBe(stored.vaultId);
    expect(retrieved.pieceCid).toBe(stored.pieceCid);
    expect(retrieved.data).toContain("integration_flow");
    logScene("Scene 9: Retrieve completed", {
      vaultId: retrieved.vaultId,
      pieceCid: short(retrieved.pieceCid),
      pdpStatus: retrieved.pdpStatus,
      dataPreview: retrieved.data?.slice(0, 120),
    });

    const verify = await client.verify(stored.pieceCid);
    expect(verify.exists).toBe(true);
    expect(verify.vaultId).toBe(stored.vaultId);
    logScene("Scene 10: Verify response", {
      exists: verify.exists,
      vaultId: verify.vaultId,
      pdpVerified: verify.pdpVerified,
      pdpVerifiedAt: verify.pdpVerifiedAt,
    });

    const vaults = await client.listVaults(registered.agentId);
    expect(vaults.total).toBeGreaterThan(0);
    expect(vaults.vaults.some((v) => v.vaultId === stored.vaultId)).toBe(true);
    logScene("Scene 11: Vault listing", {
      total: vaults.total,
      containsStoredVault: vaults.vaults.some((v) => v.vaultId === stored.vaultId),
    });

    const audit = await client.getAuditTrail(registered.agentId);
    const actions = audit.entries.map((entry) => entry.action);
    expect(actions).toContain("register");
    expect(actions).toContain("store");
    expect(actions).toContain("retrieve");
    logScene("Scene 12: Audit trail", {
      totalEntries: audit.entries.length,
      actions,
      summary: audit.summary,
    });

    if (stored.paymentId) {
      const settlements = await eventually<ListSettlementsResponse>(
        async () => client.listSettlements(),
        (data) => data.records.some((r) => r.paymentId === stored.paymentId),
        {
          retries: 20,
          intervalMs: 500,
          onAttempt: (attempt, data) => {
            logScene(`Scene 13: Settlement polling attempt ${attempt}`, {
              records: data.records.length,
            });
          },
        },
      );

      const record = settlements.records.find((r) => r.paymentId === stored.paymentId);
      expect(record).toBeDefined();

      if (record) {
        const byId = await client.getSettlement(record.paymentId);
        expect(byId.paymentId).toBe(record.paymentId);
        expect(byId.agentId).toBe(registered.agentId);
        expect(["pending", "settled", "failed"]).toContain(byId.status);
        logScene("Scene 14: Settlement lookup", {
          paymentId: byId.paymentId,
          status: byId.status,
          attempts: byId.attempts,
          resource: byId.resource,
          error: byId.error,
        });
      }
    }

    logScene("Scene 15: E2E completed", {
      agentId: registered.agentId,
      vaultId: stored.vaultId,
      pieceCid: short(stored.pieceCid),
    });
  });
});
