import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens, users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  generateRefreshToken,
  signAccessToken
} from '$lib/server/auth/jwt';
import { buildAccessClaims, loadUserPublic } from '$lib/server/auth/session';
import { audit } from '$lib/server/audit';

type LoginBody = { email?: string; password?: string };

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  if (!body?.email || !body?.password) {
    throw error(400, 'email_and_password_required');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase().trim()))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
    throw error(401, 'invalid_credentials');
  }

  const claims = await buildAccessClaims(user.id);
  const accessToken = await signAccessToken(claims);
  const refresh = generateRefreshToken();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
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
  cookies.set('argos_refresh', refresh.raw, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: REFRESH_TTL_SECONDS
  });

  await audit({
    actorUserId: user.id,
    entityType: 'session',
    entityId: user.id,
    action: 'login'
  });

  const publicUser = await loadUserPublic(user.id);
  return json({
    user: publicUser,
    accessToken,
    refreshToken: refresh.raw
  });
};
