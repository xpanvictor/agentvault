/**
 * Exponential backoff retry utility.
 *
 * Delays between attempts: baseDelayMs * 2^(attempt-1)
 * With defaults (maxAttempts=3, baseDelayMs=1000): 1s → 2s → 4s
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first try). Default: 3 */
  maxAttempts?: number;
  /** Base delay in milliseconds. Default: 1000 */
  baseDelayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await delay(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError;
}
