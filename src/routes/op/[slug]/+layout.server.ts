import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { operations } from '$lib/server/db/schema';
import { canAccessOperation } from '$lib/server/auth/rbac';

export const load: LayoutServerLoad = async ({ params, locals }) => {
  const [op] = await db
    .select()
    .from(operations)
    .where(eq(operations.slug, params.slug))
    .limit(1);

  if (!op) throw error(404, 'operation_not_found');

  // RBAC: when authenticated, require membership; anonymous read allowed in skeleton.
  if (locals.user && !canAccessOperation(locals.user, op.slug)) {
    throw error(403, 'no_access_to_operation');
  }

  return {
    operation: {
      id: op.id,
      slug: op.slug,
      name: op.name,
      defaultLocale: op.defaultLocale
    }
  };
};
