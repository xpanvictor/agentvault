import { verifyMessage } from "viem";
import type { Synapse } from "@filoz/synapse-sdk";
import { logger } from "../../utils/logger.js";
import type {
  RegisterAgentRequest,
  Agent,
  StorageManifestEntry,
} from "../../types/agent.js";
import type { PDPStatus } from "../../types/storage.js";
import type { IIdentityProvider } from "./interface.js";
import { registrationMessage, generateAgentId } from "./mock.js";

interface RegistrySnapshot {
  type: "agent_registry";
  version: string;
  exportedAt: number;
  agents: Agent[];
}

/**
 * SynapseIdentityProvider — Filecoin-backed agent identity.
 *
 * Keeps an in-memory index for fast lookups. On every registration the
 * agent record is asynchronously pinned to Filecoin.
 *
 * Persistence across restarts:
 *   1. Call `exportRegistry()` to snapshot the full registry to Filecoin.
 *      Store the returned CID as IDENTITY_REGISTRY_CID.
 *   2. On startup, pass that CID to `SynapseIdentityProvider.fromRegistryCid()`
 *      to restore the previous state before opening the server.
 */
export class SynapseIdentityProvider implements IIdentityProvider {
  /** agentId → Agent record */
  private readonly agents = new Map<string, Agent>();

  /** normalised address → agentId */
  private readonly addressIndex = new Map<string, string>();

  constructor(private readonly synapse: Synapse) {}

  // ---------------------------------------------------------------------------
  // Static factory — restore from Filecoin snapshot
  // ---------------------------------------------------------------------------

  /**
   * Download and deserialise a previously exported registry from Filecoin.
   * Returns an empty provider when the CID is not found (first run).
   */
  static async fromRegistryCid(
    synapse: Synapse,
    registryCid: string,
  ): Promise<SynapseIdentityProvider> {
    const provider = new SynapseIdentityProvider(synapse);

    const bytes = await synapse.storage
      .download({ pieceCid: registryCid })
      .catch(() => null);
    if (!bytes) {
      logger.warn(
        { registryCid },
        "Registry CID not found on Filecoin — starting with empty registry",
      );
      return provider;
    }

    const text = new TextDecoder().decode(bytes);
    const snapshot = JSON.parse(text) as RegistrySnapshot;

    if (snapshot.type !== "agent_registry") {
      throw new Error(
        `Invalid registry CID — expected type "agent_registry", got "${snapshot.type}"`,
      );
    }

    for (const agent of snapshot.agents) {
      provider.agents.set(agent.agentId, agent);
      provider.addressIndex.set(agent.address.toLowerCase(), agent.agentId);
    }

    logger.info(
      { registryCid, count: snapshot.agents.length },
      "Restored agents from Filecoin registry",
    );
    return provider;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid = "mock-card-cid",
  ): Promise<{ agent: Agent; isNew: boolean }> {
    const normalised = req.address.toLowerCase();
    logger.info("cask");

    // Return existing record if address already registered
    const existingId = this.addressIndex.get(normalised);
    if (existingId) {
      return { agent: this.agents.get(existingId)!, isNew: false };
    }

    // Verify EIP-191 signature
    const message = registrationMessage(req.address);
    logger.info(
      { message },
      "Verifying registration signature for address:",
      req.address,
    );
    console.log("Verifying signature for message:", message);
    const valid = await verifyMessage({
      address: req.address as `0x${string}`,
      message,
      signature: req.signature as `0x${string}`,
    });
    if (!valid) {
      throw new Error(
        "Signature verification failed — recovered address does not match claimed address",
      );
    }

    const agentId = generateAgentId(req.address);
    const now = Date.now();

    const agent: Agent = {
      agentId,
      address: req.address,
      agentCard: req.agentCard,
      cardPieceCid,
      registeredAt: now,
      storageManifest: [],
      reputation: {
        totalStored: 0,
        totalRetrieved: 0,
        verificationScore: 100,
      },
    };

    this.agents.set(agentId, agent);
    this.addressIndex.set(normalised, agentId);

    // Pin the agent record to Filecoin (non-blocking — registration succeeds regardless)
    this.persistAgent(agent).catch((err) => {
      logger.error({ agentId, err }, "Failed to pin agent to Filecoin");
    });

    return { agent, isNew: true };
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  getById(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getByAddress(address: string): Agent | undefined {
    const id = this.addressIndex.get(address.toLowerCase());
    return id ? this.agents.get(id) : undefined;
  }

  // ---------------------------------------------------------------------------
  // Storage manifest
  // ---------------------------------------------------------------------------

  addToManifest(agentId: string, entry: StorageManifestEntry): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.storageManifest.push(entry);
    agent.reputation.totalStored += 1;
  }

  updateManifestPDPStatus(
    agentId: string,
    pieceCid: string,
    pdpStatus: PDPStatus,
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const entry = agent.storageManifest.find((e) => e.pieceCid === pieceCid);
    if (!entry) return;

    entry.pdpStatus = pdpStatus;

    if (pdpStatus === "verified") {
      entry.pdpVerifiedAt = Date.now();
      agent.reputation.verificationScore = Math.min(
        100,
        agent.reputation.verificationScore + 1,
      );
    } else if (pdpStatus === "failed") {
      agent.reputation.verificationScore = Math.max(
        0,
        agent.reputation.verificationScore - 20,
      );
    }
  }

  recordRetrieve(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.reputation.totalRetrieved += 1;
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): { totalAgents: number } {
    return { totalAgents: this.agents.size };
  }

  // ---------------------------------------------------------------------------
  // Filecoin persistence
  // ---------------------------------------------------------------------------

  /**
   * Pin a single agent record to Filecoin.
   * Returns the resulting pieceCID (useful for bookkeeping).
   */
  private async persistAgent(agent: Agent): Promise<string> {
    const payload = JSON.stringify({
      type: "agent_record",
      version: "1.0.0",
      ...agent,
    });
    const file = new TextEncoder().encode(payload);
    const context = await this.synapse.storage.createContext({
      metadata: { source: "AgentVault-Identity" },
    });
    const { pieceCid } = await context.upload(file, {
      metadata: { agentId: agent.agentId, type: "agent_record" },
    });
    return pieceCid.toString();
  }

  /**
   * Snapshot the full agent registry to Filecoin.
   *
   * Store the returned CID as IDENTITY_REGISTRY_CID so the server can
   * restore state on the next boot via `fromRegistryCid()`.
   */
  async exportRegistry(): Promise<string> {
    const snapshot: RegistrySnapshot = {
      type: "agent_registry",
      version: "1.0.0",
      exportedAt: Date.now(),
      agents: Array.from(this.agents.values()),
    };

    const payload = JSON.stringify(snapshot);
    const file = new TextEncoder().encode(payload);
    const context = await this.synapse.storage.createContext({
      metadata: { source: "AgentVault-Identity" },
    });
    const { pieceCid } = await context.upload(file, {
      metadata: { type: "agent_registry" },
    });

    const cid = pieceCid.toString();
    logger.info(
      { cid, count: snapshot.agents.length },
      "Exported agents to Filecoin registry",
    );
    return cid;
  }
}
