import type { RequestHandler } from './$types';
import { and, eq, isNull } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import { clearAuthCookies } from '$lib/server/auth/cookies';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

export const POST: RequestHandler = async ({ locals, cookies, request, getClientAddress }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, locals.user.sub), isNull(refreshTokens.revokedAt)));

  clearAuthCookies(cookies);

  await audit({
    actorUserId: locals.user.sub,
    entityType: 'session',
    entityId: locals.user.sub,
    action: 'session_revoked',
    requestId: locals.requestId,
    ipAddress: getClientAddress(),
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, UA_MAX)
  });

  return json({ ok: true });
};
