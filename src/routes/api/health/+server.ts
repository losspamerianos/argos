import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  let dbOk = false;
  let postgisVersion: string | null = null;
  try {
    const result = await db.execute<{ postgis_version: string }>(
      sql`SELECT postgis_full_version() AS postgis_version`
    );
    postgisVersion = (result as unknown as Array<{ postgis_version: string }>)[0]?.postgis_version ?? null;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return json({ ok: dbOk, db: dbOk, postgis: postgisVersion, ts: new Date().toISOString() });
};
