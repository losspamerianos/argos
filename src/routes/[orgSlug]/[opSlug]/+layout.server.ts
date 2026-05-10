import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { operations } from '$lib/server/db/schema';
import { canAccessOperation } from '$lib/server/auth/rbac';
import { isValidSlug } from '$lib/server/reserved';
import { geoAsGeoJSON, parseGeoJSONPolygon } from '$lib/server/db/postgis';

export const load: LayoutServerLoad = async ({ params, locals, parent, url }) => {
  if (!isValidSlug(params.opSlug)) throw error(404, 'operation_not_found');

  if (!locals.user) {
    throw redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  const parentData = await parent();

  const [op] = await db
    .select({
      id: operations.id,
      slug: operations.slug,
      name: operations.name,
      defaultLocale: operations.defaultLocale,
      aoGeoJSON: geoAsGeoJSON(operations.aoPolygon)
    })
    .from(operations)
    .where(
      and(
        eq(operations.organizationId, parentData.organization.id),
        eq(operations.slug, params.opSlug)
      )
    )
    .limit(1);

  if (!op) throw error(404, 'operation_not_found');

  if (!canAccessOperation(locals.user, params.orgSlug, params.opSlug)) {
    throw error(403, 'no_access_to_operation');
  }

  return {
    operation: {
      id: op.id,
      slug: op.slug,
      name: op.name,
      defaultLocale: op.defaultLocale,
      aoPolygon: parseGeoJSONPolygon(op.aoGeoJSON ?? null)
    }
  };
};
