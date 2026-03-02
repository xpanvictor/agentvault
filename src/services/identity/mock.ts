import { randomBytes, createHash } from 'node:crypto';
import type { RegisterAgentRequest, Agent, StorageManifestEntry } from '../../types/agent.js';
import type { PDPStatus } from '../../types/storage.js';
import type { IIdentityProvider } from './interface.js';

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

  registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid = 'mock-card-cid',
  ): { agent: Agent; isNew: boolean } {
    const normalised = req.address.toLowerCase();

    // Return existing record if address already registered
    const existingId = this.addressIndex.get(normalised);
    if (existingId) {
      return { agent: this.agents.get(existingId)!, isNew: false };
    }

    // Basic EIP-191 signature format check
    // TODO(production): full ecrecover via viem `verifyMessage()`
    validateSignatureFormat(req.signature);

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

function generateAgentId(address: string): string {
  const salt = randomBytes(4).toString('hex');
  const hash = createHash('sha256')
    .update(address.toLowerCase() + salt)
    .digest('hex')
    .slice(0, 8);
  return `agent_${hash}`;
}

function validateSignatureFormat(sig: string): void {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    throw new Error(
      'Invalid signature format — expected 0x-prefixed 65-byte hex string',
    );
  }
}
