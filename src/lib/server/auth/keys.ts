import { readFileSync } from 'node:fs';
import { importPKCS8, importSPKI, type KeyLike } from 'jose';

const ALG = 'ES256';

let privateKeyPromise: Promise<KeyLike> | null = null;
let publicKeyPromise: Promise<KeyLike> | null = null;

/** Cache the *promise* so concurrent first-callers share one importPKCS8. */
export function getPrivateKey(): Promise<KeyLike> {
  if (privateKeyPromise) return privateKeyPromise;
  const path = process.env.JWT_PRIVATE_KEY_PATH;
  if (!path) throw new Error('JWT_PRIVATE_KEY_PATH is not set');
  const p = importPKCS8(readFileSync(path, 'utf8'), ALG);
  // On import failure, allow the next caller to retry from scratch.
  p.catch(() => {
    privateKeyPromise = null;
  });
  privateKeyPromise = p;
  return p;
}

export function getPublicKey(): Promise<KeyLike> {
  if (publicKeyPromise) return publicKeyPromise;
  const path = process.env.JWT_PUBLIC_KEY_PATH;
  if (!path) throw new Error('JWT_PUBLIC_KEY_PATH is not set');
  const p = importSPKI(readFileSync(path, 'utf8'), ALG);
  p.catch(() => {
    publicKeyPromise = null;
  });
  publicKeyPromise = p;
  return p;
}

export const JWT_ALG = ALG;
/** Single key id today; placeholder for future rotation with multiple verifying keys. */
export const JWT_KID = process.env.JWT_KID ?? 'v1';
