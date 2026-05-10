import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { buildAccessClaims, loadUserPublic } from '$lib/server/auth/session';
import { clearAuthCookies } from '$lib/server/auth/cookies';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) return json({ user: null });

  // Re-derive role maps + admin flag from the DB instead of trusting the JWT
  // claims. The JWT lives up to ACCESS_TTL (15 min) and would otherwise return
  // stale roles for a user whose grants were just revoked.
  const [user, claims] = await Promise.all([
    loadUserPublic(locals.user.sub),
    buildAccessClaims(locals.user.sub).catch(() => null)
  ]);
  if (!user || !claims) {
    // Token signed for a user that no longer exists; clear stale cookies.
    clearAuthCookies(cookies);
    return json({ user: null });
  }

  return json({
    user: {
      ...user,
      isPlatformAdmin: claims.is_platform_admin === true,
      orgRoles: claims.org_roles,
      opRoles: claims.op_roles
    }
  });
};
