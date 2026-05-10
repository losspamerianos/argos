import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { refreshTokens } from '$lib/server/db/schema';
import { hashRefreshToken } from '$lib/server/auth/jwt';
import { audit } from '$lib/server/audit';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const raw = cookies.get('argos_refresh');
  if (raw) {
    const hash = hashRefreshToken(raw);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hash));
  }

  cookies.delete('argos_access', { path: '/' });
  cookies.delete('argos_refresh', { path: '/' });

  if (locals.user) {
    await audit({
      actorUserId: locals.user.sub,
      entityType: 'session',
      entityId: locals.user.sub,
      action: 'logout'
    });
  }

  return json({ ok: true });
};
