import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  unique,
  index
} from 'drizzle-orm/pg-core';
// `operations` is intentionally NOT imported here: the composite FK
// translations(organization_id, operation_id) → operations(organization_id, id)
// is installed in migration 0002, not in the Drizzle schema, so referencing the
// table here would create a circular import (platform → i18n → platform).

export const locales = pgTable('locales', {
  code: text('code').primaryKey(),
  displayName: text('display_name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  fallbackLocale: text('fallback_locale'),
  displayOrder: integer('display_order').notNull().default(0)
});

/**
 * Translations are namespaced and locale-keyed. Three precedence levels:
 *   - operation override: organization_id and operation_id both set
 *   - org override: organization_id set, operation_id NULL
 *   - platform default: both NULL
 *
 * Composite FK (organization_id, operation_id) → operations(organization_id, id)
 * is installed in migration 0002 to prevent cross-tenant override (an org-A
 * admin planting a row pointing at op-B). The locale FK is `ON UPDATE CASCADE
 * ON DELETE RESTRICT`, also from 0002.
 *
 * Lookup chain: operation override → org override → platform default →
 * fallback locale (same chain) → key itself.
 */
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    locale: text('locale')
      .notNull()
      .references(() => locales.code, { onDelete: 'restrict', onUpdate: 'cascade' }),
    organizationId: uuid('organization_id'),
    operationId: uuid('operation_id'),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniq: unique('translations_unique')
      .on(t.namespace, t.key, t.locale, t.organizationId, t.operationId)
      .nullsNotDistinct(),
    localeIdx: index('translations_locale_idx').on(t.locale),
    orgIdx: index('translations_org_id_idx').on(t.organizationId),
    opIdx: index('translations_op_id_idx').on(t.operationId),
    nsKeyIdx: index('translations_namespace_key_idx').on(t.namespace, t.key)
  })
);
