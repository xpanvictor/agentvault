import type { VaultEntry, PDPStatus } from '../../types/storage.js';
import { loadJson, saveJson } from '../../utils/persist.js';

/**
 * VaultIndex - Vault lookup index, persisted to data/vaults.json.
 */
export class VaultIndex {
  private vaultIdIndex: Map<string, VaultEntry> = new Map();
  private pieceCidIndex: Map<string, string> = new Map();
  private agentIndex: Map<string, Set<string>> = new Map();

  constructor() {
    const saved = loadJson<VaultEntry[]>('vaults.json', []);
    for (const entry of saved) this._index(entry);
  }

  private _index(entry: VaultEntry): void {
    this.vaultIdIndex.set(entry.vaultId, entry);
    this.pieceCidIndex.set(entry.pieceCid, entry.vaultId);
    let agentVaults = this.agentIndex.get(entry.agentId);
    if (!agentVaults) { agentVaults = new Set(); this.agentIndex.set(entry.agentId, agentVaults); }
    agentVaults.add(entry.vaultId);
  }

  private _save(): void {
    saveJson('vaults.json', Array.from(this.vaultIdIndex.values()));
  }

  add(entry: VaultEntry): void {
    this._index(entry);
    this._save();
  }

  getByVaultId(vaultId: string): VaultEntry | null {
    return this.vaultIdIndex.get(vaultId) || null;
  }

  getByPieceCid(pieceCid: string): VaultEntry | null {
    const vaultId = this.pieceCidIndex.get(pieceCid);
    if (!vaultId) return null;
    return this.vaultIdIndex.get(vaultId) || null;
  }

  getByAgentId(agentId: string): VaultEntry[] {
    const vaultIds = this.agentIndex.get(agentId);
    if (!vaultIds) return [];

    const entries: VaultEntry[] = [];
    for (const vaultId of vaultIds) {
      const entry = this.vaultIdIndex.get(vaultId);
      if (entry) entries.push(entry);
    }

    return entries.sort((a, b) => b.storedAt - a.storedAt);
  }

  updatePDPStatus(pieceCid: string, status: PDPStatus, verifiedAt?: number): boolean {
    const entry = this.getByPieceCid(pieceCid);
    if (!entry) return false;

    entry.pdpStatus = status;
    if (verifiedAt) entry.pdpVerifiedAt = verifiedAt;
    this._save();

    return true;
  }

  exists(id: string): boolean {
    return this.vaultIdIndex.has(id) || this.pieceCidIndex.has(id);
  }

  get(id: string): VaultEntry | null {
    const byVaultId = this.vaultIdIndex.get(id);
    if (byVaultId) return byVaultId;
    return this.getByPieceCid(id);
  }

  getAll(): VaultEntry[] {
    return Array.from(this.vaultIdIndex.values());
  }

  getStats(): { totalVaults: number; totalAgents: number } {
    return {
      totalVaults: this.vaultIdIndex.size,
      totalAgents: this.agentIndex.size,
    };
  }

  clear(): void {
    this.vaultIdIndex.clear();
    this.pieceCidIndex.clear();
    this.agentIndex.clear();
  }
}
