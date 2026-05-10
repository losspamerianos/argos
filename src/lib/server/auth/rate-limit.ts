/**
 * Tiny in-memory token-bucket rate limiter. Per-process state — fine for a
 * single-instance deployment; for multi-replica setups, replace with a
 * Redis-backed bucket or a Postgres-backed sliding window.
 */

type Bucket = { tokens: number; lastRefill: number };

class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();
  private cleanupAt = Date.now() + 60_000;

  constructor(
    /** Maximum burst size. */
    private readonly capacity: number,
    /** Sustained refill rate, in tokens per second. */
    private readonly refillRate: number
  ) {}

  /** Returns true if the request was allowed; false if the bucket is empty. */
  consume(key: string, cost = 1): boolean {
    this.maybeCleanup();
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRate);
      bucket.lastRefill = now;
    }
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now < this.cleanupAt) return;
    this.cleanupAt = now + 60_000;
    for (const [key, bucket] of this.buckets) {
      if ((now - bucket.lastRefill) / 1000 > 600) this.buckets.delete(key);
    }
  }
}

// Login: 10 burst, 1 every 6 s sustained per IP; 5 burst, 1 every 12 s per email.
export const loginIpLimiter = new TokenBucket(10, 1 / 6);
export const loginEmailLimiter = new TokenBucket(5, 1 / 12);

// Refresh: more permissive (legitimate clients can hit this multiple times in a session).
export const refreshIpLimiter = new TokenBucket(20, 1 / 3);
