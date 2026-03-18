import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../utils/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Success path
  // ---------------------------------------------------------------------------

  describe('success path', () => {
    it('returns the resolved value on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns the value when the function succeeds on second attempt', async () => {
      let calls = 0;
      const fn = vi.fn().mockImplementation(() => {
        calls += 1;
        if (calls < 2) return Promise.reject(new Error('transient'));
        return Promise.resolve('success');
      });

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
      // Advance past the first retry delay (100ms * 2^0 = 100ms)
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('returns the value when the function succeeds on the final attempt', async () => {
      let calls = 0;
      const fn = vi.fn().mockImplementation(() => {
        calls += 1;
        if (calls < 3) return Promise.reject(new Error('transient'));
        return Promise.resolve('final');
      });

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
      // delay after attempt 1: 100ms, delay after attempt 2: 200ms
      await vi.advanceTimersByTimeAsync(300);
      const result = await promise;

      expect(result).toBe('final');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Failure path
  // ---------------------------------------------------------------------------

  describe('failure path', () => {
    it('re-throws the last error after exhausting all attempts', async () => {
      const boom = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(boom);

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
      // Attach rejection handler before advancing timers to prevent unhandled rejection
      const assertion = expect(promise).rejects.toThrow('persistent failure');
      // total delay: 100 + 200 = 300ms
      await vi.advanceTimersByTimeAsync(300);
      await assertion;
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('calls fn exactly maxAttempts times before giving up', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const promise = withRetry(fn, { maxAttempts: 5, baseDelayMs: 10 });
      // Attach catch before advancing timers to prevent unhandled rejection
      const caught = promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10 + 20 + 40 + 80); // 4 delays for 5 attempts
      await caught;

      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Delay behaviour (exponential backoff)
  // ---------------------------------------------------------------------------

  describe('exponential backoff delays', () => {
    it('does not delay before the first attempt', async () => {
      const fn = vi.fn().mockResolvedValue(42);
      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });

      // Should resolve immediately without advancing timers
      const result = await promise;
      expect(result).toBe(42);
    });

    it('waits baseDelay * 2^0 after the first failure', async () => {
      let calls = 0;
      const fn = vi.fn().mockImplementation(() => {
        calls++;
        if (calls === 1) return Promise.reject(new Error('fail1'));
        return Promise.resolve('ok');
      });

      const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 500 });

      // Should not have resolved yet (waiting 500ms)
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toBe('ok');
    });
  });

  // ---------------------------------------------------------------------------
  // Default options
  // ---------------------------------------------------------------------------

  describe('default options', () => {
    it('uses maxAttempts=3 and baseDelayMs=1000 by default', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const promise = withRetry(fn);
      // Attach catch before advancing timers to prevent unhandled rejection
      const caught = promise.catch(() => {});
      // delays: 1000ms + 2000ms = 3000ms total for 3 attempts
      await vi.advanceTimersByTimeAsync(3000);
      await caught;

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
