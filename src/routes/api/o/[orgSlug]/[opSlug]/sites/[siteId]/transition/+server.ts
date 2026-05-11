import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sites } from '$lib/server/db/schema';
import { geoAsGeoJSON } from '$lib/server/db/postgis';
import { canTransition } from '$lib/server/lifecycle/machine';
import { siteMachine, type SiteState } from '$lib/server/lifecycle/site';
import { canManageSites } from '$lib/server/auth/rbac';
import { sitesUpdateLimiter } from '$lib/server/auth/rate-limit';
import { audit } from '$lib/server/audit';
import {
  loadOpContextForWrite,
  readJsonBody,
  requireUuidParam
} from '$lib/server/api/op-context';
import { parseSiteTransitionPayload } from '$lib/server/api/validators/site-transition';
import { siteRowToFeature } from '$lib/server/api/geo';
import type { SiteRow } from '$lib/server/api/geo';

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

export const POST: RequestHandler = async (event) => {
  const ctx = await loadOpContextForWrite(event, canManageSites, 'forbidden_site_write');
  const siteId = requireUuidParam(event.params.siteId, 'site_not_found');

  // Shared key with the PATCH endpoint: see comment in sites/[siteId]/+server.ts.
  if (!sitesUpdateLimiter.consume(`sites:write-extra:${ctx.user.sub}:${ctx.op.id}`)) {
    throw error(429, 'rate_limited');
  }

  const body = await readJsonBody(event);
  const parsed = parseSiteTransitionPayload(body);
  if (!parsed.ok) throw error(400, parsed.code);
  const { to } = parsed.value;

  // Read-update in one transaction so a concurrent transition can't make us
  // overwrite a row whose state moved out from under us. The conditional
  // UPDATE's WHERE clause re-checks `lifecycleState = before` to make the
  // last-write-wins window tiny (Postgres serialises on the row's xlog).
  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(SITE_SELECT)
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.operationId, ctx.op.id)))
      .limit(1);
    if (!before) return { kind: 'not_found' as const };

    const from = before.lifecycleState as SiteState;
    if (!canTransition(siteMachine, from, to)) {
      return { kind: 'illegal_transition' as const, from, to };
    }

    const [after] = await tx
      .update(sites)
      .set({ lifecycleState: to, updatedAt: new Date() })
      .where(
        and(
          eq(sites.id, siteId),
          eq(sites.operationId, ctx.op.id),
          eq(sites.lifecycleState, from)
        )
      )
      .returning(SITE_SELECT);
    // `after` undefined here means someone else moved the state between our
    // SELECT and UPDATE — surface as a 409 rather than silently 500.
    if (!after) return { kind: 'concurrent_transition' as const };

    return { kind: 'ok' as const, before, after, from };
  });

  if (result.kind === 'not_found') throw error(404, 'site_not_found');
  if (result.kind === 'illegal_transition') {
    throw error(409, `illegal_transition:${result.from}->${result.to}`);
  }
  if (result.kind === 'concurrent_transition') {
    throw error(409, 'concurrent_transition');
  }

  const feature = siteRowToFeature(result.after as unknown as SiteRow);

  await audit({
    actorUserId: ctx.user.sub,
    organizationId: ctx.org.id,
    operationId: ctx.op.id,
    entityType: 'site',
    entityId: siteId,
    action: 'transition',
    before: { lifecycleState: result.from },
    after: { lifecycleState: to },
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
    userAgent: ctx.ua
  });

  return json({ site: feature, from: result.from, to });
};
