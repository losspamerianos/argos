import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens, users } from '$lib/server/db/schema';
import { getDummyHash, verifyPassword } from '$lib/server/auth/password';
import { generateRefreshToken, signAccessToken } from '$lib/server/auth/jwt';
import { buildAccessClaims, loadUserPublic } from '$lib/server/auth/session';
import { setAuthCookies } from '$lib/server/auth/cookies';
import { loginEmailLimiter, loginIpLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, locals }) => {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!body?.email || !body?.password) {
    throw error(400, 'email_and_password_required');
  }

  const email = body.email.toLowerCase().trim();
  const ip = getClientAddress();
  const ua = (request.headers.get('user-agent') ?? '').slice(0, UA_MAX);

  // Per-IP exhaustion: 429 (this is a connection property, not an identity claim).
  if (!loginIpLimiter.consume(`login:ip:${ip}`)) throw error(429, 'rate_limited');
  // Per-email exhaustion: surface as 401 invalid_credentials so an attacker
  // probing email-buckets cannot distinguish "rate limited because account
  // exists and is being attacked" from "wrong password".
  if (!loginEmailLimiter.consume(`login:email:${email}`)) {
    await audit({
      actorUserId: null,
      entityType: 'session',
      entityId: email,
      action: 'login_failed',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    throw error(401, 'invalid_credentials');
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Constant-time verify against a dummy hash when the user does not exist.
  const stored = user?.passwordHash ?? (await getDummyHash());
  const ok = await verifyPassword(stored, body.password);

  if (!user || !ok) {
    await audit({
      actorUserId: user?.id ?? null,
      entityType: 'session',
      entityId: email,
      action: 'login_failed',
      requestId: locals.requestId,
      ipAddress: ip,
      userAgent: ua
    });
    throw error(401, 'invalid_credentials');
  }

  const claims = await buildAccessClaims(user.id);
  const accessToken = await signAccessToken(claims);
  const refresh = generateRefreshToken();

  await db.insert(refreshTokens).values({
    id: refresh.id,
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: refresh.expiresAt,
    familyId: refresh.familyId,
    parentId: refresh.parentId,
    userAgent: ua || null,
    ipAddress: ip || null
  });

  setAuthCookies(cookies, accessToken, refresh.raw);

  await audit({
    actorUserId: user.id,
    entityType: 'session',
    entityId: refresh.familyId,
    action: 'login',
    requestId: locals.requestId,
    ipAddress: ip,
    userAgent: ua
  });

  const publicUser = await loadUserPublic(user.id);
  // No tokens in body — cookie-only for browser clients.
  return json({ user: publicUser });
};
