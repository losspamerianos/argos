import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

// @node-rs/argon2 ships `Algorithm` as a `const enum`, which `verbatimModuleSyntax`
// disallows. The numeric value is the public ABI: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id.
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 1024;

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch (err) {
    // A malformed/corrupt stored hash is the only way `verify` raises; we want
    // it logged so that tampered DB rows or argon2 native crashes are visible
    // in operational logs, not silently coerced to "wrong password".
    console.error('argon2_verify_failed', err);
    return false;
  }
}

/**
 * Return value pre-computed once per process — used to make login verification
 * constant-time when the user does not exist, defeating timing-based user
 * enumeration. The stored hash itself is unrecoverable random.
 */
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(`__argos_dummy__${randomBytes(16).toString('hex')}`);
  }
  return dummyHashPromise;
}

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: 'password_not_string' | 'password_too_short' | 'password_too_long' };

export function validatePassword(password: unknown): PasswordValidation {
  if (typeof password !== 'string') return { ok: false, reason: 'password_not_string' };
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: 'password_too_short' };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: 'password_too_long' };
  return { ok: true };
}
