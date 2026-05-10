#!/usr/bin/env node
// Bootstrap a platform-admin user.
//
// Password is NEVER read from argv (process listing leaks it). Two safe modes:
//
//  Interactive (TTY):
//    docker compose exec -it app node scripts/create-admin.mjs
//
//  Non-interactive (CI / scripted):
//    docker compose exec -T -e ADMIN_EMAIL='you@example.org' \
//        -e ADMIN_PASSWORD='…' -e ADMIN_DISPLAY_NAME='Your Name' \
//        app node scripts/create-admin.mjs
//
//  Or pipe the password via stdin:
//    printf '%s\n' "$pw" | docker compose exec -T app \
//        node scripts/create-admin.mjs you@example.org "Your Name"
//
// Idempotent: re-running upserts the row and always sets is_platform_admin = TRUE.

import { Algorithm, hash } from '@node-rs/argon2';
import postgres from 'postgres';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;
const DISPLAY_NAME_MAX_LENGTH = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in the environment.');
  process.exit(1);
}

async function readLine(label) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

async function readPasswordTty(label) {
  return await new Promise((resolve, reject) => {
    process.stdout.write(label);
    const original = stdin.isRaw ?? false;
    if (!stdin.setRawMode) {
      reject(new Error('terminal_does_not_support_raw_mode'));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const buf = [];
    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 0x03) {
          // Ctrl-C
          stdin.setRawMode(original);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (code === 0x04) {
          // Ctrl-D — treat as end of input
          stdin.setRawMode(original);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf.join(''));
          return;
        }
        if (ch === '\n' || ch === '\r') {
          stdin.setRawMode(original);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf.join(''));
          return;
        }
        if (code === 0x7f || code === 0x08) {
          // backspace / DEL
          buf.pop();
          continue;
        }
        buf.push(ch);
      }
    };
    stdin.on('data', onData);
  });
}

async function readPasswordPipe() {
  return await new Promise((resolve) => {
    let buf = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => {
      buf += chunk;
    });
    stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
  });
}

function validateEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

function validatePassword(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= PASSWORD_MIN_LENGTH &&
    pw.length <= PASSWORD_MAX_LENGTH
  );
}

const argEmail = process.argv[2]?.trim();
const argDisplayName = process.argv[3]?.trim();

const email = (process.env.ADMIN_EMAIL ?? argEmail ?? (await readLine('Email: ')))
  .trim()
  .toLowerCase();

if (!validateEmail(email)) {
  console.error(`Invalid email: ${JSON.stringify(email)}`);
  process.exit(2);
}

let password;
if (process.env.ADMIN_PASSWORD) {
  password = process.env.ADMIN_PASSWORD;
} else if (stdin.isTTY) {
  password = await readPasswordTty('Password: ');
} else {
  password = await readPasswordPipe();
}

if (!validatePassword(password)) {
  console.error(
    `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long.`
  );
  process.exit(2);
}

const displayName =
  (process.env.ADMIN_DISPLAY_NAME ?? argDisplayName ?? (await readLine('Display name: '))).trim() ||
  null;

if (displayName && displayName.length > DISPLAY_NAME_MAX_LENGTH) {
  console.error(`Display name too long (max ${DISPLAY_NAME_MAX_LENGTH}).`);
  process.exit(2);
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
