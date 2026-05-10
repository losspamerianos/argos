import { eq } from 'drizzle-orm';
import { db, type DB } from '../db';
import {
  organizationMembers,
  organizations,
  operations,
  userOperationRoles,
  users
} from '../db/schema';
import type { AccessClaims } from './jwt';

/**
 * Drizzle's transaction handle has the same query surface as the pool-level
 * `db`. Accepting either lets callers route this read into an existing
 * transaction (e.g. the refresh-rotation tx) so the user-row lock that they
 * already hold also covers the SELECTs here.
 */
type Executor = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Build the JWT claim set for a user by joining their org memberships and
 * op-specific roles. The claim set is what the access token carries; rbac
 * helpers in `auth/rbac.ts` consume this same shape.
 *
 * Pass `executor` to run the underlying SELECTs inside an existing transaction
 * (and on the same connection as any active row lock); omit it for one-off
 * use against the pool.
 */
export async function buildAccessClaims(
  userId: string,
  executor: Executor = db
): Promise<Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>> {
  const [userRow, orgMemberships, opRoleRows] = await Promise.all([
    executor.select().from(users).where(eq(users.id, userId)).limit(1),
    executor
      .select({
        orgSlug: organizations.slug,
        role: organizationMembers.role
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId)),
    executor
      .select({
        orgSlug: organizations.slug,
        opSlug: operations.slug,
        role: userOperationRoles.role
      })
      .from(userOperationRoles)
      .innerJoin(operations, eq(operations.id, userOperationRoles.operationId))
      .innerJoin(organizations, eq(organizations.id, operations.organizationId))
      .where(eq(userOperationRoles.userId, userId))
  ]);

  const user = userRow[0];
  if (!user) throw new Error('user_not_found');

  const orgRoles: Record<string, string[]> = {};
  for (const m of orgMemberships) {
    (orgRoles[m.orgSlug] ??= []).push(m.role);
  }

  const opRoles: Record<string, string[]> = {};
  for (const r of opRoleRows) {
    (opRoles[`${r.orgSlug}/${r.opSlug}`] ??= []).push(r.role);
  }

  return {
    sub: user.id,
    org_roles: orgRoles,
    op_roles: opRoles,
    is_platform_admin: user.isPlatformAdmin,
    locale: user.preferredLocale ?? undefined,
    tv: user.tokenVersion
  };
}

export async function loadUserPublic(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      preferredLocale: users.preferredLocale,
      isPlatformAdmin: users.isPlatformAdmin
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}
