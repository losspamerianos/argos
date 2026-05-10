import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { getPrivateKey, getPublicKey, JWT_ALG } from './keys';

export type AccessClaims = JWTPayload & {
  sub: string;
  /** Map of org slug → roles in that organization (e.g. 'admin' | 'member'). */
  org_roles: Record<string, string[]>;
  /** Map of "{orgSlug}/{opSlug}" → roles in that specific operation. */
  op_roles: Record<string, string[]>;
  locale?: string;
  is_platform_admin?: boolean;
};

const ISSUER = process.env.JWT_ISSUER ?? 'argos';
const AUDIENCE = process.env.JWT_AUDIENCE ?? 'argos';
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000);

export async function signAccessToken(claims: Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>) {
  const key = await getPrivateKey();
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .setJti(randomBytes(16).toString('hex'))
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const key = await getPublicKey();
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [JWT_ALG]
  });
  return payload as AccessClaims;
}

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);
  return { raw, hash, expiresAt };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const ACCESS_TTL_SECONDS = ACCESS_TTL;
export const REFRESH_TTL_SECONDS = REFRESH_TTL;
