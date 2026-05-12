/**
 * Tiny in-memory token-bucket rate limiter. Per-process state — fine for a
 * single-instance deployment; for multi-replica setups, replace with a
 * Redis-backed bucket or a Postgres-backed sliding window.
 *
 * Hard memory cap: an attacker that spreads attempts across N distinct keys
 * would otherwise let the bucket map grow unbounded between cleanups. When the
 * map exceeds `MAX_KEYS`, we evict the LRU half and continue.
 */

type Bucket = { tokens: number; lastRefill: number };

const MAX_KEYS = 50_000;

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
      if (this.buckets.size > MAX_KEYS) this.evictLRU();
    } else {
      // Map.set on an existing key keeps insertion order; deleting + re-adding
      // moves it to the most-recently-used end (cheap LRU bookkeeping).
      this.buckets.delete(key);
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRate);
      bucket.lastRefill = now;
      this.buckets.set(key, bucket);
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

  private evictLRU(): void {
    // Evict the oldest half so the next overflow isn't immediately back here.
    const target = Math.floor(MAX_KEYS / 2);
    for (const key of this.buckets.keys()) {
      if (this.buckets.size <= target) break;
      this.buckets.delete(key);
    }
  }
}

// Login: 10 burst, 1 every 6 s sustained per IP; 5 burst, 1 every 12 s per email.
export const loginIpLimiter = new TokenBucket(10, 1 / 6);
export const loginEmailLimiter = new TokenBucket(5, 1 / 12);

// Refresh: more permissive (legitimate clients can hit this multiple times in a session).
export const refreshIpLimiter = new TokenBucket(20, 1 / 3);

// Per-refresh-cookie bucket: 30 burst, 1/s sustained. Defeats shared-NAT DoS
// by isolating a single cookie's rate from its IP's rate; combined with the
// IP bucket, each cookie still has to share the IP allowance.
export const refreshCookieLimiter = new TokenBucket(30, 1);

// Operational write endpoints (sites + sightings POST). The lowest-trust
// caller for sightings is any org-member, which makes "logged-in observer
// spam" a real storage-amplification path; sites are tighter (data_manager+).
// Keyed by `${user.sub}:${op.id}` so a single principal cannot also amplify
// across different ops they belong to.
// Sites: 10 burst, 1 every 6 s sustained (~10/min).
export const sitesWriteLimiter = new TokenBucket(10, 1 / 6);
// Sightings: 30 burst, 1 every 2 s sustained (~30/min) — higher because field
// crews log multiple sightings in a few minutes during a sweep.
export const sightingsWriteLimiter = new TokenBucket(30, 1 / 2);
// Site update + lifecycle transition: 20 burst, 1 every 3 s sustained
// (~20/min). Generous because a coordinator might triage a sweep's worth of
// sites in one session (status changes, edits) without that being abuse.
// Both endpoints consume from the SAME key (`sites:write-extra:${sub}:${op}`)
// so the cap is a combined rate, not 20 each.
export const sitesUpdateLimiter = new TokenBucket(20, 1 / 3);
// Sighting update + delete: 20 burst, 1 every 3 s. Same shape as the site
// limiter; coordinator-only RBAC keeps the abuse surface small. Both
// endpoints consume the SAME key `sightings:write-extra:${sub}:${op}` so
// PATCH + DELETE share one bucket.
export const sightingsUpdateLimiter = new TokenBucket(20, 1 / 3);
