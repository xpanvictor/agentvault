import { createHash } from 'crypto';
import type {
  IStorageProvider,
  UploadResult,
  RetrieveResult,
  PDPVerifyResult,
  PDPStatus,
} from '../../types/storage.js';

interface MockStoredData {
  data: string;
  metadata?: object;
  uploadedAt: number;
  size: number;
}

/**
 * MockStorageProvider - In-memory storage for development
 */
export class MockStorageProvider implements IStorageProvider {
  private store: Map<string, MockStoredData> = new Map();

  private generatePieceCid(data: string): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `bafk${hash.substring(0, 32)}`;
  }

  async upload(data: string, metadata?: object): Promise<UploadResult> {
    try {
      const pieceCid = this.generatePieceCid(data);
      const size = Buffer.byteLength(data, 'utf8');

      this.store.set(pieceCid, {
        data,
        metadata,
        uploadedAt: Date.now(),
        size,
      });

      return {
        success: true,
        pieceCid,
        size,
        pdpStatus: 'verified' as PDPStatus,
      };
    } catch (error) {
      return {
        success: false,
        pieceCid: '',
        size: 0,
        pdpStatus: 'failed' as PDPStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async retrieve(pieceCid: string): Promise<RetrieveResult> {
    const entry = this.store.get(pieceCid);

    if (!entry) {
      return {
        success: false,
        pdpStatus: 'failed' as PDPStatus,
        error: `Data not found: ${pieceCid}`,
      };
    }

    return {
      success: true,
      data: entry.data,
      pdpStatus: 'verified' as PDPStatus,
    };
  }

  async verifyPDP(pieceCid: string): Promise<PDPVerifyResult> {
    const entry = this.store.get(pieceCid);

    if (!entry) {
      return {
        verified: false,
        verifiedAt: Date.now(),
        error: `Data not found: ${pieceCid}`,
      };
    }

    return {
      verified: true,
      proof: { provider: 'mock', pieceCid, size: entry.size },
      verifiedAt: Date.now(),
    };
  }

  has(pieceCid: string): boolean {
    return this.store.has(pieceCid);
  }

  getStats(): { totalEntries: number; totalBytes: number } {
    let totalBytes = 0;
    for (const entry of this.store.values()) {
      totalBytes += entry.size;
    }
    return { totalEntries: this.store.size, totalBytes };
  }

  clear(): void {
    this.store.clear();
  }
}
