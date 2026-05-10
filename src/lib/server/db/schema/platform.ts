import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  unique,
  check,
  index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { geographyPolygon } from '../postgis';

/**
 * Organization = the host body that runs Operations on the platform.
 * Multiple Orgs can coexist on a single ARGOS deployment; each owns its
 * own Operations and member set.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    countryCode: text('country_code'),
    defaultLocale: text('default_locale').notNull().default('en'),
    status: text('status').notNull().default('active'),
    terminology: jsonb('terminology').$type<Record<string, Record<string, string>>>().default({}),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusCheck: check('organizations_status_check', sql`${t.status} IN ('active','archived')`),
    slugFormat: check(
      'organizations_slug_format',
      sql`${t.slug} = lower(${t.slug}) AND ${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' AND ${t.slug} ~ '[a-z]'`
    )
  })
);

/**
 * Operation = a campaign run by an Organization. Slug is unique per org;
 * routes live under /{orgSlug}/{opSlug}/...
 */
export const operations = pgTable(
  'operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    defaultLocale: text('default_locale').notNull().default('en'),
    aoPolygon: geographyPolygon('ao_polygon'),
    terminology: jsonb('terminology').$type<Record<string, Record<string, string>>>().default({}),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    orgSlug: unique('operations_org_slug_unique').on(t.organizationId, t.slug),
    // Prerequisite for composite FKs from translations and audit_entries.
    idOrgUnique: unique('operations_id_org_unique').on(t.id, t.organizationId),
    statusCheck: check('operations_status_check', sql`${t.status} IN ('active','archived')`),
    slugFormat: check(
      'operations_slug_format',
      sql`${t.slug} = lower(${t.slug}) AND ${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' AND ${t.slug} ~ '[a-z]'`
    ),
    orgIdx: index('operations_organization_id_idx').on(t.organizationId)
  })
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    /** FK to locales.code added via migration 0002 (schema can't easily express the cross-file FK). */
    preferredLocale: text('preferred_locale'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    /** Bumped by `revoke-all` so already-issued access JWTs become invalid: the
     *  hooks-server verifier compares this against `tv` in the JWT claim set. */
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    emailLower: check('users_email_lower_check', sql`${t.email} = lower(${t.email})`)
  })
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.organizationId, t.role] }),
    roleCheck: check('organization_members_role_check', sql`${t.role} IN ('admin','member')`),
    orgIdx: index('organization_members_org_id_idx').on(t.organizationId)
  })
);

export const userOperationRoles = pgTable(
  'user_operation_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.operationId, t.role] }),
    roleCheck: check(
      'user_operation_roles_role_check',
      sql`${t.role} IN ('coordinator','trapper','vet','caretaker','data_manager','observer')`
    ),
    opIdx: index('user_operation_roles_op_id_idx').on(t.operationId)
  })
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    /** All tokens descended from a single login share a family_id; theft detection
     *  revokes the whole family on any reuse of an already-rotated token. */
    familyId: uuid('family_id').notNull(),
    /** Pointer to the token this one rotated from (null for the family root). */
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tokenHashUnique: unique('refresh_tokens_token_hash_unique').on(t.tokenHash),
    userIdx: index('refresh_tokens_user_id_idx').on(t.userId),
    familyIdx: index('refresh_tokens_family_id_idx').on(t.familyId),
    expiresIdx: index('refresh_tokens_expires_at_idx').on(t.expiresAt)
  })
);

/**
 * Append-only via a Postgres trigger installed in migration 0002.
 * Composite FK (organization_id, operation_id) → operations(organization_id, id)
 * also installed in 0002 to prevent cross-tenant override.
 *
 * `organizationId` deliberately has no `.references()` here: a simple FK with
 * ON DELETE SET NULL collides with the `audit_entries_op_implies_org` CHECK
 * during org-delete cascades (PG fires SET NULL on org_id while op_id is still
 * set, and the CHECK aborts). Reference integrity for `organization_id` is
 * enforced instead by the `audit_entries_org_id_validate` trigger installed
 * in migration 0005.
 */
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id'),
    operationId: uuid('operation_id'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: uuid('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent')
  },
  (t) => ({
    // Timestamp-leading indexes are scanned newest-first (SITREP timeline,
    // forensic queries) — store DESC to keep the index pre-sorted.
    orgIdx: index('audit_entries_org_ts_idx').on(t.organizationId, t.ts.desc()),
    opIdx: index('audit_entries_op_ts_idx').on(t.operationId, t.ts.desc()),
    actorIdx: index('audit_entries_actor_ts_idx').on(t.actorUserId, t.ts.desc()),
    entityIdx: index('audit_entries_entity_idx').on(t.entityType, t.entityId),
    requestIdx: index('audit_entries_request_id_idx').on(t.requestId),
    actionCheck: check(
      'audit_entries_action_check',
      sql`${t.action} IN ('create','update','delete','transition','login','logout','login_failed','session_revoked','session_theft_detected')`
    )
  })
);
