/**
 * AgentVaultClient
 *
 * Thin HTTP client for the AgentVault API.
 * Handles the full x402 payment flow automatically:
 *   1. POST/GET without payment → 402 with requirements
 *   2. Sign EIP-3009 TransferWithAuthorization
 *   3. Retry with signed x-payment header → 200/201
 */

import { randomBytes } from 'node:crypto';
import type { PrivateKeyAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string;
  tokenAddress: string;
  chainId: number;
  resource?: string;
}

export interface StoreResult {
  vaultId: string;
  pieceCid: string;
  agentId: string;
  storedAt: number;
  size: number;
  pdpStatus: string;
}

export interface RetrieveResult {
  data: string;
  pieceCid: string;
  vaultId: string;
  pdpStatus: string;
  pdpVerifiedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface RegisterResult {
  agentId: string;
  address: string;
  agentCard: Record<string, unknown>;
  cardCid: string;
  registeredAt: number;
  isNew: boolean;
  storageManifest: unknown[];
  reputation: { totalStored: number; totalRetrieved: number; verificationScore: number };
}

export interface AgentResult {
  agentId: string;
  address: string;
  agentCard: Record<string, unknown>;
  cardCid: string;
  registeredAt: number;
  storageManifest: unknown[];
  reputation: { totalStored: number; totalRetrieved: number; verificationScore: number };
}

export interface VerifyResult {
  exists: boolean;
  pieceCid: string;
  vaultId?: string;
  storedBy?: string;
  pdpVerified: boolean;
  pdpVerifiedAt?: number;
}

export interface AuditEntry {
  action: string;
  timestamp: number;
  details: Record<string, unknown>;
}

export interface AuditResult {
  agentId: string;
  entries: AuditEntry[];
  summary: Record<string, unknown>;
}

export interface StoreMeta {
  type?: 'decision_log' | 'conversation' | 'dataset' | 'state' | 'other';
  description?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AgentVaultClient {
  readonly baseUrl: string;
  private account: PrivateKeyAccount | null;

  constructor(baseUrl: string, account: PrivateKeyAccount | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.account = account;
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  async register(
    address: string,
    agentCard: Record<string, unknown>,
    signature: string,
  ): Promise<RegisterResult> {
    const res = await this._post('/agent/register', { address, agentCard, signature });
    if (!res.ok) {
      const err = await res.json() as Record<string, unknown>;
      throw new Error(`Registration failed: ${err.reason ?? err.error}`);
    }
    return res.json() as Promise<RegisterResult>;
  }

  async getAgent(agentId: string): Promise<AgentResult | null> {
    const res = await fetch(`${this.baseUrl}/agent/${agentId}`);
    if (res.status === 404) return null;
    const body = await res.json() as { found: boolean; agent?: AgentResult };
    return body.found ? body.agent! : null;
  }

  // ─── Storage (x402 payment required) ─────────────────────────────────────

  async store(agentId: string, data: string, metadata?: StoreMeta): Promise<StoreResult> {
    const body = { agentId, data, ...(metadata ? { metadata } : {}) };

    // First attempt — get payment requirements
    const probe = await this._post('/agent/store', body);
    if (probe.status === 402) {
      const requirements = await probe.json() as PaymentRequirements;
      const payment = await this._signPayment(requirements);
      const paid = await this._post('/agent/store', body, { 'x-payment': payment });
      if (!paid.ok) {
        const err = await paid.json() as Record<string, unknown>;
        throw new Error(`Store failed: ${err.reason ?? err.error}`);
      }
      return paid.json() as Promise<StoreResult>;
    }

    if (!probe.ok) {
      const err = await probe.json() as Record<string, unknown>;
      throw new Error(`Store failed: ${err.reason ?? err.error}`);
    }
    return probe.json() as Promise<StoreResult>;
  }

  async retrieve(id: string): Promise<RetrieveResult> {
    // First attempt — get payment requirements
    const probe = await fetch(`${this.baseUrl}/agent/retrieve/${id}`);
    if (probe.status === 402) {
      const requirements = await probe.json() as PaymentRequirements;
      const payment = await this._signPayment(requirements);
      const paid = await fetch(`${this.baseUrl}/agent/retrieve/${id}`, {
        headers: { 'x-payment': payment },
      });
      if (!paid.ok) {
        const err = await paid.json() as Record<string, unknown>;
        throw new Error(`Retrieve failed: ${err.reason ?? err.error}`);
      }
      const result = await paid.json() as { success: boolean } & RetrieveResult;
      return result;
    }

    if (!probe.ok) {
      const err = await probe.json() as Record<string, unknown>;
      throw new Error(`Retrieve failed (${probe.status}): ${err.reason ?? err.error}`);
    }
    const result = await probe.json() as { success: boolean } & RetrieveResult;
    return result;
  }

  // ─── Free endpoints ────────────────────────────────────────────────────────

  async verify(pieceCid: string): Promise<VerifyResult> {
    const res = await fetch(`${this.baseUrl}/agent/verify/${pieceCid}`);
    return res.json() as Promise<VerifyResult>;
  }

  async getAudit(agentId: string): Promise<AuditResult> {
    const res = await fetch(`${this.baseUrl}/agent/audit/${agentId}`);
    return res.json() as Promise<AuditResult>;
  }

  async getVaults(agentId: string): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/agent/vaults/${agentId}`);
    const body = await res.json() as { vaults: unknown[] };
    return body.vaults;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private _post(path: string, body: unknown, headers?: Record<string, string>) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  /**
   * Sign an EIP-3009 TransferWithAuthorization for the given requirements.
   * Falls back to a placeholder when no account is configured (mock mode).
   */
  private async _signPayment(requirements: PaymentRequirements): Promise<string> {
    const nonce = `0x${randomBytes(32).toString('hex')}`;
    const validBefore = String(Math.floor(Date.now() / 1000) + 300); // 5 min window

    if (!this.account) {
      // No private key — server must be in X402_MOCK=true mode
      return JSON.stringify({
        from:        '0x0000000000000000000000000000000000000000',
        to:          requirements.payTo,
        value:       requirements.maxAmountRequired,
        validAfter:  '0',
        validBefore,
        nonce,
        signature:   '0xmock',
        token:       requirements.tokenAddress,
      });
    }

    // Full EIP-3009 TransferWithAuthorization signature
    const signature = await this.account.signTypedData({
      domain: {
        name:              'USD for Filecoin Community',
        version:           '1',
        chainId:           requirements.chainId,
        verifyingContract: requirements.tokenAddress as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from',        type: 'address' },
          { name: 'to',          type: 'address' },
          { name: 'value',       type: 'uint256' },
          { name: 'validAfter',  type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce',       type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from:        this.account.address,
        to:          requirements.payTo          as `0x${string}`,
        value:       BigInt(requirements.maxAmountRequired),
        validAfter:  BigInt(0),
        validBefore: BigInt(validBefore),
        nonce:       nonce as `0x${string}`,
      },
    });

    return JSON.stringify({
      from:        this.account.address,
      to:          requirements.payTo,
      value:       requirements.maxAmountRequired,
      validAfter:  '0',
      validBefore,
      nonce,
      signature,
      token:       requirements.tokenAddress,
    });
  }
}
