#!/usr/bin/env node
// Bootstrap a platform-admin user.
//
// Usage (interactive):
//   docker compose exec -it app node scripts/create-admin.mjs
// Usage (non-interactive):
//   docker compose exec -T app node scripts/create-admin.mjs <email> <password> [displayName]
//
// Idempotent: re-running with the same email updates the password and
// display name. The user is always set is_platform_admin = TRUE.

import { Algorithm, hash } from '@node-rs/argon2';
import postgres from 'postgres';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in the environment.');
  process.exit(1);
}

async function prompt(label, hidden = false) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden && stdout.isTTY) {
    process.stdout.write(label);
    const old = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    const buf = [];
    return await new Promise((resolve) => {
      const onData = (d) => {
        const s = d.toString('utf8');
        for (const ch of s) {
          if (ch === '\n' || ch === '\r' || ch === '') {
            stdin.removeListener('data', onData);
            if (stdin.setRawMode) stdin.setRawMode(old);
            process.stdout.write('\n');
            rl.close();
            resolve(buf.join(''));
            return;
          }
          if (ch === '') {
            process.exit(130);
          }
          if (ch === '' || ch === '\b') {
            buf.pop();
          } else {
            buf.push(ch);
          }
        }
      };
      stdin.on('data', onData);
    });
  }
  const v = await rl.question(label);
  rl.close();
  return v;
}

const argv = process.argv.slice(2);
const email = (argv[0] ?? (await prompt('Email: '))).trim().toLowerCase();
const password = argv[1] ?? (await prompt('Password: ', true));
const displayName = (argv[2] ?? (await prompt('Display name: '))).trim() || null;

if (!email || !password) {
  console.error('Email and password are required.');
  process.exit(1);
}

const passwordHash = await hash(password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});

const sql = postgres(url, { max: 1 });
try {
  const rows = await sql`
    INSERT INTO users (email, password_hash, display_name, is_platform_admin)
    VALUES (${email}, ${passwordHash}, ${displayName}, TRUE)
    ON CONFLICT (email) DO UPDATE SET
      password_hash      = EXCLUDED.password_hash,
      display_name       = EXCLUDED.display_name,
      is_platform_admin  = TRUE,
      updated_at         = now()
    RETURNING id, email, display_name
  `;
  console.log('Platform admin upserted:', rows[0]);
} finally {
  await sql.end({ timeout: 5 });
}
