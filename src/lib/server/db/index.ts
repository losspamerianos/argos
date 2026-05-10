import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set');
}

const sslMode = process.env.PGSSL;
const ssl =
  sslMode === 'require' || sslMode === 'true'
    ? ('require' as const)
    : sslMode === 'allow' || sslMode === 'prefer'
      ? (sslMode as 'allow' | 'prefer')
      : undefined;

const client = postgres(url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl,
  // Apply server-side guards on every connection. Numeric milliseconds.
  connection: {
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000
  }
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
