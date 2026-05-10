import { readFileSync } from 'node:fs';
import { importPKCS8, importSPKI, type CryptoKey } from 'jose';

const ALG = 'ES256';

let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;

export async function getPrivateKey(): Promise<CryptoKey> {
  if (privateKey) return privateKey;
  const path = process.env.JWT_PRIVATE_KEY_PATH;
  if (!path) throw new Error('JWT_PRIVATE_KEY_PATH is not set');
  const pem = readFileSync(path, 'utf8');
  privateKey = await importPKCS8(pem, ALG);
  return privateKey;
}

export async function getPublicKey(): Promise<CryptoKey> {
  if (publicKey) return publicKey;
  const path = process.env.JWT_PUBLIC_KEY_PATH;
  if (!path) throw new Error('JWT_PUBLIC_KEY_PATH is not set');
  const pem = readFileSync(path, 'utf8');
  publicKey = await importSPKI(pem, ALG);
  return publicKey;
}

export const JWT_ALG = ALG;
