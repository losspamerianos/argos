import { pgTable, text, timestamp, boolean, integer, uuid, unique } from 'drizzle-orm/pg-core';
import { operations, organizations } from './platform';

export const locales = pgTable('locales', {
  code: text('code').primaryKey(),
  displayName: text('display_name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  fallbackLocale: text('fallback_locale'),
  displayOrder: integer('display_order').notNull().default(0)
});

/**
 * Translations are namespaced and locale-keyed. Both organization_id and
 * operation_id can be NULL (platform-wide), set to an org (org-wide override),
 * or set together for an operation-specific override.
 *
 * Lookup chain: operation override → org override → platform default →
 * fallback locale → key.
 */
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    locale: text('locale')
      .notNull()
      .references(() => locales.code),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade'
    }),
    operationId: uuid('operation_id').references(() => operations.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniq: unique('translations_unique')
      .on(t.namespace, t.key, t.locale, t.organizationId, t.operationId)
      .nullsNotDistinct()
  })
);
