import { asc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { organizations as orgs, locales as localesTable } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
  const enabledLocales = await db
    .select({ code: localesTable.code, displayName: localesTable.displayName })
    .from(localesTable)
    .where(eq(localesTable.enabled, true))
    .orderBy(asc(localesTable.displayOrder));

  // For the skeleton, list all active orgs. Once auth is wired end-to-end,
  // filter by membership unless the user is a platform admin.
  const organizations = await db
    .select({ slug: orgs.slug, name: orgs.name })
    .from(orgs)
    .where(eq(orgs.status, 'active'))
    .orderBy(asc(orgs.name));

  return {
    locale: locals.locale,
    enabledLocales,
    organizations,
    user: locals.user ? { sub: locals.user.sub } : null
  };
};
