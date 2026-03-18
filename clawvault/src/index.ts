/**
 * ClawVault — OpenClaw plugin for AgentVault
 *
 * Gives AI agents verifiable memory, cryptographic identity, and
 * autonomous storage payments in 4 tool calls.
 *
 * Usage:
 *   import { ClawVault } from '@agentvault/clawvault';
 *
 *   const vault = new ClawVault({
 *     url:        'http://localhost:3500',
 *     privateKey: '0x...',            // signs registrations + x402 payments
 *     agentCard:  { name: 'MyAgent', version: '1.0.0', x402Support: true },
 *   });
 *
 *   // Store a decision log — pays automatically via x402
 *   const { pieceCid } = await vault.store({ data: '...', type: 'decision_log' });
 *
 *   // Retrieve it later (any agent can do this)
 *   const { data, pdpVerified } = await vault.recall({ id: pieceCid });
 *
 *   // Prove identity
 *   const id = await vault.identity();
 *
 *   // Full audit trail
 *   const trail = await vault.audit({ limit: 10 });
 */

import { privateKeyToAccount } from 'viem/accounts';
import { AgentVaultClient }    from './client.js';
import { store,    storeToolDef    } from './tools/store.js';
import { recall,   recallToolDef   } from './tools/recall.js';
import { identity, identityToolDef } from './tools/identity.js';
import { audit,    auditToolDef    } from './tools/audit.js';

export type { StoreParams,    StoreToolResult    } from './tools/store.js';
export type { RecallParams,   RecallToolResult   } from './tools/recall.js';
export type { IdentityParams, IdentityToolResult } from './tools/identity.js';
export type { AuditParams,    AuditToolResult    } from './tools/audit.js';
export type { AgentVaultClient } from './client.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ClawVaultConfig {
  /** AgentVault server URL. Default: http://localhost:3500 */
  url?: string;
  /** Wallet private key. Used to sign EIP-191 registrations and EIP-3009 payments. */
  privateKey?: string;
  /**
   * Pre-existing agentId. Skip auto-registration on first use.
   * Leave unset to auto-register with the provided agentCard.
   */
  agentId?: string;
  /** Agent card stored in the ERC-8004 registry on registration. */
  agentCard?: {
    name: string;
    version: string;
    x402Support: boolean;
    capabilities?: string[];
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// ClawVault plugin
// ---------------------------------------------------------------------------

export class ClawVault {
  private readonly client:  AgentVaultClient;
  private readonly config:  ClawVaultConfig;
  private _agentId:         string | null;
  private _registering:     Promise<string> | null = null;

  constructor(config: ClawVaultConfig = {}) {
    this.config   = config;
    this._agentId = config.agentId ?? null;

    const account = config.privateKey
      ? privateKeyToAccount(config.privateKey as `0x${string}`)
      : null;

    this.client = new AgentVaultClient(config.url ?? 'http://localhost:3500', account);
  }

  // ─── Auto-registration ────────────────────────────────────────────────────

  /**
   * Returns the agentId, registering the agent first if not already done.
   * Safe to call concurrently — registration only happens once.
   */
  async getAgentId(): Promise<string> {
    if (this._agentId) return this._agentId;

    if (!this._registering) {
      this._registering = this._register();
    }
    this._agentId = await this._registering;
    return this._agentId;
  }

  private async _register(): Promise<string> {
    if (!this.config.privateKey) {
      throw new Error('ClawVault: privateKey is required for auto-registration');
    }
    const account     = privateKeyToAccount(this.config.privateKey as `0x${string}`);
    const agentCard   = this.config.agentCard ?? { name: 'UnnamedAgent', version: '1.0.0', x402Support: true };
    const message     = `AgentVault registration: ${account.address.toLowerCase()}`;
    const signature   = await account.signMessage({ message });

    const result = await this.client.register(account.address, agentCard, signature);
    return result.agentId;
  }

  // ─── The 4 tools ──────────────────────────────────────────────────────────

  /**
   * Store agent data verifiably on Filecoin.
   * Automatically handles the x402 payment flow.
   */
  async store(params: import('./tools/store.js').StoreParams) {
    const agentId = await this.getAgentId();
    return store(this.client, agentId, params);
  }

  /**
   * Retrieve data from Filecoin by vaultId or PieceCID.
   * Automatically handles the x402 payment flow.
   */
  async recall(params: import('./tools/recall.js').RecallParams) {
    return recall(this.client, params);
  }

  /**
   * Get or verify an ERC-8004 agent identity.
   * Omit params to return this agent's own identity.
   * Pass { agentId } to look up and verify another agent.
   */
  async identity(params: import('./tools/identity.js').IdentityParams = {}) {
    const selfId = await this.getAgentId();
    return identity(this.client, selfId, params);
  }

  /**
   * Return the tamper-evident audit trail for this agent (or another agent).
   */
  async audit(params: import('./tools/audit.js').AuditParams = {}) {
    const selfId = await this.getAgentId();
    return audit(this.client, selfId, params);
  }

  // ─── MCP tool definitions ─────────────────────────────────────────────────

  /**
   * MCP-compatible tool definitions.
   * Pass to any agent framework that accepts tool schemas:
   *
   *   const agent = new OpenClawAgent({ tools: vault.tools });
   */
  get tools() {
    return [storeToolDef, recallToolDef, identityToolDef, auditToolDef] as const;
  }

  /**
   * Dispatch a tool call by name — bridges MCP tool invocations to vault methods.
   *
   *   const result = await vault.callTool('vault_store', { data: '...' });
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'vault_store':    return this.store(args    as import('./tools/store.js').StoreParams);
      case 'vault_recall':   return this.recall(args   as import('./tools/recall.js').RecallParams);
      case 'vault_identity': return this.identity(args as import('./tools/identity.js').IdentityParams);
      case 'vault_audit':    return this.audit(args    as import('./tools/audit.js').AuditParams);
      default: throw new Error(`ClawVault: unknown tool "${name}"`);
    }
  }
}
