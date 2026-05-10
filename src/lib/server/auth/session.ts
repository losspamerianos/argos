import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  organizationMembers,
  organizations,
  operations,
  userOperationRoles,
  users
} from '../db/schema';
import type { AccessClaims } from './jwt';

/**
 * Build the JWT claim set for a user by joining their org memberships and
 * op-specific roles. The claim set is what the access token carries; rbac
 * helpers in `auth/rbac.ts` consume this same shape.
 */
export async function buildAccessClaims(
  userId: string
): Promise<Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('user_not_found');

  const orgMemberships = await db
    .select({
      orgSlug: organizations.slug,
      role: organizationMembers.role
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId));

  const orgRoles: Record<string, string[]> = {};
  for (const m of orgMemberships) {
    (orgRoles[m.orgSlug] ??= []).push(m.role);
  }

  const opRoleRows = await db
    .select({
      orgSlug: organizations.slug,
      opSlug: operations.slug,
      role: userOperationRoles.role
    })
    .from(userOperationRoles)
    .innerJoin(operations, eq(operations.id, userOperationRoles.operationId))
    .innerJoin(organizations, eq(organizations.id, operations.organizationId))
    .where(eq(userOperationRoles.userId, userId));

  const opRoles: Record<string, string[]> = {};
  for (const r of opRoleRows) {
    (opRoles[`${r.orgSlug}/${r.opSlug}`] ??= []).push(r.role);
  }

  return {
    sub: user.id,
    org_roles: orgRoles,
    op_roles: opRoles,
    is_platform_admin: user.isPlatformAdmin,
    locale: user.preferredLocale ?? undefined
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
