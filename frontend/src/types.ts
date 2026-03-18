// ─── Common ──────────────────────────────────────────────────────────────────

export type PDPStatus = 'pending' | 'verified' | 'failed';
export type SettlementStatus = 'pending' | 'settled' | 'failed';
export type AuditAction = 'store' | 'retrieve' | 'verify' | 'register' | 'settle';

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  storage: {
    provider: 'mock' | 'synapse';
    vaults: number;
    agents: number;
  };
  identity?: {
    totalAgents: number;
  };
  audit?: {
    totalAgents: number;
    totalEntries: number;
  };
  settlement: {
    pending: number;
    settled: number;
    failed: number;
    total: number;
  };
  x402: {
    url: string;
    healthy: boolean;
    mock: boolean;
  };
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface AgentCard {
  name: string;
  description?: string;
  version: string;
  capabilities?: string[];
  protocols?: string[];
  endpoints?: { api?: string; webhook?: string };
  x402Support: boolean;
}

export interface StorageManifestEntry {
  vaultId: string;
  pieceCid: string;
  type: string;
  storedAt: number;
  size: number;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
}

export interface Reputation {
  totalStored: number;
  totalRetrieved: number;
  verificationScore: number;
}

export interface Agent {
  agentId: string;
  address: string;
  agentCard: AgentCard;
  cardCid: string;
  registeredAt: number;
  storageManifest: StorageManifestEntry[];
  reputation: Reputation;
}

export interface AgentResponse {
  found: boolean;
  agent?: Agent;
  error?: string;
}

// ─── Vaults ──────────────────────────────────────────────────────────────────

export interface VaultSummary {
  vaultId: string;
  pieceCid: string;
  type: string;
  size: number;
  storedAt: number;
  pdpStatus: PDPStatus;
}

export interface VaultsResponse {
  agentId: string;
  vaults: VaultSummary[];
  total: number;
}

// ─── Verify ──────────────────────────────────────────────────────────────────

export interface VerifyResponse {
  exists: boolean;
  pieceCid: string;
  vaultId?: string;
  storedBy?: string;
  storedAt?: number;
  pdpVerified: boolean;
  pdpVerifiedAt?: number;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditDetails {
  pieceCid?: string;
  vaultId?: string;
  size?: number;
  paymentId?: string;
  pdpStatus?: PDPStatus;
  success: boolean;
  error?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: AuditAction;
  details: AuditDetails;
}

export interface AuditSummary {
  totalOperations: number;
  totalStored: number;
  totalRetrieved: number;
  lastActivity: number;
}

export interface AuditResponse {
  agentId: string;
  entries: AuditEntry[];
  summary: AuditSummary;
}

// ─── Settlements ─────────────────────────────────────────────────────────────

export interface SettlementRecord {
  paymentId: string;
  agentId: string;
  resource: string;
  status: SettlementStatus;
  attempts: number;
  lastAttemptAt: number;
  settledAt?: number;
  error?: string;
}

export interface SettlementsResponse {
  stats: {
    pending: number;
    settled: number;
    failed: number;
    total: number;
  };
  records: SettlementRecord[];
  total: number;
}
