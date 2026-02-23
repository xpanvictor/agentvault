import type { VaultEntry, PDPStatus } from '../../types/storage.js';

/**
 * VaultIndex
 *
 * In-memory index for tracking vault entries.
 * Provides O(1) lookups by vaultId, pieceCid, and O(n) by agentId.
 *
 * Note: Data is lost on server restart. This is intentional for MVP.
 */
export class VaultIndex {
  // Primary index: vaultId → VaultEntry
  private vaultIdIndex: Map<string, VaultEntry> = new Map();

  // Secondary index: pieceCid → vaultId (for CID-based lookups)
  private pieceCidIndex: Map<string, string> = new Map();

  // Agent index: agentId → Set<vaultId> (for listing agent's vaults)
  private agentIndex: Map<string, Set<string>> = new Map();

  /**
   * Add a vault entry to all indexes
   */
  add(entry: VaultEntry): void {
    // Primary index
    this.vaultIdIndex.set(entry.vaultId, entry);

    // PieceCID index
    this.pieceCidIndex.set(entry.pieceCid, entry.vaultId);

    // Agent index
    let agentVaults = this.agentIndex.get(entry.agentId);
    if (!agentVaults) {
      agentVaults = new Set();
      this.agentIndex.set(entry.agentId, agentVaults);
    }
    agentVaults.add(entry.vaultId);
  }

  /**
   * Get vault entry by vaultId
   */
  getByVaultId(vaultId: string): VaultEntry | null {
    return this.vaultIdIndex.get(vaultId) || null;
  }

  /**
   * Get vault entry by pieceCid
   */
  getByPieceCid(pieceCid: string): VaultEntry | null {
    const vaultId = this.pieceCidIndex.get(pieceCid);
    if (!vaultId) return null;
    return this.vaultIdIndex.get(vaultId) || null;
  }

  /**
   * Get all vault entries for an agent
   */
  getByAgentId(agentId: string): VaultEntry[] {
    const vaultIds = this.agentIndex.get(agentId);
    if (!vaultIds) return [];

    const entries: VaultEntry[] = [];
    for (const vaultId of vaultIds) {
      const entry = this.vaultIdIndex.get(vaultId);
      if (entry) entries.push(entry);
    }

    // Sort by storedAt descending (newest first)
    return entries.sort((a, b) => b.storedAt - a.storedAt);
  }

  /**
   * Update PDP status for a vault entry
   */
  updatePDPStatus(pieceCid: string, status: PDPStatus, verifiedAt?: number): boolean {
    const entry = this.getByPieceCid(pieceCid);
    if (!entry) return false;

    entry.pdpStatus = status;
    if (verifiedAt) {
      entry.pdpVerifiedAt = verifiedAt;
    }

    return true;
  }

  /**
   * Check if a vault exists by vaultId or pieceCid
   */
  exists(id: string): boolean {
    return this.vaultIdIndex.has(id) || this.pieceCidIndex.has(id);
  }

  /**
   * Get entry by either vaultId or pieceCid
   */
  get(id: string): VaultEntry | null {
    // Try vaultId first
    const byVaultId = this.vaultIdIndex.get(id);
    if (byVaultId) return byVaultId;

    // Try pieceCid
    return this.getByPieceCid(id);
  }

  /**
   * Get all entries (for debugging)
   */
  getAll(): VaultEntry[] {
    return Array.from(this.vaultIdIndex.values());
  }

  /**
   * Get index stats (for debugging)
   */
  getStats(): { totalVaults: number; totalAgents: number } {
    return {
      totalVaults: this.vaultIdIndex.size,
      totalAgents: this.agentIndex.size,
    };
  }

  /**
   * Clear all indexes (for testing)
   */
  clear(): void {
    this.vaultIdIndex.clear();
    this.pieceCidIndex.clear();
    this.agentIndex.clear();
  }
}
