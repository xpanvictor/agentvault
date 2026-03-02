import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { X402Client } from '../clients/x402.js';
import type { Config } from '../types/config.js';
import type { Payment } from '../types/storage.js';
import type { PaymentRequirements } from '../clients/x402.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConfig: Config = {
  server: { port: 3042, host: '127.0.0.1' },
  x402: { apiUrl: 'http://localhost:4402', timeout: 5000, mock: true },
  facilitator: { address: '0x0000000000000000000000000000000000000000' },
  storage: { provider: 'mock' },
  filecoin: {
    network: 'calibration',
    chainId: 314159,
    rpcUrl: 'wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1',
    usdfcAddress: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
  },
  identity: { enabled: false },
  logging: { level: 'error' },
};

const mockPayment: Payment = {
  from: '0xabc123',
  to: '0xdef456',
  value: '1000000',
  validAfter: '0',
  validBefore: '9999999999',
  nonce: 'abc123nonce',
  signature: '0xsig',
  token: '0xtoken',
};

const mockRequirements: PaymentRequirements = {
  payTo: '0xdef456',
  maxAmountRequired: '1000000',
  tokenAddress: '0xtoken',
  chainId: 314159,
  resource: '/agent/store',
  description: 'Store data on Filecoin',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

function mockFetchNetworkError(message = 'Network error'): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('X402Client', () => {
  let client: X402Client;

  beforeEach(() => {
    client = new X402Client(mockConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // verifyPayment
  // -------------------------------------------------------------------------

  describe('verifyPayment()', () => {
    it('returns valid=true on successful verification', async () => {
      mockFetch({ valid: true, riskScore: 5 });

      const result = await client.verifyPayment(mockPayment, mockRequirements);

      expect(result.valid).toBe(true);
      expect(result.riskScore).toBe(5);
    });

    it('sends correct payload to /verify', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true, riskScore: 0 }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchSpy);

      await client.verifyPayment(mockPayment, mockRequirements);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:4402/verify');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.payment).toEqual(mockPayment);
      expect(body.requirements).toEqual(mockRequirements);
    });

    it('returns valid=false with reason on non-ok HTTP response', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);

      const result = await client.verifyPayment(mockPayment, mockRequirements);

      expect(result.valid).toBe(false);
      expect(result.riskScore).toBe(100);
      expect(result.reason).toContain('x402_api_error');
      expect(result.reason).toContain('401');
    });

    it('returns valid=false with reason on network error', async () => {
      mockFetchNetworkError('Connection refused');

      const result = await client.verifyPayment(mockPayment, mockRequirements);

      expect(result.valid).toBe(false);
      expect(result.riskScore).toBe(100);
      expect(result.reason).toContain('x402_api_error');
      expect(result.reason).toContain('Connection refused');
    });

    it('returns valid=false with timeout reason on AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      // Use a very short timeout to trigger abort
      const fastConfig: Config = { ...mockConfig, x402: { ...mockConfig.x402, timeout: 1 } };
      const fastClient = new X402Client(fastConfig);

      const result = await fastClient.verifyPayment(mockPayment, mockRequirements);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('x402_api_timeout');
    });

    it('includes optional reason from API response', async () => {
      mockFetch({ valid: false, riskScore: 80, reason: 'insufficient_balance' });

      const result = await client.verifyPayment(mockPayment, mockRequirements);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('insufficient_balance');
    });
  });

  // -------------------------------------------------------------------------
  // settlePayment
  // -------------------------------------------------------------------------

  describe('settlePayment()', () => {
    it('returns success=true with paymentId on successful settlement', async () => {
      mockFetch({
        success: true,
        paymentId: 'pay_abc123',
        status: 'submitted',
        transactionCid: 'bafy...',
      });

      const result = await client.settlePayment(mockPayment, mockRequirements);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('pay_abc123');
      expect(result.status).toBe('submitted');
    });

    it('sends correct payload to /settle', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, paymentId: 'pay_1', status: 'pending' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchSpy);

      await client.settlePayment(mockPayment, mockRequirements);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:4402/settle');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.payment).toEqual(mockPayment);
      expect(body.requirements).toEqual(mockRequirements);
    });

    it('returns success=false with error on non-ok HTTP response', async () => {
      mockFetch({ error: 'Bad Request' }, 400);

      const result = await client.settlePayment(mockPayment, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('x402_api_error');
      expect(result.error).toContain('400');
    });

    it('returns success=false on network error', async () => {
      mockFetchNetworkError('ECONNREFUSED');

      const result = await client.settlePayment(mockPayment, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('x402_api_error');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('returns success=false on timeout (AbortError)', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      const result = await client.settlePayment(mockPayment, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // getSettlementStatus
  // -------------------------------------------------------------------------

  describe('getSettlementStatus()', () => {
    it('returns settlement status for a given paymentId', async () => {
      mockFetch({
        success: true,
        paymentId: 'pay_xyz',
        status: 'confirmed',
        transactionCid: 'bafy...',
      });

      const result = await client.getSettlementStatus('pay_xyz');

      expect(result.paymentId).toBe('pay_xyz');
      expect(result.status).toBe('confirmed');
    });

    it('calls correct URL with paymentId', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, paymentId: 'pay_xyz', status: 'confirmed' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchSpy);

      await client.getSettlementStatus('pay_xyz');

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:4402/settle/pay_xyz');
    });

    it('returns failed status on non-ok response', async () => {
      mockFetch({ error: 'Not Found' }, 404);

      const result = await client.getSettlementStatus('pay_unknown');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('x402_api_error');
    });

    it('returns failed status on network error', async () => {
      mockFetchNetworkError('DNS resolution failed');

      const result = await client.getSettlementStatus('pay_xyz');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // healthCheck
  // -------------------------------------------------------------------------

  describe('healthCheck()', () => {
    it('returns healthy=true with details on successful response', async () => {
      mockFetch({ status: 'ok', version: '1.2.3' });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.details).toEqual({ status: 'ok', version: '1.2.3' });
    });

    it('returns healthy=false on non-ok HTTP response', async () => {
      mockFetch({ error: 'Service Unavailable' }, 503);

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
    });

    it('returns healthy=false on network error', async () => {
      mockFetchNetworkError('Connection timeout');

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.details).toBeUndefined();
    });

    it('calls the correct /health endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchSpy);

      await client.healthCheck();

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe('http://localhost:4402/health');
    });
  });

  // -------------------------------------------------------------------------
  // getStoragePrice
  // -------------------------------------------------------------------------

  describe('getStoragePrice()', () => {
    it('returns minimum price for very small data', () => {
      // 100 bytes → 1 KB rounded up → $0.001 but minimum is $0.01
      const price = client.getStoragePrice(100);
      // Minimum $0.01 = 10_000 USDFC units
      expect(BigInt(price)).toBe(10_000n);
    });

    it('scales price with data size', () => {
      // 10 KB → $0.01 = 10_000 units
      const price10kb = client.getStoragePrice(10 * 1024);
      // 100 KB → $0.1 = 100_000 units
      const price100kb = client.getStoragePrice(100 * 1024);

      expect(BigInt(price100kb)).toBeGreaterThan(BigInt(price10kb));
    });

    it('returns a string of digits (valid BigInt representation)', () => {
      const price = client.getStoragePrice(1024);
      expect(price).toMatch(/^\d+$/);
      expect(() => BigInt(price)).not.toThrow();
    });

    it('1 KB is below minimum so costs $0.01 = 10_000 USDFC units', () => {
      // 1 KB → $0.001, but minimum is $0.01 → 10_000 units at 6 decimals
      const price = client.getStoragePrice(1024);
      expect(BigInt(price)).toBe(10_000n);
    });

    it('applies minimum price of $0.01 for 0 bytes', () => {
      const price = client.getStoragePrice(0);
      // 0 bytes → ceil(0/1024) = 0 KB → 0 * 0.001 = $0 → clamped to $0.01 = 10_000
      expect(BigInt(price)).toBe(10_000n);
    });
  });
});
