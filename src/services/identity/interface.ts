import type { RegisterAgentRequest, Agent, StorageManifestEntry } from '../../types/agent.js';
import type { PDPStatus } from '../../types/storage.js';

/**
 * IIdentityProvider — contract for all identity backends.
 *
 * Current implementation: MockIdentityProvider (in-memory).
 * Planned: SynapseIdentityProvider — pins agent cards to Filecoin.
 */
export interface IIdentityProvider {
  /**
   * Register a new agent.  Returns the existing record when the address is
   * already known (idempotent).
   */
  registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid?: string,
  ): Promise<{ agent: Agent; isNew: boolean }>;

  /** Look up by generated agentId. */
  getById(agentId: string): Agent | undefined;

  /** Look up by Ethereum address (case-insensitive). */
  getByAddress(address: string): Agent | undefined;

  /**
   * Append a vault entry to the agent's storage manifest and bump
   * `reputation.totalStored`.
   */
  addToManifest(agentId: string, entry: StorageManifestEntry): void;

  /**
   * Update the PDP status of a manifest entry.
   * Adjusts reputation score (+1 verified, -20 failed).
   */
  updateManifestPDPStatus(
    agentId: string,
    pieceCid: string,
    pdpStatus: PDPStatus,
  ): void;

  /** Increment `reputation.totalRetrieved`. */
  recordRetrieve(agentId: string): void;

  getStats(): { totalAgents: number };
}
