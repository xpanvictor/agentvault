import type { Config } from "../../types/config.js";
import type {
  RegisterAgentRequest,
  Agent,
  StorageManifestEntry,
} from "../../types/agent.js";
import type { PDPStatus } from "../../types/storage.js";
import { MockIdentityProvider } from "./mock.js";
import type { IIdentityProvider } from "./interface.js";
export type { IIdentityProvider } from "./interface.js";

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

  async registerAgent(
    req: RegisterAgentRequest,
    cardPieceCid?: string,
  ): Promise<{ agent: Agent; isNew: boolean }> {
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

  /**
   * Export the full agent registry to Filecoin and return the CID.
   * Only supported by SynapseIdentityProvider — throws for mock provider.
   */
  async exportRegistry(): Promise<string> {
    const provider = this.provider as {
      exportRegistry?: () => Promise<string>;
    };
    if (typeof provider.exportRegistry !== "function") {
      throw new Error(
        "Current identity provider does not support registry export",
      );
    }
    return provider.exportRegistry();
  }

  /** Returns true when the underlying provider supports exportRegistry(). */
  supportsExport(): boolean {
    const provider = this.provider as { exportRegistry?: unknown };
    return typeof provider.exportRegistry === "function";
  }
}
