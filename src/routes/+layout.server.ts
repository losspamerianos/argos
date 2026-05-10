import { asc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { operations as operationsTable, locales as localesTable } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
  const enabledLocales = await db
    .select({ code: localesTable.code, displayName: localesTable.displayName })
    .from(localesTable)
    .where(eq(localesTable.enabled, true))
    .orderBy(asc(localesTable.displayOrder));

  const operations = await db
    .select({ slug: operationsTable.slug, name: operationsTable.name })
    .from(operationsTable)
    .where(eq(operationsTable.status, 'active'))
    .orderBy(asc(operationsTable.name));

  return {
    locale: locals.locale,
    enabledLocales,
    operations,
    user: locals.user ? { sub: locals.user.sub } : null
  };
};
