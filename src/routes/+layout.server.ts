import { and, asc, eq, inArray } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { organizations as orgs, locales as localesTable } from '$lib/server/db/schema';
import { loadUserPublic } from '$lib/server/auth/session';

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
      const orgFromOpRoles = Object.keys(locals.user.op_roles ?? {}).map(
        (k) => k.split('/')[0]
      );
      const accessible = Array.from(
        new Set([...Object.keys(locals.user.org_roles ?? {}), ...orgFromOpRoles])
      ).filter(Boolean);
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
    user
  };
};
