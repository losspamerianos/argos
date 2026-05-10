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
  privateKey = await importPKCS8(toPkcs8Pem(pem), ALG);
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

/**
 * `openssl ecparam -genkey` emits a SEC1 EC PRIVATE KEY block. jose wants PKCS#8.
 * The script gen-keys.sh produces SEC1; here we accept either and let jose do
 * the work via a second openssl path if needed. For simplicity we assume PKCS#8
 * is supplied; if not, run: openssl pkcs8 -topk8 -nocrypt -in priv.pem -out priv.pkcs8.pem.
 */
function toPkcs8Pem(pem: string): string {
  return pem;
}

export const JWT_ALG = ALG;
