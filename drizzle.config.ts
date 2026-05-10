import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'postgres://argos:argos@localhost:5432/argos';

export default defineConfig({
  schema: './src/lib/server/db/schema/*',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true
});
