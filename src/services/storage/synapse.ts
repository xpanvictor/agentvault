import { Synapse } from "@filoz/synapse-sdk";
import { IStorageProvider, PDPVerifyResult, RetrieveResult, UploadResult } from "../../types/storage.js";
import { StorageDataCodec } from "./util.js";
import { StorageContext } from "@filoz/synapse-sdk/storage";
import { withRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

/**
 * SynapseStorageProvider - Synapse implementation
 *
 * Context caching: a single StorageContext is created on first use and reused
 * across upload() and verifyPDP() calls so that pieceStatus() always queries
 * the same dataset where pieces were actually stored.
 */
export class SynapseStorageProvider implements IStorageProvider {
    SourceId: string = 'AgentVault';

    /** Lazily-initialised context — same dataset used for all operations. */
    private _context: StorageContext | null = null;

    constructor(private readonly synapse: Synapse) {}

    // ---------------------------------------------------------------------------
    // Context management (Bug 4 fix)
    // ---------------------------------------------------------------------------

    /**
     * Return the cached StorageContext, creating it on first call.
     * Reusing the same context guarantees that pieceStatus() queries the
     * exact dataset where pieces were uploaded.
     */
    private async getContext(): Promise<StorageContext> {
        if (!this._context) {
            this._context = await this.synapse.storage.createContext({
                metadata: { source: this.SourceId },
            });
        }
        return this._context;
    }

    // ---------------------------------------------------------------------------
    // Metadata serialisation (Bug 3 fix)
    // ---------------------------------------------------------------------------

    /**
     * Convert arbitrary upload metadata to Synapse's required
     * Record<string, string> format.  Arrays and other non-string values are
     * JSON-encoded so no information is lost.
     */
    private toSynapseMetadata(metadata?: object): Record<string, string> | undefined {
        if (!metadata) return undefined;
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(metadata)) {
            if (v === undefined || v === null) continue;
            result[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    // ---------------------------------------------------------------------------
    // IStorageProvider implementation
    // ---------------------------------------------------------------------------

    async upload(data: string, metadata?: object): Promise<UploadResult> {
        try {
            const size = Buffer.byteLength(data, 'utf8');
            const strEncodedData = StorageDataCodec.marshall({
                data,
                size,
                metadata,
                uploadedAt: Date.now(),
            });
            const file = new TextEncoder().encode(strEncodedData);
            const context = await this.getContext();

            const { pieceCid, size: fullDataSize } = await withRetry(
                () => context.upload(file, {
                    metadata: this.toSynapseMetadata(metadata),
                })
            );
            return {
                success: true,
                pieceCid: pieceCid.toString(),
                size: fullDataSize,
                pdpStatus: 'pending',
            };
        } catch (error) {
            logger.error({ err: error }, 'Synapse upload failed after retries');
            return {
                success: false,
                pieceCid: '',
                size: 0,
                pdpStatus: 'failed',
                error: error instanceof Error ? error.message : 'Unknown',
            };
        }
    }

    async retrieve(pieceCid: string): Promise<RetrieveResult> {
        let bytes: Uint8Array;
        try {
            // StorageManager.download() searches globally — no specific context needed.
            bytes = await withRetry(() => this.synapse.storage.download({ pieceCid }));
        } catch (error) {
            logger.error({ pieceCid, err: error }, 'Synapse download failed after retries');
            return {
                success: false,
                pdpStatus: 'failed',
                error: error instanceof Error ? error.message : `Data not found: ${pieceCid}`,
            };
        }

        const decodedText = new TextDecoder().decode(bytes);
        let storageData: { data: string };
        try {
            storageData = StorageDataCodec.unmarshall(decodedText);
        } catch (decodeError) {
            logger.error({ pieceCid, err: decodeError }, 'Failed to decode storage data');
            return {
                success: false,
                pdpStatus: 'failed',
                error: 'corrupt_piece: data could not be decoded',
            };
        }
        const pdpStatus = await this.verifyPDP(pieceCid);
        return {
            success: true,
            data: storageData.data,
            pdpStatus: pdpStatus.verified ? 'verified' : 'pending',
        };
    }

    async verifyPDP(pieceCid: string): Promise<PDPVerifyResult> {
        try {
            // Reuse the cached context so pieceStatus() queries the same dataset
            // that was used during upload (Bug 4 fix).
            const context = await this.getContext();
            const verificationStatus = await withRetry(
                () => context.pieceStatus({ pieceCid })
            );
            const { dataSetLastProven, exists, isProofOverdue } = verificationStatus;
            const verified = exists && !!dataSetLastProven && !isProofOverdue;
            return {
                verified,
                verifiedAt: verified ? dataSetLastProven!.valueOf() : undefined,
                proof: verificationStatus,
            };
        } catch (error) {
            logger.warn({ pieceCid, err: error }, 'PDP verification failed after retries');
            return { verified: false };
        }
    }
}
