import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { loadUserPublic } from '$lib/server/auth/session';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ user: null });

  const user = await loadUserPublic(locals.user.sub);
  if (!user) return json({ user: null });

  return json({
    user: {
      ...user,
      orgRoles: locals.user.org_roles,
      opRoles: locals.user.op_roles
    }
  });
};
