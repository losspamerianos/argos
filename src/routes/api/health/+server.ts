import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

/**
 * Unauthenticated, deliberately minimal: returns only a boolean so that an
 * anonymous probe cannot fingerprint stack details (PostGIS presence, version,
 * etc.). The body shape is static to keep monitoring scrapes cheap.
 *
 * Internally still asserts that the DB is reachable AND PostGIS is loaded; if
 * either fails the response is 503.
 */
export const GET: RequestHandler = async () => {
  let ok = false;
  try {
    const rows = (await db.execute(
      sql<{ has_postgis: boolean }>`SELECT extname IS NOT NULL AS has_postgis
                                     FROM pg_extension WHERE extname = 'postgis'`
    )) as unknown as Array<{ has_postgis: boolean }>;
    ok = rows[0]?.has_postgis === true;
  } catch {
    ok = false;
  }
  return json({ ok, ts: new Date().toISOString() }, { status: ok ? 200 : 503 });
};
