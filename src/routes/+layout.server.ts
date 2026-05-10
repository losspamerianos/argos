import { and, asc, eq, inArray } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { organizations as orgs, locales as localesTable } from '$lib/server/db/schema';
import { loadUserPublic } from '$lib/server/auth/session';

function parseFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v) || v < min || v > max) return fallback;
  return v;
}

const MAP_DEFAULT_CENTER_LON = parseFloatEnv('MAP_DEFAULT_CENTER_LON', 33.6694, -180, 180);
const MAP_DEFAULT_CENTER_LAT = parseFloatEnv('MAP_DEFAULT_CENTER_LAT', 34.9787, -90, 90);
const MAP_DEFAULT_ZOOM = parseFloatEnv('MAP_DEFAULT_ZOOM', 12, 0, 22);

export const load: LayoutServerLoad = async ({ locals }) => {
  const enabledLocales = await db
    .select({ code: localesTable.code, displayName: localesTable.displayName })
    .from(localesTable)
    .where(eq(localesTable.enabled, true))
    .orderBy(asc(localesTable.displayOrder));

  // Anonymous viewers see no org list — listing tenant orgs publicly is itself
  // a confidentiality leak for politically sensitive deployments.
  let organizations: { slug: string; name: string }[] = [];
  let user: { id: string; email: string; displayName: string | null } | null = null;

  if (locals.user) {
    const u = await loadUserPublic(locals.user.sub);
    if (u) user = { id: u.id, email: u.email, displayName: u.displayName };

    if (locals.user.is_platform_admin) {
      organizations = await db
        .select({ slug: orgs.slug, name: orgs.name })
        .from(orgs)
        .where(eq(orgs.status, 'active'))
        .orderBy(asc(orgs.name));
    } else {
      const orgFromOpRoles = Object.keys(locals.user.op_roles ?? {})
        .map((k) => k.split('/')[0])
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
      const accessible = Array.from(
        new Set<string>([...Object.keys(locals.user.org_roles ?? {}), ...orgFromOpRoles])
      ).filter((s) => s.length > 0);
      if (accessible.length > 0) {
        organizations = await db
          .select({ slug: orgs.slug, name: orgs.name })
          .from(orgs)
          .where(and(eq(orgs.status, 'active'), inArray(orgs.slug, accessible)))
          .orderBy(asc(orgs.name));
      }
    }
  }

  return {
    locale: locals.locale,
    enabledLocales,
    organizations,
    user,
    mapDefaults: {
      center: [MAP_DEFAULT_CENTER_LON, MAP_DEFAULT_CENTER_LAT] as [number, number],
      zoom: MAP_DEFAULT_ZOOM
    }
  };
};
