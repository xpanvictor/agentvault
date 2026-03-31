export type Role = "research" | "inference";

export interface StoredRef {
  vaultId: string;
  pieceCid: string;
  at: string;
  description?: string;
}

export interface DemoState {
  researchAgentId?: string;
  inferenceAgentId?: string;
  refs: StoredRef[];
}

export interface ToolLogEntry {
  at: string;
  role: Role;
  tool: string;
  input: unknown;
  success: boolean;
  output: unknown;
}
