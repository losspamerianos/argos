import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { operations } from '$lib/server/db/schema';
import { canAccessOperation } from '$lib/server/auth/rbac';

export const load: LayoutServerLoad = async ({ params, locals, parent }) => {
  const parentData = await parent();

  const [op] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.organizationId, parentData.organization.id),
        eq(operations.slug, params.opSlug)
      )
    )
    .limit(1);

  if (!op) throw error(404, 'operation_not_found');

  if (locals.user && !canAccessOperation(locals.user, params.orgSlug, params.opSlug)) {
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
