import { asc, eq } from 'drizzle-orm';
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

  // Active orgs visible to everyone in the skeleton; once the auth flow is
  // fully relied on, filter by membership unless the viewer is platform admin.
  const organizations = await db
    .select({ slug: orgs.slug, name: orgs.name })
    .from(orgs)
    .where(eq(orgs.status, 'active'))
    .orderBy(asc(orgs.name));

  let user: { id: string; email: string; displayName: string | null } | null = null;
  if (locals.user) {
    const u = await loadUserPublic(locals.user.sub);
    if (u) user = { id: u.id, email: u.email, displayName: u.displayName };
  }

  return {
    locale: locals.locale,
    enabledLocales,
    organizations,
    user
  };
};
