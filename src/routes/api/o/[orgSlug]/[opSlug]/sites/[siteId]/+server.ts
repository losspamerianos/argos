import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sites } from '$lib/server/db/schema';
import { geoAsGeoJSON, pointFromLonLat } from '$lib/server/db/postgis';
import { canManageSites } from '$lib/server/auth/rbac';
import { sitesUpdateLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';
import {
  loadOpContext,
  loadOpContextForWrite,
  readJsonBody,
  requireUuidParam
} from '$lib/server/api/op-context';
import { parseUpdateSitePayload } from '$lib/server/api/validators/site-update';
import { siteRowToFeature } from '$lib/server/api/geo';
import type { SiteRow } from '$lib/server/api/geo';

/**
 * Single-row SELECT shape used by both GET and PATCH so the returning rows
 * match `siteRowToFeature`'s expected fields exactly.
 */
const SITE_SELECT = {
  id: sites.id,
  name: sites.name,
  kind: sites.kind,
  lifecycleState: sites.lifecycleState,
  sectorId: sites.sectorId,
  attributes: sites.attributes,
  createdAt: sites.createdAt,
  pointGeoJSON: geoAsGeoJSON(sites.point)
} as const;

export const GET: RequestHandler = async (event) => {
  const ctx = await loadOpContext(event);
  const siteId = requireUuidParam(event.params.siteId, 'site_not_found');

  const [row] = await db
    .select(SITE_SELECT)
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.operationId, ctx.op.id)))
    .limit(1);
  if (!row) throw error(404, 'site_not_found');

  return json({ site: siteRowToFeature(row as unknown as SiteRow) });
};

export const PATCH: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(event, canManageSites, 'forbidden_site_write');
  const siteId = requireUuidParam(event.params.siteId, 'site_not_found');

  // Shared key with the transition endpoint: a single bucket caps the
  // combined "non-create site write" rate at ~20/min per principal+op,
  // matching the limiter's documented intent. Two separate keys would
  // silently double the practical ceiling.
  if (!sitesUpdateLimiter.consume(`sites:write-extra:${ctx.user.sub}:${ctx.op.id}`)) {
    throw error(429, 'rate_limited');
  }

  const body = await readJsonBody(event);
  const parsed = parseUpdateSitePayload(body);
  if (!parsed.ok) throw error(400, parsed.code);
  const update = parsed.value;

  // Fetch the BEFORE row in the same tx the update runs in. Three purposes:
  //   1. 404 the request if the site is not in this op (cross-tenant probe).
  //   2. Capture the before-state for the audit `before` payload, so the
  //      audit log can reconstruct what changed even if the row is later
  //      transitioned to archived and dropped from working sets.
  //   3. `for('update')` locks the row for the rest of the tx so a
  //      concurrent transition cannot mutate the row between our SELECT
  //      and our UPDATE — without it the audit `before` snapshot can
  //      diverge from the row the UPDATE actually displaced.
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(SITE_SELECT)
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.operationId, ctx.op.id)))
      .for('update')
      .limit(1);
    if (!before) return { error: 'site_not_found' as const };

    // Build the SET map — only touch fields the validator explicitly produced.
    // `updatedAt` always rolls forward so downstream readers can tell the row
    // was modified even if the visible fields look the same.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.name !== undefined) set.name = update.name;
    if (update.kind !== undefined) set.kind = update.kind;
    if (update.attributes !== undefined) set.attributes = update.attributes;
    if (Object.hasOwn(update, 'lon') || Object.hasOwn(update, 'lat')) {
      // Narrow on `typeof === 'number'` rather than `=== null` so a future
      // validator drift (e.g. allowing lon-only updates) surfaces as a
      // compile-time mismatch rather than silently feeding `undefined` into
      // `pointFromLonLat`. Today the validator guarantees both-or-neither.
      set.point =
        typeof update.lon === 'number' && typeof update.lat === 'number'
          ? (pointFromLonLat(update.lon, update.lat) as never)
          : null;
    }

    const [after] = await tx
      .update(sites)
      .set(set)
      .where(and(eq(sites.id, siteId), eq(sites.operationId, ctx.op.id)))
      .returning(SITE_SELECT);
    if (!after) return { error: 'db_error' as const };

    return { before, after };
  });

  if ('error' in result) {
    throw error(result.error === 'site_not_found' ? 404 : 500, result.error);
  }

  const feature = siteRowToFeature(result.after as unknown as SiteRow);

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'site',
    entityId: siteId,
    action: 'update',
    before: rowSnapshot(result.before as unknown as SiteRow),
    after: rowSnapshot(result.after as unknown as SiteRow),
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  return json({ site: feature });
};

/**
 * Project a SELECT row into the audit-friendly shape (lon/lat as numbers,
 * not raw EWKB; PostGIS geometry is opaque to the audit consumer).
 */
function rowSnapshot(row: SiteRow): Record<string, unknown> {
  const feature = siteRowToFeature(row);
  return {
    name: feature.properties.name,
    kind: feature.properties.kind,
    lifecycleState: feature.properties.lifecycleState,
    sectorId: feature.properties.sectorId,
    attributes: feature.properties.attributes,
    lon: feature.geometry?.coordinates[0] ?? null,
    lat: feature.geometry?.coordinates[1] ?? null
  };
}
