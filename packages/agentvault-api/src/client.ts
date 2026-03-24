import { AgentVaultError } from "./errors.js";
import type {
  AgentVaultApiClientConfig,
  AuditTrailResponse,
  ExportRegistryResponse,
  GetAgentResponse,
  HealthResponse,
  ListSettlementsResponse,
  ListVaultsResponse,
  Payment,
  PaymentRequirements,
  RegisterAgentRequest,
  RegisterAgentResponse,
  RetrieveResponse,
  RootResponse,
  SettlementRecord,
  SettlementStatus,
  StoreRequest,
  StoreResponse,
  VerifyResponse,
} from "./types.js";

export class AgentVaultClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly paymentSigner?: AgentVaultApiClientConfig["paymentSigner"];
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: AgentVaultApiClientConfig = {}) {
    const envBaseUrl =
      typeof process !== "undefined" ? process.env.BaseAgentVaultUrl : undefined;
    this.baseUrl = (config.baseUrl ?? envBaseUrl ?? "http://localhost:3500").replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.paymentSigner = config.paymentSigner;
    this.defaultHeaders = config.defaultHeaders ?? {};
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health");
  }

  async getRoot(): Promise<RootResponse> {
    return this.request<RootResponse>("GET", "/");
  }

  async registerAgent(input: RegisterAgentRequest): Promise<RegisterAgentResponse> {
    return this.request<RegisterAgentResponse>("POST", "/agent/register", input);
  }

  async getAgent(agentId: string): Promise<GetAgentResponse> {
    return this.request<GetAgentResponse>("GET", `/agent/${encodeURIComponent(agentId)}`);
  }

  async store(input: StoreRequest, payment?: Payment | string): Promise<StoreResponse> {
    return this.requestWithPayment<StoreResponse>("POST", "/agent/store", input, payment);
  }

  async retrieve(id: string, payment?: Payment | string): Promise<RetrieveResponse> {
    return this.requestWithPayment<RetrieveResponse>(
      "GET",
      `/agent/retrieve/${encodeURIComponent(id)}`,
      undefined,
      payment,
    );
  }

  async verify(pieceCid: string): Promise<VerifyResponse> {
    return this.request<VerifyResponse>("GET", `/agent/verify/${encodeURIComponent(pieceCid)}`);
  }

  async listVaults(agentId: string): Promise<ListVaultsResponse> {
    return this.request<ListVaultsResponse>("GET", `/agent/vaults/${encodeURIComponent(agentId)}`);
  }

  async getAuditTrail(agentId: string): Promise<AuditTrailResponse> {
    return this.request<AuditTrailResponse>("GET", `/agent/audit/${encodeURIComponent(agentId)}`);
  }

  async listSettlements(status?: SettlementStatus): Promise<ListSettlementsResponse> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<ListSettlementsResponse>("GET", `/agent/settlements${query}`);
  }

  async getSettlement(paymentId: string): Promise<SettlementRecord> {
    return this.request<SettlementRecord>("GET", `/agent/settlements/${encodeURIComponent(paymentId)}`);
  }

  async exportRegistry(): Promise<ExportRegistryResponse> {
    return this.request<ExportRegistryResponse>("POST", "/agent/export-registry", {});
  }

  private async requestWithPayment<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    payment?: Payment | string,
  ): Promise<T> {
    const suppliedPayment = payment ? this.normalizePayment(payment) : undefined;

    if (suppliedPayment) {
      return this.request<T>(method, path, body, { "x-payment": suppliedPayment });
    }

    const probe = await this.rawRequest(method, path, body);
    if (probe.response.status !== 402) {
      return this.handleResponse<T>(probe.response, probe.parsedBody);
    }

    if (!this.paymentSigner) {
      const payload =
        probe.parsedBody && typeof probe.parsedBody === "object"
          ? (probe.parsedBody as Record<string, unknown>)
          : undefined;

      throw new AgentVaultError(
        "Payment required (402): configure paymentSigner or pass payment explicitly",
        402,
        payload,
      );
    }

    const requirements = probe.parsedBody as PaymentRequirements;
    const signed = await this.paymentSigner.signPayment(requirements);
    const xPayment = this.normalizePayment(signed);

    return this.request<T>(method, path, body, { "x-payment": xPayment });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const { response, parsedBody } = await this.rawRequest(method, path, body, extraHeaders);
    return this.handleResponse<T>(response, parsedBody);
  }

  private async rawRequest(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ response: Response; parsedBody: unknown }> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...extraHeaders,
    };

    if (body !== undefined && !("Content-Type" in headers)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsedBody: unknown = {};
    if (text.length > 0) {
      try {
        parsedBody = JSON.parse(text) as unknown;
      } catch {
        parsedBody = { raw: text };
      }
    }

    return { response, parsedBody };
  }

  private handleResponse<T>(response: Response, parsedBody: unknown): T {
    if (!response.ok) {
      const payload =
        parsedBody && typeof parsedBody === "object"
          ? (parsedBody as Record<string, unknown>)
          : { raw: parsedBody };
      const message =
        typeof payload.reason === "string"
          ? payload.reason
          : typeof payload.error === "string"
            ? payload.error
            : `Request failed with status ${response.status}`;

      throw new AgentVaultError(message, response.status, payload);
    }

    return parsedBody as T;
  }

  private normalizePayment(payment: Payment | string): string {
    return typeof payment === "string" ? payment : JSON.stringify(payment);
  }
}

// Backward-compatible alias (can be removed in a future major release)
export { AgentVaultClient as AgentVaultApiClient };
