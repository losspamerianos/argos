/**
 * Per-process cache of `users.token_version` to avoid hitting the DB on every
 * authenticated request. The check in hooks.server.ts compares the JWT's `tv`
 * claim against this cache; on miss or stale entry we fall back to the DB.
 *
 * Trade-off: revoking a user's tokens via `/api/auth/sessions/revoke-all` only
 * invalidates *this process's* cache entry. Other replicas continue to honour
 * their cached `tv` until the entry's TTL elapses, so revocation has a worst-
 * case latency of TTL_MS across the fleet. ACCESS_TTL is 15 min, so a TTL of
 * 30 s here puts the recovery window well below half of an access JWT's life.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

type CacheEntry = { tv: number; expiresAt: number };

const TTL_MS = 30_000;
const MAX_ENTRIES = 50_000;
const cache = new Map<string, CacheEntry>();

function evictIfFull() {
  if (cache.size <= MAX_ENTRIES) return;
  const target = Math.floor(MAX_ENTRIES / 2);
  for (const key of cache.keys()) {
    if (cache.size <= target) break;
    cache.delete(key);
  }
}

/**
 * Returns the user's current `token_version` from cache (≤ TTL_MS old) or
 * fetches it from the DB. Returns `null` when the user does not exist.
 */
export async function getTokenVersion(userId: string): Promise<number | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.tv;

  const [row] = await db
    .select({ tv: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    cache.delete(userId);
    return null;
  }

  cache.set(userId, { tv: row.tv, expiresAt: now + TTL_MS });
  evictIfFull();
  return row.tv;
}

/** Clears this process's cached value for a single user (post-revoke). */
export function invalidateTokenVersion(userId: string): void {
  cache.delete(userId);
}
