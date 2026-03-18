import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from '../services/rateLimit.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic allow / block behaviour
  // ---------------------------------------------------------------------------

  describe('check() — basic allow/block', () => {
    it('allows the first request', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
      const result = limiter.check('agent_a');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('allows up to maxRequests within the window', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });

      expect(limiter.check('agent_b').allowed).toBe(true);
      expect(limiter.check('agent_b').allowed).toBe(true);
      expect(limiter.check('agent_b').allowed).toBe(true);
    });

    it('blocks the (maxRequests+1)th request', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });

      limiter.check('agent_c');
      limiter.check('agent_c');
      limiter.check('agent_c');
      const blocked = limiter.check('agent_c');

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('counts different keys independently', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

      expect(limiter.check('agent_x').allowed).toBe(true);
      expect(limiter.check('agent_y').allowed).toBe(true);
      expect(limiter.check('agent_x').allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Window expiry (sliding reset)
  // ---------------------------------------------------------------------------

  describe('check() — window expiry', () => {
    it('resets the counter after the window expires', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 });

      limiter.check('agent_d');
      limiter.check('agent_d');
      expect(limiter.check('agent_d').allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(10_001);

      const result = limiter.check('agent_d');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // resetAt field
  // ---------------------------------------------------------------------------

  describe('check() — resetAt', () => {
    it('returns a resetAt timestamp in the future', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
      const now = Date.now();
      const { resetAt } = limiter.check('agent_e');

      expect(resetAt).toBeGreaterThan(now);
      expect(resetAt).toBeLessThanOrEqual(now + 60_000);
    });

    it('returns consistent resetAt within the same window', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

      const r1 = limiter.check('agent_f');
      vi.advanceTimersByTime(1_000);
      const r2 = limiter.check('agent_f');

      expect(r1.resetAt).toBe(r2.resetAt);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears the window so the next request is allowed again', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

      limiter.check('agent_g');
      expect(limiter.check('agent_g').allowed).toBe(false);

      limiter.reset('agent_g');

      expect(limiter.check('agent_g').allowed).toBe(true);
    });

    it('is a no-op for unknown keys (does not throw)', () => {
      const limiter = new RateLimiter();
      expect(() => limiter.reset('nobody')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Default options
  // ---------------------------------------------------------------------------

  describe('default options', () => {
    it('defaults to 60 requests per 60-second window', () => {
      const limiter = new RateLimiter();

      // First request: remaining should be 59
      const result = limiter.check('agent_default');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });
  });

  // ---------------------------------------------------------------------------
  // Expired window pruning (memory leak prevention)
  // ---------------------------------------------------------------------------

  describe('pruneExpired()', () => {
    it('removes stale windows when any key rolls over', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 10_000 });

      // Create windows for several agents
      limiter.check('agent_p1');
      limiter.check('agent_p2');
      limiter.check('agent_p3');
      expect(limiter.size).toBe(3);

      // Advance past the window so all entries are stale
      vi.advanceTimersByTime(10_001);

      // Triggering a check on any key rolls over its window and prunes the rest
      limiter.check('agent_p1');

      // Only agent_p1's fresh window remains
      expect(limiter.size).toBe(1);
    });

    it('does not prune windows that are still active', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 10_000 });

      limiter.check('agent_q1');
      limiter.check('agent_q2');

      // Advance only halfway through the window
      vi.advanceTimersByTime(5_000);

      // Roll over agent_q1 by advancing past its window from a new reference
      vi.advanceTimersByTime(5_001);

      limiter.check('agent_q1'); // triggers prune

      // agent_q2 is also expired (10s total elapsed) — both pruned, q1 re-added
      expect(limiter.size).toBe(1);
    });
  });
});
