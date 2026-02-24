import type { Config } from '../types/config.js';
import type { Payment } from '../types/storage.js';

/**
 * Payment requirements from provider
 * Re-exported from types for convenience
 */
export interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string;
  tokenAddress: string;
  chainId: number;
  resource?: string;
  description?: string;
}

/**
 * Verification response from FIL-x402
 */
export interface VerifyResponse {
  valid: boolean;
  riskScore: number;
  reason?: string;
  walletBalance?: string;
  pendingAmount?: string;
}

/**
 * FCR (Filecoin Consensus Reorg-resistance) status
 */
export interface FCRStatus {
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'LB';
  instance?: number;
  round?: number;
  phase?: number;
}

/**
 * Settlement response from FIL-x402
 */
export interface SettleResponse {
  success: boolean;
  paymentId: string;
  transactionCid?: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed' | 'retry';
  error?: string;
  fcr?: FCRStatus;
}

/**
 * X402 API Client
 *
 * Handles communication with FIL-x402 payment infrastructure.
 * Keeps AgentVault decoupled from payment implementation details.
 */
export class X402Client {
  private baseUrl: string;
  private timeout: number;

  constructor(config: Config) {
    this.baseUrl = config.x402.apiUrl;
    this.timeout = config.x402.timeout;
  }

  /**
   * Verify a payment signature and check if it's valid
   */
  async verifyPayment(
    payment: Payment,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment, requirements }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          valid: false,
          riskScore: 100,
          reason: `x402_api_error: ${response.status} - ${error}`,
        };
      }

      return await response.json() as VerifyResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          valid: false,
          riskScore: 100,
          reason: 'x402_api_timeout',
        };
      }
      return {
        valid: false,
        riskScore: 100,
        reason: `x402_api_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Settle a payment on-chain
   */
  async settlePayment(
    payment: Payment,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment, requirements }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          paymentId: '',
          status: 'failed',
          error: `x402_api_error: ${response.status} - ${error}`,
        };
      }

      return await response.json() as SettleResponse;
    } catch (error) {
      return {
        success: false,
        paymentId: '',
        status: 'failed',
        error: `x402_api_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Get settlement status
   */
  async getSettlementStatus(paymentId: string): Promise<SettleResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/settle/${paymentId}`);

      if (!response.ok) {
        return {
          success: false,
          paymentId,
          status: 'failed',
          error: `x402_api_error: ${response.status}`,
        };
      }

      return await response.json() as SettleResponse;
    } catch (error) {
      return {
        success: false,
        paymentId,
        status: 'failed',
        error: `x402_api_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Check if FIL-x402 service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (!response.ok) {
        return { healthy: false };
      }

      const data = await response.json() as Record<string, unknown>;
      return { healthy: true, details: data };
    } catch {
      return { healthy: false };
    }
  }

  /**
   * Get current storage price in USDFC
   * For now returns a fixed price, can be made dynamic later
   */
  getStoragePrice(sizeBytes: number): string {
    // Base price: $0.001 per KB
    const pricePerKb = 0.001;
    const sizeKb = Math.ceil(sizeBytes / 1024);
    const price = Math.max(pricePerKb * sizeKb, 0.01); // Minimum $0.01

    // Convert to USDFC units (6 decimals)
    const usdfcUnits = BigInt(Math.floor(price * 1_000_000));
    return usdfcUnits.toString();
  }
}
