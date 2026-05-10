import type { RequestHandler } from './$types';
import { desc, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sites } from '$lib/server/db/schema';
import { geoAsGeoJSON, pointFromLonLat } from '$lib/server/db/postgis';
import { siteMachine } from '$lib/server/lifecycle/site';
import { canManageSites } from '$lib/server/auth/rbac';
import { audit } from '$lib/server/audit';
import { loadOpContext, loadOpContextForWrite } from '$lib/server/api/op-context';
import { parseCreateSitePayload } from '$lib/server/api/validators/site';
import { siteRowToFeature, toFeatureCollection } from '$lib/server/api/geo';
import type { SiteRow } from '$lib/server/api/geo';

export const GET: RequestHandler = async (event) => {
  const ctx = await loadOpContext(event);

  const rows = await db
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
    .where(eq(sites.operationId, ctx.op.id))
    .orderBy(desc(sites.createdAt));

  const features = (rows as unknown as SiteRow[]).map(siteRowToFeature);
  return json(toFeatureCollection(features));
};

export const POST: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(event, canManageSites, 'forbidden_site_write');

  const body = (await event.request.json().catch(() => null)) as unknown;
  const parsed = parseCreateSitePayload(body);
  if (!parsed.ok) throw error(400, parsed.code);

  const { name, kind, lon, lat, attributes } = parsed.value;

  const [inserted] = await db
    .insert(sites)
    .values({
      operationId: ctx.op.id,
      name,
      kind,
      lifecycleState: siteMachine.initial,
      point: lon !== null && lon !== undefined && lat !== null && lat !== undefined
        ? (pointFromLonLat(lon, lat) as never)
        : null,
      attributes: attributes ?? {}
    })
    .returning({
      id: sites.id,
      name: sites.name,
      kind: sites.kind,
      lifecycleState: sites.lifecycleState,
      sectorId: sites.sectorId,
      attributes: sites.attributes,
      createdAt: sites.createdAt,
      pointGeoJSON: geoAsGeoJSON(sites.point)
    });

  if (!inserted) throw error(500, 'db_error');

  const feature = siteRowToFeature(inserted as unknown as SiteRow);

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'site',
    entityId: inserted.id,
    action: 'create',
    after: {
      name,
      kind,
      lifecycleState: siteMachine.initial,
      lon,
      lat,
      attributes: attributes ?? {}
    },
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  return json({ site: feature }, { status: 201 });
};
