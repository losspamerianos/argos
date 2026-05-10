import type { RequestHandler } from './$types';
import { and, eq, isNull } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { translations } from '$lib/server/db/schema';
import { listEnabledLocales } from '$lib/server/i18n';

/**
 * Returns the platform-wide translation base for the requested locale.
 *
 * Auth-required to avoid leaking even the platform vocabulary to anonymous
 * scrapers, and the response is *strictly* base-only — operation- and
 * org-specific overrides are loaded server-side via the route layouts and
 * never crossed by this endpoint, so a logged-in user of org A cannot use
 * this URL to enumerate org B's terminology.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  const enabled = await listEnabledLocales();
  if (!enabled.some((l) => l.code === params.locale)) {
    throw error(404, 'unknown_locale');
  }

  const rows = await db
    .select({
      namespace: translations.namespace,
      key: translations.key,
      value: translations.value
    })
    .from(translations)
    .where(
      and(
        eq(translations.locale, params.locale),
        isNull(translations.organizationId),
        isNull(translations.operationId)
      )
    );

  const base: Record<string, string> = {};
  for (const r of rows) base[`${r.namespace}.${r.key}`] = r.value;

  return json(
    { locale: params.locale, base },
    { headers: { 'cache-control': 'private, max-age=60' } }
  );
};
