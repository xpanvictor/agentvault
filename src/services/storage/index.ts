import { createHash, randomUUID } from 'crypto';
import type { Config } from '../../types/config.js';
import type {
  IStorageProvider,
  VaultEntry,
  PDPStatus,
  StoreResponse,
  RetrieveResponse,
  PDPVerifyResponse,
} from '../../types/storage.js';
import { MockStorageProvider } from './mock.js';
import { VaultIndex } from './vault-index.js';

/**
 * Store request parameters (internal)
 */
export interface StoreParams {
  agentId: string;
  data: string;
  metadata?: {
    type?: string;
    description?: string;
    tags?: string[];
  };
  paymentId?: string;
}

/**
 * StorageService
 *
 * Main orchestration layer for storage operations.
 * Wraps the storage provider and vault index.
 *
 * Routes call this service, which handles:
 * - Provider selection (mock vs synapse)
 * - VaultEntry creation and indexing
 * - Data hashing for integrity
 * - VaultId generation
 */
export class StorageService {
  private provider: IStorageProvider;
  private index: VaultIndex;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.index = new VaultIndex();

    // Select provider based on config
    if (config.storage.provider === 'synapse') {
      // TODO: Implement SynapseStorageProvider in Issue #11
      console.warn('Synapse provider not yet implemented, falling back to mock');
      this.provider = new MockStorageProvider();
    } else {
      this.provider = new MockStorageProvider();
    }

    console.log(`StorageService initialized with provider: ${config.storage.provider}`);
  }

  /**
   * Generate a unique vault ID
   */
  private generateVaultId(): string {
    const uuid = randomUUID().replace(/-/g, '').substring(0, 12);
    return `vault_${uuid}`;
  }

  /**
   * Compute SHA256 hash of data for integrity checking
   */
  private computeDataHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Store data and create a vault entry
   */
  async store(params: StoreParams): Promise<StoreResponse> {
    const { agentId, data, metadata, paymentId } = params;

    // Upload to storage provider
    const uploadResult = await this.provider.upload(data, metadata);

    if (!uploadResult.success) {
      return {
        success: false,
        vaultId: '',
        pieceCid: '',
        agentId,
        storedAt: Date.now(),
        size: 0,
        pdpStatus: 'failed',
        error: uploadResult.error || 'Upload failed',
      };
    }

    // Create vault entry
    const vaultId = this.generateVaultId();
    const storedAt = Date.now();

    const entry: VaultEntry = {
      vaultId,
      pieceCid: uploadResult.pieceCid,
      agentId,
      dataHash: this.computeDataHash(data),
      size: uploadResult.size,
      storedAt,
      pdpStatus: uploadResult.pdpStatus,
      metadata: metadata ? {
        type: metadata.type || 'other',
        description: metadata.description,
        tags: metadata.tags,
      } : undefined,
      paymentId,
    };

    // Add to index
    this.index.add(entry);

    return {
      success: true,
      vaultId,
      pieceCid: uploadResult.pieceCid,
      agentId,
      storedAt,
      size: uploadResult.size,
      pdpStatus: uploadResult.pdpStatus,
      paymentId,
    };
  }

  /**
   * Retrieve data by vaultId or pieceCid
   */
  async retrieve(id: string): Promise<RetrieveResponse> {
    // Look up in index
    const entry = this.index.get(id);

    if (!entry) {
      return {
        success: false,
        pieceCid: '',
        vaultId: '',
        pdpStatus: 'failed',
        error: `Vault not found: ${id}`,
      };
    }

    // Retrieve from provider
    const result = await this.provider.retrieve(entry.pieceCid);

    if (!result.success) {
      return {
        success: false,
        pieceCid: entry.pieceCid,
        vaultId: entry.vaultId,
        pdpStatus: result.pdpStatus,
        error: result.error,
      };
    }

    return {
      success: true,
      data: result.data,
      pieceCid: entry.pieceCid,
      vaultId: entry.vaultId,
      pdpStatus: result.pdpStatus,
      pdpVerifiedAt: entry.pdpVerifiedAt,
      metadata: entry.metadata ? {
        type: entry.metadata.type,
        description: entry.metadata.description,
        tags: entry.metadata.tags,
        storedAt: entry.storedAt,
        storedBy: entry.agentId,
      } : undefined,
    };
  }

  /**
   * Verify PDP proof for a pieceCid (lightweight, no data retrieval)
   */
  async verify(pieceCid: string): Promise<PDPVerifyResponse> {
    const entry = this.index.getByPieceCid(pieceCid);

    if (!entry) {
      return {
        exists: false,
        pieceCid,
        pdpVerified: false,
      };
    }

    // Verify with provider
    const result = await this.provider.verifyPDP(pieceCid);

    // Update index with verification result
    if (result.verified) {
      this.index.updatePDPStatus(pieceCid, 'verified', result.verifiedAt);
    }

    return {
      exists: true,
      pieceCid,
      vaultId: entry.vaultId,
      storedBy: entry.agentId,
      storedAt: entry.storedAt,
      pdpVerified: result.verified,
      pdpVerifiedAt: result.verifiedAt,
    };
  }

  /**
   * Get all vaults for an agent
   */
  getVaultsForAgent(agentId: string): VaultEntry[] {
    return this.index.getByAgentId(agentId);
  }

  /**
   * Get vault by ID (vaultId or pieceCid)
   */
  getVault(id: string): VaultEntry | null {
    return this.index.get(id);
  }

  /**
   * Get service stats (for health checks)
   */
  getStats(): { provider: string; vaults: number; agents: number } {
    const indexStats = this.index.getStats();
    return {
      provider: this.config.storage.provider,
      vaults: indexStats.totalVaults,
      agents: indexStats.totalAgents,
    };
  }
}

// Re-export for convenience
export { MockStorageProvider } from './mock.js';
export { VaultIndex } from './vault-index.js';
