export type PDPStatus = "pending" | "verified" | "failed";
export type SettlementStatus = "pending" | "settled" | "failed";

export interface Payment {
  from: string;
  to: string;
  value: string;
  validAfter: number | string;
  validBefore: number | string;
  nonce: string;
  signature: string;
  token: string;
}

export interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string;
  tokenAddress: string;
  chainId: number;
  resource?: string;
  description?: string;
}

export interface StoreMetadata {
  type?: "decision_log" | "conversation" | "dataset" | "state" | "other";
  description?: string;
  tags?: string[];
}

export interface StoreRequest {
  agentId: string;
  data: string;
  metadata?: StoreMetadata;
}

export interface StoreResponse {
  success: boolean;
  vaultId: string;
  pieceCid: string;
  agentId: string;
  storedAt: number;
  size: number;
  pdpStatus: PDPStatus;
  paymentId?: string;
}

export interface RetrieveResponse {
  success: boolean;
  data?: string;
  pieceCid: string;
  vaultId: string;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
  metadata?: {
    type: string;
    description?: string;
    tags?: string[];
    storedAt: number;
    storedBy: string;
  };
}

export interface VerifyResponse {
  exists: boolean;
  pieceCid: string;
  vaultId?: string;
  storedBy?: string;
  storedAt?: number;
  pdpVerified: boolean;
  pdpVerifiedAt?: number;
}

export interface AgentCard {
  name: string;
  description?: string;
  version?: string;
  capabilities?: string[];
  protocols?: Array<"mcp" | "a2a" | "x402" | "other">;
  endpoints?: {
    api?: string;
    webhook?: string;
  };
  x402Support?: boolean;
}

export interface RegisterAgentRequest {
  address: string;
  agentCard: AgentCard;
  signature: string;
}

export interface AgentManifestEntry {
  vaultId: string;
  pieceCid: string;
  type: string;
  storedAt: number;
  size: number;
  pdpStatus: PDPStatus;
  pdpVerifiedAt?: number;
}

export interface AgentRecord {
  agentId: string;
  address: string;
  agentCard: AgentCard;
  cardCid: string;
  registeredAt: number;
  storageManifest: AgentManifestEntry[];
  reputation: {
    totalStored: number;
    totalRetrieved: number;
    verificationScore: number;
  };
}

export interface RegisterAgentResponse {
  success: boolean;
  isNew: boolean;
  agentId: string;
  address: string;
  agentCard: AgentCard;
  cardCid: string;
  registeredAt: number;
  storageManifest: AgentManifestEntry[];
  reputation: AgentRecord["reputation"];
}

export interface GetAgentResponse {
  found: boolean;
  agent?: AgentRecord;
  error?: string;
}

export interface VaultSummary {
  vaultId: string;
  pieceCid: string;
  type: string;
  size: number;
  storedAt: number;
  pdpStatus: PDPStatus;
}

export interface ListVaultsResponse {
  agentId: string;
  vaults: VaultSummary[];
  total: number;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: "store" | "retrieve" | "verify" | "register" | "settle";
  details: {
    pieceCid?: string;
    vaultId?: string;
    size?: number;
    paymentId?: string;
    pdpStatus?: PDPStatus;
    success: boolean;
    error?: string;
  };
}

export interface AuditTrailResponse {
  agentId: string;
  entries: AuditEntry[];
  summary: {
    totalOperations: number;
    totalStored: number;
    totalRetrieved: number;
    lastActivity: number;
  };
}

export interface SettlementRecord {
  paymentId: string;
  agentId: string;
  resource: string;
  status: SettlementStatus;
  attempts: number;
  createdAt: number;
  lastAttemptAt: number;
  settledAt?: number;
  error?: string;
}

export interface SettlementStats {
  pending: number;
  settled: number;
  failed: number;
  total: number;
}

export interface ListSettlementsResponse {
  stats: SettlementStats;
  records: SettlementRecord[];
  total: number;
}

export interface ExportRegistryResponse {
  success: boolean;
  cid: string;
  exportedAt: number;
  agentCount: number;
  hint: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  storage: {
    provider: string;
    vaults: number;
    agents: number;
  };
  identity: {
    enabled: boolean;
    totalAgents: number;
  };
  audit: {
    totalEntries: number;
    totalAgents: number;
  };
  settlement: SettlementStats;
  x402: {
    url: string;
    healthy: boolean;
    mock: boolean;
  };
}

export interface RootResponse {
  service: string;
  version: string;
  description: string;
  endpoints: Record<string, string>;
  x402: {
    dependency: string;
    mock: boolean;
  };
  storage: {
    provider: string;
    vaults: number;
    agents: number;
  };
  facilitator: {
    address: string;
  };
}

export interface PaymentSigner {
  signPayment(requirements: PaymentRequirements): Promise<Payment | string>;
}

export interface AgentVaultApiClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  paymentSigner?: PaymentSigner;
  defaultHeaders?: Record<string, string>;
}
