import type { RequestHandler } from './$types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens, users } from '$lib/server/db/schema';
import { clearAuthCookies } from '$lib/server/auth/cookies';
import { invalidateTokenVersion } from '$lib/server/auth/token-version-cache';
import { audit } from '$lib/server/audit';

const UA_MAX = 512;

export const POST: RequestHandler = async ({ locals, cookies, request, getClientAddress }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  // Bump token_version FIRST so that already-issued access tokens fail the
  // hooks-server token-version check on their very next request, and revoke
  // every outstanding refresh-token row in the same transaction so a
  // concurrent rotate can't outrun the bump. The refresh handler holds a row
  // lock on `users.id` for the duration of its rotation, so this UPDATE
  // serialises against any in-flight rotation rather than racing it.
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, locals.user!.sub));
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, locals.user!.sub), isNull(refreshTokens.revokedAt)));
  });

  // Drop this process's cached `tv` so the very next authenticated request
  // re-fetches the bumped value. Other replicas catch up on cache TTL expiry.
  invalidateTokenVersion(locals.user.sub);

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
