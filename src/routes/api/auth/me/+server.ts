import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { loadUserPublic } from '$lib/server/auth/session';
import { clearAuthCookies } from '$lib/server/auth/cookies';

export const GET: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) return json({ user: null });

  const user = await loadUserPublic(locals.user.sub);
  if (!user) {
    // Token signed for a user that no longer exists; clear stale cookies.
    clearAuthCookies(cookies);
    return json({ user: null });
  }

  return json({
    user: {
      ...user,
      orgRoles: locals.user.org_roles,
      opRoles: locals.user.op_roles
    }
  });
};
