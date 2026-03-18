import type {
  HealthResponse,
  AgentResponse,
  VaultsResponse,
  VerifyResponse,
  AuditResponse,
  SettlementsResponse,
  SettlementStatus,
} from './types';

const BASE = 'http://localhost:3500';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    get<HealthResponse>('/health'),

  getAgent: (agentId: string) =>
    get<AgentResponse>(`/agent/${encodeURIComponent(agentId)}`),

  getVaults: (agentId: string) =>
    get<VaultsResponse>(`/agent/vaults/${encodeURIComponent(agentId)}`),

  getAudit: (agentId: string) =>
    get<AuditResponse>(`/agent/audit/${encodeURIComponent(agentId)}`),

  verify: (pieceCid: string) =>
    get<VerifyResponse>(`/agent/verify/${encodeURIComponent(pieceCid)}`),

  getSettlements: (status?: SettlementStatus) =>
    get<SettlementsResponse>(
      `/agent/settlements${status ? `?status=${status}` : ''}`
    ),
};
