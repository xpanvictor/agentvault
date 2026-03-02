import type { Config } from '../../types/config.js';
import type {
  RegisterAgentRequest,
  Agent,
  StorageManifestEntry,
} from '../../types/agent.js';
import type { PDPStatus } from '../../types/storage.js';
import { MockIdentityProvider } from './mock.js';
import type { IIdentityProvider } from './interface.js';
export type { IIdentityProvider } from './interface.js';

/**
 * IdentityService — thin orchestration layer that delegates to a provider.
 *
 * Swap the provider by swapping the constructor argument; all callers
 * (routes, other services) depend only on this class.
 */
export class IdentityService {
  private readonly provider: IIdentityProvider;

  constructor(_config: Config, provider?: IIdentityProvider) {
    // Default to the in-memory mock; swap in SynapseIdentityProvider later.
    this.provider = provider ?? new MockIdentityProvider();
  }

  registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid?: string,
  ): { agent: Agent; isNew: boolean } {
    return this.provider.registerAgent(req, cardPieceCid);
  }

  getById(agentId: string): Agent | undefined {
    return this.provider.getById(agentId);
  }

  getByAddress(address: string): Agent | undefined {
    return this.provider.getByAddress(address);
  }

  addToManifest(agentId: string, entry: StorageManifestEntry): void {
    this.provider.addToManifest(agentId, entry);
  }

  updateManifestPDPStatus(
    agentId: string,
    pieceCid: string,
    pdpStatus: PDPStatus,
  ): void {
    this.provider.updateManifestPDPStatus(agentId, pieceCid, pdpStatus);
  }

  recordRetrieve(agentId: string): void {
    this.provider.recordRetrieve(agentId);
  }

  getStats(): { totalAgents: number } {
    return this.provider.getStats();
  }
}
