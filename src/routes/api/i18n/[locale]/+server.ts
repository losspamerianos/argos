import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { translations } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params }) => {
  const rows = await db
    .select({
      namespace: translations.namespace,
      key: translations.key,
      value: translations.value,
      operationId: translations.operationId
    })
    .from(translations)
    .where(eq(translations.locale, params.locale));

  const base: Record<string, string> = {};
  const byOperation: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const k = `${r.namespace}.${r.key}`;
    if (r.operationId === null) {
      base[k] = r.value;
    } else {
      (byOperation[r.operationId] ??= {})[k] = r.value;
    }
  }
  return json({ locale: params.locale, base, byOperation });
};
