import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sightings, sites } from '$lib/server/db/schema';
import { geoAsGeoJSON, pointFromLonLat } from '$lib/server/db/postgis';
import { canManageSites } from '$lib/server/auth/rbac';
import { sightingsUpdateLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';
import {
  loadOpContext,
  loadOpContextForWrite,
  readJsonBody,
  requireUuidParam
} from '$lib/server/api/op-context';
import { parseUpdateSightingPayload } from '$lib/server/api/validators/sighting-update';
import { sightingRowToFeature } from '$lib/server/api/geo';
import type { SightingRow } from '$lib/server/api/geo';

/**
 * Single-row SELECT shape, mirrors the collection endpoint so the row maps
 * one-to-one through `sightingRowToFeature`.
 */
const SIGHTING_SELECT = {
  id: sightings.id,
  ts: sightings.ts,
  siteId: sightings.siteId,
  description: sightings.description,
  attributes: sightings.attributes,
  pointGeoJSON: geoAsGeoJSON(sightings.point)
} as const;

/**
 * Edit + delete go through `canManageSites` (coordinator / data_manager /
 * admin) — observers can record sightings but cannot mutate or remove
 * after the fact. Owner-based RBAC (observer edits their own record) is
 * Phase-2 work.
 */
const SIGHTING_WRITE_FORBIDDEN_CODE = 'forbidden_sighting_write';

export const GET: RequestHandler = async (event) => {
  const ctx = await loadOpContext(event);
  const sightingId = requireUuidParam(event.params.sightingId, 'sighting_not_found');

  const [row] = await db
    .select(SIGHTING_SELECT)
    .from(sightings)
    .where(and(eq(sightings.id, sightingId), eq(sightings.operationId, ctx.op.id)))
    .limit(1);
  if (!row) throw error(404, 'sighting_not_found');

  return json({ sighting: sightingRowToFeature(row as unknown as SightingRow) });
};

export const PATCH: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(event, canManageSites, SIGHTING_WRITE_FORBIDDEN_CODE);
  const sightingId = requireUuidParam(event.params.sightingId, 'sighting_not_found');

  // Shared key with DELETE: one bucket caps the combined "non-create
  // sighting write" rate at ~20/min per principal+op. Consumed BEFORE
  // body-parse so a malformed-body spammer still pays the token cost —
  // the inverse choice (parse first, consume on valid) would let a
  // logged-in principal flood with cheap garbage payloads.
  if (!sightingsUpdateLimiter.consume(`sightings:write-extra:${ctx.user.sub}:${ctx.op.id}`)) {
    throw error(429, 'rate_limited');
  }

  const body = await readJsonBody(event);
  const parsed = parseUpdateSightingPayload(body);
  if (!parsed.ok) throw error(400, parsed.code);
  const update = parsed.value;

  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(SIGHTING_SELECT)
      .from(sightings)
      .where(and(eq(sightings.id, sightingId), eq(sightings.operationId, ctx.op.id)))
      .for('update')
      .limit(1);
    if (!before) return { error: 'sighting_not_found' as const };

    // Cross-tenant guard for a new siteId — inside the tx with `FOR SHARE`
    // so an org-admin somewhere else cannot reassign the site's
    // operationId between our check and our UPDATE. `FOR SHARE` is a
    // weaker lock (it permits concurrent reads, blocks writes) which is
    // exactly what we want: we are not mutating the site, just asserting
    // its current owner.
    if (update.siteId !== undefined && update.siteId !== null) {
      const [siteOk] = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, update.siteId), eq(sites.operationId, ctx.op.id)))
        .for('share')
        .limit(1);
      if (!siteOk) return { error: 'site_not_in_operation' as const };
    }

    const set: Record<string, unknown> = {};
    if (Object.hasOwn(update, 'ts')) {
      // Validator rejects `ts: null` (column is NOT NULL); `update.ts`
      // is always a non-null ISO string here.
      set.ts = new Date(update.ts as string);
    }
    if (Object.hasOwn(update, 'siteId')) {
      set.siteId = update.siteId ?? null;
    }
    if (Object.hasOwn(update, 'description')) {
      set.description = update.description ?? null;
    }
    if (Object.hasOwn(update, 'attributes')) {
      set.attributes = update.attributes;
    }
    if (Object.hasOwn(update, 'lon') || Object.hasOwn(update, 'lat')) {
      set.point =
        typeof update.lon === 'number' && typeof update.lat === 'number'
          ? (pointFromLonLat(update.lon, update.lat) as never)
          : null;
    }

    const [after] = await tx
      .update(sightings)
      .set(set)
      .where(and(eq(sightings.id, sightingId), eq(sightings.operationId, ctx.op.id)))
      .returning(SIGHTING_SELECT);
    if (!after) return { error: 'db_error' as const };

    return { before, after };
  });

  if ('error' in result) {
    const code = result.error;
    const status =
      code === 'sighting_not_found' ? 404
        : code === 'site_not_in_operation' ? 400
          : 500;
    throw error(status, code);
  }

  const feature = sightingRowToFeature(result.after as unknown as SightingRow);

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'sighting',
    entityId: sightingId,
    action: 'update',
    before: rowSnapshot(result.before as unknown as SightingRow),
    after: rowSnapshot(result.after as unknown as SightingRow),
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  return json({ sighting: feature });
};

