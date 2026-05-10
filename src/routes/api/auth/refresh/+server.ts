import type { RequestHandler } from './$types';
import { and, eq, isNull } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken
} from '$lib/server/auth/jwt';
import { buildAccessClaims } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  let raw = cookies.get('argos_refresh') ?? null;
  if (!raw) {
    const body = (await request.json().catch(() => null)) as { refreshToken?: string } | null;
    raw = body?.refreshToken ?? null;
  }
  if (!raw) throw error(401, 'no_refresh_token');

  const hash = hashRefreshToken(raw);
  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!token) throw error(401, 'invalid_refresh_token');
  if (token.expiresAt.getTime() < Date.now()) throw error(401, 'refresh_expired');

  // Rotate: revoke old, mint new pair.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, token.id));

  const claims = await buildAccessClaims(token.userId);
  const accessToken = await signAccessToken(claims);
  const fresh = generateRefreshToken();

  await db.insert(refreshTokens).values({
    userId: token.userId,
    tokenHash: fresh.hash,
    expiresAt: fresh.expiresAt,
    userAgent: request.headers.get('user-agent') ?? null,
    ipAddress: getClientAddress() ?? null
  });

  const isProd = process.env.NODE_ENV === 'production';
  cookies.set('argos_access', accessToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: ACCESS_TTL_SECONDS
  });
  cookies.set('argos_refresh', fresh.raw, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: REFRESH_TTL_SECONDS
  });

  return json({ accessToken, refreshToken: fresh.raw });
};
