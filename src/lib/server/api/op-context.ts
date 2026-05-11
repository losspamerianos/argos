import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { operations, organizations } from '../db/schema';
import { canAccessOperation } from '../auth/rbac';
import { isReservedOrgSlug, isValidSlug } from '../reserved';
import type { AccessClaims } from '../auth/jwt';

const UA_MAX = 512;
/** Per-request JSON body cap. 64 KiB is well above any legitimate form post in
 *  this app (validators clamp the attributes blob at 8 KiB serialised). */
const JSON_BODY_LIMIT = 65_536;
/** Strict positive integer match — rejects `"123abc"`, `" 123"`, `"+123"`. */
const POSITIVE_INT_RE = /^\d+$/;
/** Strip ASCII control characters from a header value before logging or storing.
 *  Prevents log-injection via newlines in `User-Agent`; jsonb encoding makes
 *  this defence-in-depth, but cheap. */
function sanitizeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

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
    ua: sanitizeHeader(event.request.headers.get('user-agent') ?? '').slice(0, UA_MAX)
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

/**
 * Read a JSON body with an upfront size cap. Checks Content-Length first (cheap
 * pre-flight) and then re-checks the decoded byte length (defends against a
 * spoofed or omitted Content-Length). Returns `unknown` so the caller's
 * validator does the typed parsing.
 *
 * The post-decode check uses UTF-8 byte length (via TextEncoder), not
 * JS `String.length` which counts UTF-16 code units — otherwise a 4-byte
 * emoji on the wire would only cost 2 code units after decode and effectively
 * double the nominal limit.
 */
export async function readJsonBody(event: RequestEvent): Promise<unknown> {
  const lenHeader = event.request.headers.get('content-length');
  if (lenHeader && POSITIVE_INT_RE.test(lenHeader)) {
    const len = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > JSON_BODY_LIMIT) {
      throw error(413, 'body_too_large');
    }
  }
  const text = await event.request.text();
  const byteLen = new TextEncoder().encode(text).length;
  if (byteLen > JSON_BODY_LIMIT) {
    throw error(413, 'body_too_large');
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw error(400, 'invalid_json');
  }
}