export const DELETE: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(event, canManageSites, SIGHTING_WRITE_FORBIDDEN_CODE);
  const sightingId = requireUuidParam(event.params.sightingId, 'sighting_not_found');

  if (!sightingsUpdateLimiter.consume(`sightings:write-extra:${ctx.user.sub}:${ctx.op.id}`)) {
    throw error(429, 'rate_limited');
  }

  // SELECT-then-DELETE inside one tx so the audit `before` reflects the
  // exact row we removed. `leads.source_sighting_id` is `ON DELETE SET
  // NULL` (schema/events.ts:44), so an FK reference will not abort —
  // the lead survives with a nulled back-reference. **Known gap**: that
  // null-side-effect is *not* itself audited. Phase 2 (when leads land)
  // should either emit a synthetic audit entry per affected lead, or
  // include `affectedLeads: [ids…]` in this row's `before` snapshot.
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(SIGHTING_SELECT)
      .from(sightings)
      .where(and(eq(sightings.id, sightingId), eq(sightings.operationId, ctx.op.id)))
      .for('update')
      .limit(1);
    if (!before) return { error: 'sighting_not_found' as const };

    // `.returning({id})` so we can verify the DELETE actually hit a row.
    // Without it the driver gives us a truthy empty array on success which
    // would mask a "phantom delete" if the SELECT-FOR-UPDATE guard ever
    // gets removed in a refactor.
    const deleted = await tx
      .delete(sightings)
      .where(and(eq(sightings.id, sightingId), eq(sightings.operationId, ctx.op.id)))
      .returning({ id: sightings.id });
    if (deleted.length === 0) return { error: 'db_error' as const };

    return { before };
  });

  if ('error' in result) {
    throw error(result.error === 'sighting_not_found' ? 404 : 500, result.error);
  }

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'sighting',
    entityId: sightingId,
    action: 'delete',
    before: rowSnapshot(result.before as unknown as SightingRow),
    after: null,
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  // 204 No Content — there's nothing left to return.
  return new Response(null, { status: 204 });
};

/**
 * Project a SELECT row into the audit-friendly shape (lon/lat as numbers,
 * not raw EWKB; PostGIS geometry is opaque to the audit consumer).
 */
function rowSnapshot(row: SightingRow): Record<string, unknown> {
  const feature = sightingRowToFeature(row);
  // `feature.geometry` is `GeoPoint | null` per the type — the optional-
  // chain short-circuit handles the null case; no `?.` on `coordinates`
  // is needed because GeoPoint guarantees the tuple.
  const lon = feature.geometry ? feature.geometry.coordinates[0] : null;
  const lat = feature.geometry ? feature.geometry.coordinates[1] : null;
  return {
    ts: feature.properties.ts,
    siteId: feature.properties.siteId,
    description: feature.properties.description,
    attributes: feature.properties.attributes,
    lon,
    lat
  };
}
