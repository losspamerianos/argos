import type { RequestHandler } from './$types';
import { and, eq, isNull } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '$lib/server/auth/jwt';
import { buildAccessClaims } from '$lib/server/auth/session';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '$lib/server/auth/cookies';
import { refreshIpLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, locals }) => {
  const ip = getClientAddress();
  if (!refreshIpLimiter.consume(`refresh:ip:${ip}`)) throw error(429, 'rate_limited');

  const raw = cookies.get(REFRESH_COOKIE);
  if (!raw) throw error(401, 'no_refresh_token');

  const hash = hashRefreshToken(raw);
  const ua = (request.headers.get('user-agent') ?? '').slice(0, UA_MAX);

  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1);

  if (!token) {
    clearAuthCookies(cookies);
    throw error(401, 'invalid_refresh_token');
  }

  // Theft detection: presenting an already-revoked token signals reuse of a
  // rotated secret. Revoke the entire family and force re-login everywhere.
  if (token.revokedAt !== null) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, token.familyId), isNull(refreshTokens.revokedAt)));
    await audit({
      actorUserId: token.userId,
      entityType: 'session',
      entityId: token.familyId,
      action: 'session_theft_detected',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    clearAuthCookies(cookies);
    throw error(401, 'session_revoked');
  }

  if (token.expiresAt.getTime() < Date.now()) {
    clearAuthCookies(cookies);
    throw error(401, 'refresh_expired');
  }

  // Atomic rotation: only the one CAS-style winner proceeds; concurrent rotators
  // see 0 affected rows and we revoke the family conservatively.
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, token.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  if (revoked.length === 0) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, token.familyId), isNull(refreshTokens.revokedAt)));
    await audit({
      actorUserId: token.userId,
      entityType: 'session',
      entityId: token.familyId,
      action: 'session_revoked',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    clearAuthCookies(cookies);
    throw error(401, 'session_revoked');
  }

  const claims = await buildAccessClaims(token.userId);
  const accessToken = await signAccessToken(claims);
  const fresh = generateRefreshToken({ familyId: token.familyId, parentId: token.id });

  await db.insert(refreshTokens).values({
    id: fresh.id,
    userId: token.userId,
    tokenHash: fresh.hash,
    expiresAt: fresh.expiresAt,
    familyId: fresh.familyId,
    parentId: fresh.parentId,
    userAgent: ua || null,
    ipAddress: ip || null
  });

  setAuthCookies(cookies, accessToken, fresh.raw);
  return json({ ok: true });
};
