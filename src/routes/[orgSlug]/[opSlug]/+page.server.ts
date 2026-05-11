import type { PageServerLoad } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sightings, sites } from '$lib/server/db/schema';
import { geoAsGeoJSON } from '$lib/server/db/postgis';
import { canManageSites } from '$lib/server/auth/rbac';
import {
  sightingRowToFeature,
  siteRowToFeature,
  toFeatureCollection,
  type SightingRow,
  type SiteRow
} from '$lib/server/api/geo';

const SIGHTINGS_INITIAL_LIMIT = 100;

export const load: PageServerLoad = async ({ parent, locals, params }) => {
  const parentData = await parent();
  const opId = parentData.operation.id;
  // Reuse the same RBAC predicate the API endpoint uses, so the UI affordance
  // (the "+ Site" button) and the server-side permission check cannot drift.
  const canCreateSite = canManageSites(locals.user, params.orgSlug, params.opSlug);

  const [siteRows, sightingRows] = await Promise.all([
    db
      .select({
        id: sites.id,
        name: sites.name,
        kind: sites.kind,
        lifecycleState: sites.lifecycleState,
        sectorId: sites.sectorId,
        attributes: sites.attributes,
        createdAt: sites.createdAt,
        pointGeoJSON: geoAsGeoJSON(sites.point)
      })
      .from(sites)
      .where(eq(sites.operationId, opId))
      .orderBy(desc(sites.createdAt)),
    db
      .select({
        id: sightings.id,
        ts: sightings.ts,
        siteId: sightings.siteId,
        description: sightings.description,
        attributes: sightings.attributes,
        pointGeoJSON: geoAsGeoJSON(sightings.point)
      })
      .from(sightings)
      .where(eq(sightings.operationId, opId))
      .orderBy(desc(sightings.ts))
      .limit(SIGHTINGS_INITIAL_LIMIT)
  ]);

  return {
    sites: toFeatureCollection((siteRows as unknown as SiteRow[]).map(siteRowToFeature)),
    sightings: toFeatureCollection(
      (sightingRows as unknown as SightingRow[]).map(sightingRowToFeature)
    ),
    canCreateSite
  };
};
