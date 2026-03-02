

// Functional codec to generate 

import { StorageData } from "../../types/storage.js";

// storage data like serde-rust
export const StorageDataCodec = {
    marshall(data: StorageData): string {
        return JSON.stringify(data);
    },
    unmarshall(payload: string): StorageData {
        return JSON.parse(payload) as StorageData
    }
}
