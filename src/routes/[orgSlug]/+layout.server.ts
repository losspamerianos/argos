import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { organizations, operations } from '$lib/server/db/schema';
import { canAccessOrganization } from '$lib/server/auth/rbac';
import { isReservedOrgSlug, isValidSlug } from '$lib/server/reserved';

export const load: LayoutServerLoad = async ({ params, locals, url }) => {
  if (!isValidSlug(params.orgSlug) || isReservedOrgSlug(params.orgSlug)) {
    throw error(404, 'organization_not_found');
  }

  if (!locals.user) {
    throw redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, params.orgSlug))
    .limit(1);

  if (!org) throw error(404, 'organization_not_found');

  if (!canAccessOrganization(locals.user, org.slug)) {
    throw error(403, 'no_access_to_organization');
  }

  const orgOperations = await db
    .select({ slug: operations.slug, name: operations.name })
    .from(operations)
    .where(eq(operations.organizationId, org.id))
    .orderBy(asc(operations.name));

  return {
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      defaultLocale: org.defaultLocale
    },
    orgOperations
  };
};
