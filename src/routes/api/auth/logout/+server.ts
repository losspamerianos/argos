import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import { hashRefreshToken } from '$lib/server/auth/jwt';
import { REFRESH_COOKIE, clearAuthCookies } from '$lib/server/auth/cookies';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

export const POST: RequestHandler = async ({ cookies, request, locals, getClientAddress }) => {
  const raw = cookies.get(REFRESH_COOKIE);
  if (raw) {
    const hash = hashRefreshToken(raw);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hash));
  }

  clearAuthCookies(cookies);

  if (locals.user) {
    await audit({
      actorUserId: locals.user.sub,
      entityType: 'session',
      entityId: locals.user.sub,
      action: 'logout',
      requestId: locals.requestId,
      ipAddress: getClientAddress(),
      userAgent: (request.headers.get('user-agent') ?? '').slice(0, UA_MAX)
    });
  }

  return json({ ok: true });
};
