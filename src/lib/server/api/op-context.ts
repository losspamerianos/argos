import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { operations, organizations } from '../db/schema';
import { canAccessOperation } from '../auth/rbac';
import { isReservedOrgSlug, isValidSlug } from '../reserved';
import type { AccessClaims } from '../auth/jwt';

const UA_MAX = 512;

export type OpContext = {
  user: AccessClaims;
  org: { id: string; slug: string };
  op: { id: string; slug: string };
  requestId: string;
  ip: string;
  ua: string;
};

/**
 * Validate the org+op slug pair, look up both rows, and confirm the calling
 * user can access the operation. Throws SvelteKit `error()` on every failure
 * path so the caller can just `await loadOpContext(event)` at the top.
 *
 * The slug-shape and reserved-slug checks duplicate what the page-layout chain
 * does for HTML routes — duplicated deliberately, because /api/o/... is hit
 * directly without traversing those layouts.
 */
export async function loadOpContext(event: RequestEvent): Promise<OpContext> {
  const user = event.locals.user;
  if (!user) throw error(401, 'unauthorized');

  const orgSlug = event.params.orgSlug;
  const opSlug = event.params.opSlug;
  if (!orgSlug || !opSlug) throw error(404, 'op_not_found');
  if (!isValidSlug(orgSlug) || isReservedOrgSlug(orgSlug)) throw error(404, 'org_not_found');
  if (!isValidSlug(opSlug)) throw error(404, 'op_not_found');

  const [row] = await db
    .select({
      orgId: organizations.id,
      orgSlug: organizations.slug,
      opId: operations.id,
      opSlugCol: operations.slug
    })
    .from(operations)
    .innerJoin(organizations, eq(organizations.id, operations.organizationId))
    .where(and(eq(organizations.slug, orgSlug), eq(operations.slug, opSlug)))
    .limit(1);

  if (!row) throw error(404, 'op_not_found');

  if (!canAccessOperation(user, row.orgSlug, row.opSlugCol)) {
    throw error(403, 'no_access_to_operation');
  }

  return {
    user,
    org: { id: row.orgId, slug: row.orgSlug },
    op: { id: row.opId, slug: row.opSlugCol },
    requestId: event.locals.requestId,
    ip: event.getClientAddress(),
    ua: (event.request.headers.get('user-agent') ?? '').slice(0, UA_MAX)
  };
}

/**
 * Same as `loadOpContext`, plus a custom RBAC check after the access gate.
 * The predicate signature matches the resource-write helpers in
 * `auth/rbac.ts` (`canManageSites`, `canRecordSightings`, …) so endpoints can
 * just hand the function reference in:
 *
 *   const ctx = await loadOpContextForWrite(event, canManageSites);
 */
export async function loadOpContextForWrite(
  event: RequestEvent,
  predicate: (claims: AccessClaims, orgSlug: string, opSlug: string) => boolean,
  forbiddenCode = 'forbidden'
): Promise<OpContext> {
  const ctx = await loadOpContext(event);
  if (!predicate(ctx.user, ctx.org.slug, ctx.op.slug)) {
    throw error(403, forbiddenCode);
  }
  return ctx;
}
