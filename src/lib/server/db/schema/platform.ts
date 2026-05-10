import { pgTable, uuid, text, timestamp, boolean, jsonb, primaryKey, unique } from 'drizzle-orm/pg-core';
import { geographyPolygon } from '../postgis';

/**
 * Organization = the host body that runs Operations on the platform.
 * Multiple Orgs can coexist on a single ARGOS deployment; each owns its
 * own Operations and member set.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** ISO 3166-1 alpha-2; informational only, no FK. */
  countryCode: text('country_code'),
  defaultLocale: text('default_locale').notNull().default('en'),
  status: text('status').notNull().default('active'),
  /** Org-level terminology overrides: { locale: { 'ontology.site.colony': 'Kolonie' } } */
  terminology: jsonb('terminology').$type<Record<string, Record<string, string>>>().default({}),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

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
    orgSlug: unique('operations_org_slug_unique').on(t.organizationId, t.slug)
  })
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  preferredLocale: text('preferred_locale'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

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
    pk: primaryKey({ columns: [t.userId, t.organizationId, t.role] })
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
    pk: primaryKey({ columns: [t.userId, t.operationId, t.role] })
  })
);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const auditEntries = pgTable('audit_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  operationId: uuid('operation_id').references(() => operations.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>()
});
