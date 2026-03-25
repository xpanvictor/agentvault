export class AgentVaultError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly reason?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, payload?: Record<string, unknown>) {
    super(message);
    this.name = "AgentVaultError";
    this.status = status;
    this.code = typeof payload?.error === "string" ? payload.error : undefined;
    this.reason = typeof payload?.reason === "string" ? payload.reason : undefined;
    this.details = payload;
  }
}

// Backward-compatible alias (can be removed in a future major release)
export { AgentVaultError as AgentVaultApiError };
