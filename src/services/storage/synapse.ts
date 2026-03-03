import { Synapse } from "@filoz/synapse-sdk";
import { IStorageProvider, PDPVerifyResult, RetrieveResult, UploadResult } from "../../types/storage.js";
import { StorageDataCodec } from "./util.js";
import { StorageContext } from "@filoz/synapse-sdk/storage";

/**
 * SynapseStorageProvider - Synapse implementation
 */
export class SynapseStorageProvider implements IStorageProvider {
    SourceId: string = 'AgentVault'
    constructor(
        private readonly synapse: Synapse
    ) { }

    private async retrieveContext(): Promise<StorageContext> {
        return await this.synapse.storage.createContext({
            metadata: {source: this.SourceId}
        })
    }
    
    async upload(data: string, metadata?: object): Promise<UploadResult> {
        try {
            const size = Buffer.byteLength(data, 'utf8');
            const strEncodedData = StorageDataCodec.marshall({
                data,
                size,
                metadata,
                uploadedAt: Date.now()
            });
            const file = new TextEncoder().encode(strEncodedData);
            const context = await this.retrieveContext();
            
            const { pieceCid, size: fullDataSize } = await context
                .upload(
                    file,
                    {
                        metadata: metadata as Record<string, string> | undefined
                    }
                );
            return {
                success: true,
                pieceCid: pieceCid.toString(),
                size: fullDataSize,
                pdpStatus: 'pending'
            }
        } catch (error) {
            console.error(error);
            return {
                success: false,
                pieceCid: '',
                size: 0,
                pdpStatus: 'failed',
                error: error instanceof Error ? error.message : 'Unknown'
            }
        }
    }

    async retrieve(pieceCid: string): Promise<RetrieveResult> {
        const bytes = await this.synapse.storage.download({pieceCid})
        if (!bytes) {
            return {
                success: false,
                pdpStatus: 'failed',
                error: `Data not found: ${pieceCid}`
            }
        }
        const decodedText = new TextDecoder().decode(bytes);
        const storageData = StorageDataCodec.unmarshall(decodedText);
        const pdpStatus = await this.verifyPDP(pieceCid)
        return {
            success: true,
            data: storageData.data,
            pdpStatus: pdpStatus.verified ? 'verified' : 'pending'
        }
    }

    async verifyPDP(pieceCid: string): Promise<PDPVerifyResult> {
        const context = await this.retrieveContext();
        try {
            const verificationStatus = await context.pieceStatus({pieceCid})
            const {dataSetLastProven, exists, isProofOverdue} = verificationStatus
            const verified = exists && !!dataSetLastProven && !isProofOverdue;
            return {
                verified,
                // verified also checks dataSetLastProven existence
                verifiedAt: verified ? dataSetLastProven!.valueOf() : null,
                proof: verificationStatus
            }
        }
        catch {
            return {
                verified: false
            }
        }
    }
}
