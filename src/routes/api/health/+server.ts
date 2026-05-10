import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  let dbOk = false;
  let postgisVersion: string | null = null;
  try {
    const rows = (await db.execute(
      sql<{ postgis_version: string }>`SELECT postgis_full_version() AS postgis_version`
    )) as unknown as Array<{ postgis_version: string }>;
    postgisVersion = rows[0]?.postgis_version ?? null;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return json(
    { ok: dbOk, db: dbOk, postgis: postgisVersion, ts: new Date().toISOString() },
    { status: dbOk ? 200 : 503 }
  );
};
