import type { RequestHandler } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sightings, sites } from '$lib/server/db/schema';
import { geoAsGeoJSON, pointFromLonLat } from '$lib/server/db/postgis';
import { canRecordSightings } from '$lib/server/auth/rbac';
import { sightingsWriteLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';
import {
  loadOpContext,
  loadOpContextForWrite,
  readJsonBody
} from '$lib/server/api/op-context';
import { parseCreateSightingPayload } from '$lib/server/api/validators/sighting';
import { sightingRowToFeature, toFeatureCollection } from '$lib/server/api/geo';
import type { SightingRow } from '$lib/server/api/geo';

const LIMIT_DEFAULT = 100;
const LIMIT_MAX = 500;

export const GET: RequestHandler = async (event) => {
  const ctx = await loadOpContext(event);

  const rawLimit = event.url.searchParams.get('limit');
  let limit = LIMIT_DEFAULT;
  if (rawLimit !== null) {
    const n = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0) limit = Math.min(n, LIMIT_MAX);
  }

  const rows = await db
    .select({
      id: sightings.id,
      ts: sightings.ts,
      siteId: sightings.siteId,
      description: sightings.description,
      attributes: sightings.attributes,
      pointGeoJSON: geoAsGeoJSON(sightings.point)
    })
    .from(sightings)
    .where(eq(sightings.operationId, ctx.op.id))
    .orderBy(desc(sightings.ts))
    .limit(limit);

  const features = (rows as unknown as SightingRow[]).map(sightingRowToFeature);
  return json(toFeatureCollection(features));
};

export const POST: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(
    event,
    canRecordSightings,
    'forbidden_sighting_write'
  );

  // Per-(user, op) write throttle. Observers are the broadest write grant on
  // sightings, so without this a logged-in low-trust principal can amplify
  // storage cost.
  if (!sightingsWriteLimiter.consume(`sightings:${ctx.user.sub}:${ctx.op.id}`)) {
    throw error(429, 'rate_limited');
  }

  const body = await readJsonBody(event);
  const parsed = parseCreateSightingPayload(body);
  if (!parsed.ok) throw error(400, parsed.code);

  const { ts, lon, lat, siteId, description, attributes } = parsed.value;

  // If a site_id was supplied, it must belong to *this* op. Without this check
  // a coordinator of org A could plant sightings against op B's site.
  if (siteId) {
    const [siteOk] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.operationId, ctx.op.id)))
      .limit(1);
    if (!siteOk) throw error(400, 'site_not_in_operation');
  }

  const [inserted] = await db
    .insert(sightings)
    .values({
      operationId: ctx.op.id,
      siteId: siteId ?? null,
      ts: ts ? new Date(ts) : new Date(),
      point: lon !== null && lon !== undefined && lat !== null && lat !== undefined
        ? (pointFromLonLat(lon, lat) as never)
        : null,
      description: description ?? null,
      attributes: attributes ?? {}
    })
    .returning({
      id: sightings.id,
      ts: sightings.ts,
      siteId: sightings.siteId,
      description: sightings.description,
      attributes: sightings.attributes,
      pointGeoJSON: geoAsGeoJSON(sightings.point)
    });

  if (!inserted) throw error(500, 'db_error');

  const feature = sightingRowToFeature(inserted as unknown as SightingRow);

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'sighting',
    entityId: inserted.id,
    action: 'create',
    after: {
      ts: inserted.ts.toISOString(),
      siteId: siteId ?? null,
      lon,
      lat,
      description,
      attributes: attributes ?? {}
    },
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  return json({ sighting: feature }, { status: 201 });
};
