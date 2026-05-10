/**
 * Role-Based Access Control – operation-scoped roles plus a platform-admin flag.
 *
 * A user can have multiple roles in one operation and different role sets across
 * operations. Authorization checks always specify the operation slug.
 */

export type Role =
  | 'coordinator'
  | 'trapper'
  | 'vet'
  | 'caretaker'
  | 'data_manager'
  | 'observer';

export const ALL_ROLES: Role[] = [
  'coordinator',
  'trapper',
  'vet',
  'caretaker',
  'data_manager',
  'observer'
];

export function hasOpRole(
  opRoles: Record<string, string[]> | undefined,
  opSlug: string,
  required: Role | Role[]
): boolean {
  const roles = opRoles?.[opSlug] ?? [];
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}

export function isPlatformAdmin(claims: { is_platform_admin?: boolean } | null | undefined): boolean {
  return Boolean(claims?.is_platform_admin);
}

export function canAccessOperation(
  claims: { is_platform_admin?: boolean; op_roles?: Record<string, string[]> } | null | undefined,
  opSlug: string
): boolean {
  if (!claims) return false;
  if (claims.is_platform_admin) return true;
  return Boolean(claims.op_roles?.[opSlug]?.length);
}
