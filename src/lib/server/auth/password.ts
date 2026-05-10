import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
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
  } catch {
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
