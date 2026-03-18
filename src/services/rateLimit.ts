/**
 * RateLimiter — sliding window rate limiter keyed by agentId.
 *
 * Applied to paid endpoints (store, retrieve) to prevent abuse.
 * Default: 60 requests per 60-second window per agent.
 * Backed by an in-memory Map; resets on server restart.
 *
 * Memory management: expired windows are pruned whenever any key's window
 * rolls over, so the map stays bounded to the number of recently active
 * agents rather than growing without bound.
 */

export interface RateLimitOptions {
  /** Length of the rate-limit window in milliseconds. Default: 60_000 (1 min) */
  windowMs?: number;
  /** Maximum requests allowed within the window. Default: 60 */
  maxRequests?: number;
}

interface Window {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Unix timestamp (ms) when the current window resets. */
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(opts: RateLimitOptions = {}) {
    this.windowMs = opts.windowMs ?? 60_000;
    this.maxRequests = opts.maxRequests ?? 60;
  }

  /**
   * Check whether `key` is within its rate limit and increment the counter.
   * Returns whether the request is allowed and how many remain.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const existing = this.windows.get(key);

    // No window, or window has expired — start a fresh one and prune stale entries
    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      this.pruneExpired(now);
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: now + this.windowMs,
      };
    }

    const resetAt = existing.windowStart + this.windowMs;

    if (existing.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      resetAt,
    };
  }

  /** Remove a key's window (useful in tests). */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Number of active (non-expired) windows currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  /**
   * Delete all windows whose expiry time has passed.
   * Called automatically on every window rollover so the map stays bounded.
   */
  private pruneExpired(now: number): void {
    for (const [k, w] of this.windows) {
      if (now - w.windowStart >= this.windowMs) {
        this.windows.delete(k);
      }
    }
  }
}
