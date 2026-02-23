import { createHash } from 'crypto';
import type {
  IStorageProvider,
  UploadResult,
  RetrieveResult,
  PDPVerifyResult,
  PDPStatus,
} from '../../types/storage.js';

/**
 * Stored data entry in mock provider
 */
interface MockStoredData {
  data: string;
  metadata?: object;
  uploadedAt: number;
  size: number;
}

/**
 * MockStorageProvider
 *
 * In-memory storage provider for development and testing.
 * Simulates Filecoin Onchain Cloud behavior with PDP proofs.
 *
 * Note: Data is lost on server restart. This is intentional for MVP.
 */
export class MockStorageProvider implements IStorageProvider {
  private store: Map<string, MockStoredData> = new Map();

  /**
   * Generate a realistic-looking PieceCID from data content
   * Uses 'bafk' prefix to mimic Filecoin CID format
   */
  private generatePieceCid(data: string): string {
    const hash = createHash('sha256').update(data).digest('hex');
    // Use first 32 chars of hash for shorter CID
    return `bafk${hash.substring(0, 32)}`;
  }

  /**
   * Upload data to mock storage
   */
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
        pdpStatus: 'verified' as PDPStatus, // Instant verification for mock
      };
    } catch (error) {
      return {
        success: false,
        pieceCid: '',
        size: 0,
        pdpStatus: 'failed' as PDPStatus,
        error: error instanceof Error ? error.message : 'Unknown upload error',
      };
    }
  }

  /**
   * Retrieve data by PieceCID
   */
  async retrieve(pieceCid: string): Promise<RetrieveResult> {
    const entry = this.store.get(pieceCid);

    if (!entry) {
      return {
        success: false,
        pdpStatus: 'failed' as PDPStatus,
        error: `Data not found for CID: ${pieceCid}`,
      };
    }

    return {
      success: true,
      data: entry.data,
      pdpStatus: 'verified' as PDPStatus,
    };
  }

  /**
   * Verify PDP proof for a PieceCID
   * In mock, this just checks if the data exists
   */
  async verifyPDP(pieceCid: string): Promise<PDPVerifyResult> {
    const entry = this.store.get(pieceCid);

    if (!entry) {
      return {
        verified: false,
        verifiedAt: Date.now(),
        error: `Data not found for CID: ${pieceCid}`,
      };
    }

    return {
      verified: true,
      proof: {
        provider: 'mock',
        pieceCid,
        size: entry.size,
        uploadedAt: entry.uploadedAt,
      },
      verifiedAt: Date.now(),
    };
  }

  /**
   * Check if data exists (utility method)
   */
  has(pieceCid: string): boolean {
    return this.store.has(pieceCid);
  }

  /**
   * Get storage stats (utility method for debugging)
   */
  getStats(): { totalEntries: number; totalBytes: number } {
    let totalBytes = 0;
    for (const entry of this.store.values()) {
      totalBytes += entry.size;
    }
    return {
      totalEntries: this.store.size,
      totalBytes,
    };
  }

  /**
   * Clear all stored data (utility method for testing)
   */
  clear(): void {
    this.store.clear();
  }
}
