import { randomBytes, createHash } from 'node:crypto';
import { verifyMessage } from 'viem';
import type { RegisterAgentRequest, Agent, StorageManifestEntry } from '../../types/agent.js';
import type { PDPStatus } from '../../types/storage.js';
import type { IIdentityProvider } from './interface.js';

/**
 * The canonical message agents must sign when registering.
 * Bind message to the address to prevent cross-address replay.
 */
export function registrationMessage(address: string): string {
  return `AgentVault registration: ${address.toLowerCase()}`;
}

/**
 * MockIdentityProvider — fully in-memory identity backend.
 *
 * Used for development and testing.  Swap for a Synapse-backed provider
 */
export class MockIdentityProvider implements IIdentityProvider {
  /** agentId → Agent record */
  private agents = new Map<string, Agent>();

  /** normalised address (lowercase) → agentId */
  private addressIndex = new Map<string, string>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid = 'mock-card-cid',
  ): Promise<{ agent: Agent; isNew: boolean }> {
    const normalised = req.address.toLowerCase();

    // Return existing record if address already registered
    const existingId = this.addressIndex.get(normalised);
    if (existingId) {
      return { agent: this.agents.get(existingId)!, isNew: false };
    }

    // Verify EIP-191 signature — recover signer and confirm it matches address
    const message = registrationMessage(req.address);
    const valid = await verifyMessage({
      address: req.address as `0x${string}`,
      message,
      signature: req.signature as `0x${string}`,
    });
    if (!valid) {
      throw new Error(
        'Signature verification failed — recovered address does not match claimed address',
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

    if (pdpStatus === 'verified') {
      entry.pdpVerifiedAt = Date.now();
      agent.reputation.verificationScore = Math.min(
        100,
        agent.reputation.verificationScore + 1,
      );
    } else if (pdpStatus === 'failed') {
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateAgentId(address: string): string {
  const salt = randomBytes(4).toString('hex');
  const hash = createHash('sha256')
    .update(address.toLowerCase() + salt)
    .digest('hex')
    .slice(0, 8);
  return `agent_${hash}`;
}

