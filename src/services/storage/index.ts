import { createHash, randomUUID } from 'crypto';
import type { Config, ENetworkNames } from '../../types/config.js';
import type {
  IStorageProvider,
  VaultEntry,
  StoreResponse,
  RetrieveResponse,
  PDPVerifyResponse,
} from '../../types/storage.js';
import { MockStorageProvider } from './mock.js';
import { VaultIndex } from './vault-index.js';
import { SynapseStorageProvider } from './synapse.js';
import { calibration, Chain, mainnet, Synapse } from '@filoz/synapse-sdk';
import { logger } from '../../utils/logger.js';
import { privateKeyToAccount } from 'viem/accounts';
import { webSocket, http } from 'viem';

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
 * StorageService - Main orchestration layer
 */
export class StorageService {
  private provider: IStorageProvider;
  private index: VaultIndex;
  private config: Config;

  static chainNameMapper(chainName: ENetworkNames): Chain {
    switch (chainName) {
      case 'calibration':
        return calibration
      case 'mainnet':
        return mainnet
      default:
        return calibration;
    }
  }

  constructor(config: Config) {
    this.config = config;
    this.index = new VaultIndex();

    if (config.storage.provider === 'synapse') {
      const synapsePK = config.storage.privateKey;
      const chainNetwork = config.filecoin.network;

      if (!synapsePK) {
        throw new Error(
          'STORAGE_PRIVATE_KEY is required when STORAGE_PROVIDER=synapse'
        );
      }

      const account = privateKeyToAccount(synapsePK as `0x${string}`);
      const rpcUrl = config.filecoin.rpcUrl;
      const transport = rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')
        ? webSocket(rpcUrl)
        : http(rpcUrl);

      const synapse = Synapse.create({
        chain: StorageService.chainNameMapper(chainNetwork),
        account,
        transport,
      });
      this.provider = new SynapseStorageProvider(synapse);
    } else {
      this.provider = new MockStorageProvider();
    }

    logger.info({ provider: config.storage.provider }, 'StorageService initialized');
  }

  private generateVaultId(): string {
    const uuid = randomUUID().replace(/-/g, '').substring(0, 12);
    return `vault_${uuid}`;
  }

  private computeDataHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  async store(params: StoreParams): Promise<StoreResponse> {
    const { agentId, data, metadata, paymentId } = params;

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

  async retrieve(id: string): Promise<RetrieveResponse> {
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

  async verify(pieceCid: string): Promise<PDPVerifyResponse> {
    const entry = this.index.getByPieceCid(pieceCid);

    if (!entry) {
      return {
        exists: false,
        pieceCid,
        pdpVerified: false,
      };
    }

    const result = await this.provider.verifyPDP(pieceCid);

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

  getVaultsForAgent(agentId: string): VaultEntry[] {
    return this.index.getByAgentId(agentId);
  }

  getVault(id: string): VaultEntry | null {
    return this.index.get(id);
  }

  getStats(): { provider: string; vaults: number; agents: number } {
    const indexStats = this.index.getStats();
    return {
      provider: this.config.storage.provider,
      vaults: indexStats.totalVaults,
      agents: indexStats.totalAgents,
    };
  }
}

export { MockStorageProvider } from './mock.js';
export { VaultIndex } from './vault-index.js';
