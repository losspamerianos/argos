import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPrivateKey, getPublicKey, JWT_ALG, JWT_KID } from './keys';

export type AccessClaims = JWTPayload & {
  sub: string;
  /** Map of org slug → roles in that organization (e.g. 'admin' | 'member'). */
  org_roles: Record<string, string[]>;
  /** Map of "{orgSlug}/{opSlug}" → roles in that specific operation. */
  op_roles: Record<string, string[]>;
  locale?: string;
  is_platform_admin?: boolean;
  /** Token version: must match users.token_version at verify time. Bumping the
   *  user's token_version is how `/api/auth/sessions/revoke-all` kills already
   *  -issued access tokens whose `exp` has not yet passed. */
  tv: number;
};

const ISSUER = process.env.JWT_ISSUER ?? 'argos';
const AUDIENCE = process.env.JWT_AUDIENCE ?? 'argos';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid integer env var (got ${JSON.stringify(value)})`);
  }
  return Math.floor(n);
}

const ACCESS_TTL = parsePositiveInt(process.env.JWT_ACCESS_TTL_SECONDS, 900);
const REFRESH_TTL = parsePositiveInt(process.env.JWT_REFRESH_TTL_SECONDS, 2_592_000);

export async function signAccessToken(claims: Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>) {
  const key = await getPrivateKey();
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT', kid: JWT_KID })
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

/**
 * Generate a refresh token. The id is pre-allocated so the caller can write it
 * to `refresh_tokens.id` together with `family_id` in a single INSERT.
 *
 * Pass `familyId` when rotating an existing token (so the new row inherits the
 * family); pass `parentId` to record the chain.
 */
export function generateRefreshToken(opts?: {
  familyId?: string;
  parentId?: string | null;
}): {
  id: string;
  raw: string;
  hash: string;
  expiresAt: Date;
  familyId: string;
  parentId: string | null;
} {
  const id = randomUUID();
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);
  return {
    id,
    raw,
    hash,
    expiresAt,
    familyId: opts?.familyId ?? id,
    parentId: opts?.parentId ?? null
  };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const ACCESS_TTL_SECONDS = ACCESS_TTL;
export const REFRESH_TTL_SECONDS = REFRESH_TTL;
