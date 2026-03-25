export { AgentVaultClient, AgentVaultApiClient } from "./client.js";
export { AgentVaultError, AgentVaultApiError } from "./errors.js";
export {
  ViemX402PaymentSigner,
  createRegistrationMessage,
  createSignedRegisterAgentRequest,
  signRegistrationMessage,
  signX402Payment,
  toPaymentHeader,
} from "./signers.js";
export type {
  AgentCard,
  AgentManifestEntry,
  AgentRecord,
  AgentVaultApiClientConfig,
  AuditEntry,
  AuditTrailResponse,
  ExportRegistryResponse,
  GetAgentResponse,
  HealthResponse,
  ListSettlementsResponse,
  ListVaultsResponse,
  Payment,
  PaymentRequirements,
  PaymentSigner,
  PDPStatus,
  RegisterAgentRequest,
  RegisterAgentResponse,
  RetrieveResponse,
  RootResponse,
  SettlementRecord,
  SettlementStatus,
  StoreMetadata,
  StoreRequest,
  StoreResponse,
  VerifyResponse,
  VaultSummary,
} from "./types.js";
export type {
  RegistrationSignatureResult,
  ViemPaymentSignerOptions,
} from "./signers.js";
