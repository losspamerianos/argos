/**
 * Role-Based Access Control. Three levels:
 *   1. Platform admin – full access via `is_platform_admin` flag.
 *   2. Organization role – membership in an Org grants implicit observer-level
 *      access to all of its Operations, plus org-scoped admin powers when the
 *      role is 'admin'.
 *   3. Operation role – specific role inside one Operation (trapper, vet, …).
 *
 * Authorization checks accept the org slug (and where relevant the op slug)
 * and consult the JWT claims set issued at login.
 */

export type OrgRole = 'admin' | 'member';
export type OpRole =
  | 'coordinator'
  | 'trapper'
  | 'vet'
  | 'caretaker'
  | 'data_manager'
  | 'observer';

export const ORG_ROLES: OrgRole[] = ['admin', 'member'];
export const OP_ROLES: OpRole[] = [
  'coordinator',
  'trapper',
  'vet',
  'caretaker',
  'data_manager',
  'observer'
];

type Claims = {
  is_platform_admin?: boolean;
  org_roles?: Record<string, string[]>;
  op_roles?: Record<string, string[]>;
} | null | undefined;

export function isPlatformAdmin(claims: Claims): boolean {
  return Boolean(claims?.is_platform_admin);
}

export function hasOrgRole(
  claims: Claims,
  orgSlug: string,
  required: OrgRole | OrgRole[]
): boolean {
  if (!claims) return false;
  const roles = claims.org_roles?.[orgSlug] ?? [];
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}

export function hasOpRole(
  claims: Claims,
  orgSlug: string,
  opSlug: string,
  required: OpRole | OpRole[]
): boolean {
  if (!claims) return false;
  const roles = claims.op_roles?.[`${orgSlug}/${opSlug}`] ?? [];
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}

export function canAccessOrganization(claims: Claims, orgSlug: string): boolean {
  if (!claims) return false;
  if (claims.is_platform_admin) return true;
  return Boolean(claims.org_roles?.[orgSlug]?.length);
}

export function canAccessOperation(
  claims: Claims,
  orgSlug: string,
  opSlug: string
): boolean {
  if (!claims) return false;
  if (claims.is_platform_admin) return true;
  // Org membership grants implicit access to all of its operations.
  if (claims.org_roles?.[orgSlug]?.length) return true;
  return Boolean(claims.op_roles?.[`${orgSlug}/${opSlug}`]?.length);
}

/**
 * Resource-write checks. Read access is `canAccessOperation` for everything;
 * these gate mutating endpoints and live with the rest of the policy here so
 * future grants can be reasoned about in one place.
 */

/** Create / edit / lifecycle-transition sites and sectors. */
export function canManageSites(claims: Claims, orgSlug: string, opSlug: string): boolean {
  if (!claims) return false;
  if (claims.is_platform_admin) return true;
  if (hasOrgRole(claims, orgSlug, 'admin')) return true;
  return hasOpRole(claims, orgSlug, opSlug, ['coordinator', 'data_manager']);
}

/** Submit a sighting. Field crews are the primary callers; observers count too,
 *  because partner-org volunteers logging what they actually saw is the point. */
export function canRecordSightings(
  claims: Claims,
  orgSlug: string,
  opSlug: string
): boolean {
  return canAccessOperation(claims, orgSlug, opSlug);
}
