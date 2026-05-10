import type { RequestHandler } from './$types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  type AccessClaims
} from '$lib/server/auth/jwt';
import { buildAccessClaims } from '$lib/server/auth/session';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '$lib/server/auth/cookies';
import { refreshCookieLimiter, refreshIpLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

type Outcome =
  | {
      kind: 'ok';
      userId: string;
      familyId: string;
      claims: Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>;
      freshRaw: string;
    }
  | { kind: 'no_token' }
  | { kind: 'expired' }
  | { kind: 'theft'; userId: string; familyId: string }
  | { kind: 'lost_race'; userId: string; familyId: string };

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, locals }) => {
  const ip = getClientAddress();
  if (!refreshIpLimiter.consume(`refresh:ip:${ip}`)) throw error(429, 'rate_limited');

  const raw = cookies.get(REFRESH_COOKIE);
  if (!raw) throw error(401, 'no_refresh_token');

  const hash = hashRefreshToken(raw);
  // Per-cookie throttle keyed by hash prefix — defangs shared-NAT DoS where a
  // single coworker exhausts the IP bucket for everyone behind the same egress.
  if (!refreshCookieLimiter.consume(`refresh:cookie:${hash.slice(0, 16)}`)) {
    throw error(429, 'rate_limited');
  }
  const ua = (request.headers.get('user-agent') ?? '').slice(0, UA_MAX);

  // Atomic rotation inside a single transaction. Lock order: USERS first, then
  // REFRESH_TOKENS — same order revoke-all uses (`UPDATE users` then
  // `UPDATE refresh_tokens`), so the two paths cannot deadlock on each other.
  //
  // Everything that depends on either lock — buildAccessClaims (reads
  // users.token_version), the new refresh-row INSERT, the access-JWT signing
  // — runs *inside* the tx so the locks are still held when the new artefacts
  // are created. A concurrent revoke-all blocks on the user-row lock until we
  // commit; if it ran first, our subsequent CAS finds a revoked row and we
  // fall into the lost_race branch.
  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    // Step 1: locate the token row only (no lock yet) so we know which user
    // owns it. We have no useful action without an owner.
    const tokenLookup = await tx.execute(
      sql`SELECT user_id AS "userId" FROM refresh_tokens
           WHERE token_hash = ${hash} LIMIT 1`
    );
    const tokenRow = (tokenLookup as unknown as Array<{ userId: string }>)[0];
    if (!tokenRow) return { kind: 'no_token' };

    // Step 2: lock the user row first.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${tokenRow.userId} FOR UPDATE`);

    // Step 3: now lock the token row. Any concurrent rotation against the
    // same token row blocks here.
    const locked = await tx.execute(
      sql`SELECT id, user_id AS "userId", family_id AS "familyId",
                 expires_at AS "expiresAt", revoked_at AS "revokedAt"
            FROM refresh_tokens
           WHERE token_hash = ${hash}
           LIMIT 1
           FOR UPDATE`
    );
    const row = (locked as unknown as Array<{
      id: string;
      userId: string;
      familyId: string;
      expiresAt: Date | string;
      revokedAt: Date | string | null;
    }>)[0];
    // Vanishingly small race: between step 1 and step 3 the row got deleted.
    // Treat as `no_token` to match the user-visible behaviour of "cookie not
    // recognised".
    if (!row) return { kind: 'no_token' };

    const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
    const revokedAt = row.revokedAt
      ? row.revokedAt instanceof Date
        ? row.revokedAt
        : new Date(row.revokedAt)
      : null;

    if (revokedAt !== null) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      return { kind: 'theft', userId: row.userId, familyId: row.familyId };
    }

    if (expiresAt.getTime() < Date.now()) {
      return { kind: 'expired' };
    }

    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    if (revoked.length === 0) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      return { kind: 'lost_race', userId: row.userId, familyId: row.familyId };
    }

    // Build the claim set on the SAME executor: the user row is locked here,
    // so the `tv` it returns is guaranteed not to drift before commit.
    // is_platform_admin is also re-read fresh, so a demoted user cannot
    // extend admin-flavoured access tokens via refresh.
    const claims = await buildAccessClaims(row.userId, tx);

    // Insert the new refresh row inside the same tx so revoke-all (which we
    // are still holding the user-row lock against) cannot interleave between
    // revoke and insert and miss the new row.
    const fresh = generateRefreshToken({ familyId: row.familyId, parentId: row.id });
    await tx.insert(refreshTokens).values({
      id: fresh.id,
      userId: row.userId,
      tokenHash: fresh.hash,
      expiresAt: fresh.expiresAt,
      familyId: fresh.familyId,
      parentId: fresh.parentId,
      userAgent: ua || null,
      ipAddress: ip || null
    });

    return {
      kind: 'ok',
      userId: row.userId,
      familyId: row.familyId,
      claims,
      freshRaw: fresh.raw
    };
  });

  if (outcome.kind === 'no_token') {
    clearAuthCookies(cookies);
    throw error(401, 'invalid_refresh_token');
  }
  if (outcome.kind === 'expired') {
    clearAuthCookies(cookies);
    throw error(401, 'refresh_expired');
  }
  if (outcome.kind === 'theft') {
    await audit({
      actorUserId: outcome.userId,
      entityType: 'session',
      entityId: outcome.familyId,
      action: 'session_theft_detected',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    clearAuthCookies(cookies);
    throw error(401, 'session_revoked');
  }
  if (outcome.kind === 'lost_race') {
    await audit({
      actorUserId: outcome.userId,
      entityType: 'session',
      entityId: outcome.familyId,
      action: 'session_revoked',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    clearAuthCookies(cookies);
    throw error(401, 'session_revoked');
  }

  // Everything that depended on locks happened inside the tx; now we just
  // sign the access JWT (no DB I/O) and set cookies.
  const accessToken = await signAccessToken(outcome.claims);
  setAuthCookies(cookies, accessToken, outcome.freshRaw);
  return json({ ok: true });
};
