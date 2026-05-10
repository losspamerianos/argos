import { pgTable, uuid, text, timestamp, integer, jsonb, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { operations } from './platform';
import { geographyPoint, geographyPolygon } from '../postgis';

export const sectors = pgTable(
  'sectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('operational'),
    polygon: geographyPolygon('polygon'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    kindCheck: check('sectors_kind_check', sql`${t.kind} IN ('operational','perimeter','offlimits')`),
    opIdx: index('sectors_op_id_idx').on(t.operationId)
  })
);

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    point: geographyPoint('point'),
    lifecycleState: text('lifecycle_state').notNull().default('discovered'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    lifecycleCheck: check(
      'sites_lifecycle_check',
      sql`${t.lifecycleState} IN ('discovered','assessed','in_sanitation','at_threshold','in_hold','handed_over','archived')`
    ),
    opIdx: index('sites_op_id_idx').on(t.operationId),
    sectorIdx: index('sites_sector_id_idx').on(t.sectorId),
    lifecycleIdx: index('sites_lifecycle_idx').on(t.operationId, t.lifecycleState)
  })
);

export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    contact: jsonb('contact')
      .$type<{ email?: string; phone?: string; address?: string }>()
      .default({}),
    rolesInOperation: jsonb('roles_in_operation').$type<string[]>().notNull().default([]),
    homePoint: geographyPoint('home_point'),
    notes: text('notes'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    opIdx: index('persons_op_id_idx').on(t.operationId)
  })
);

export const animals = pgTable(
  'animals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    currentSiteId: uuid('current_site_id').references(() => sites.id, { onDelete: 'set null' }),
    identifiers: jsonb('identifiers')
      .$type<{ ear_clip?: 'left' | 'right' | 'none'; chip?: string; name?: string }>()
      .default({}),
    sex: text('sex'),
    estAgeMonths: integer('est_age_months'),
    description: text('description'),
    lifecycleState: text('lifecycle_state').notNull().default('sighted'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    sexCheck: check('animals_sex_check', sql`${t.sex} IS NULL OR ${t.sex} IN ('female','male','unknown')`),
    lifecycleCheck: check(
      'animals_lifecycle_check',
      sql`${t.lifecycleState} IN ('sighted','identified','trap_target','captured','operated','recovering','released','monitored','adopted','deceased')`
    ),
    opIdx: index('animals_op_id_idx').on(t.operationId),
    siteIdx: index('animals_current_site_id_idx').on(t.currentSiteId),
    lifecycleIdx: index('animals_lifecycle_idx').on(t.operationId, t.lifecycleState)
  })
);

/**
 * site_id ON DELETE RESTRICT (set in migration 0002) so handover history is
 * not silently destroyed when a site is hard-deleted.
 */
export const handovers = pgTable(
  'handovers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'restrict' }),
    leadCaretakerId: uuid('lead_caretaker_id').references(() => persons.id, {
      onDelete: 'set null'
    }),
    status: text('status').notNull().default('none'),
    since: timestamp('since', { withTimezone: true }),
    notes: text('notes')
  },
  (t) => ({
    statusCheck: check('handovers_status_check', sql`${t.status} IN ('none','in_progress','handed_over')`),
    opIdx: index('handovers_op_id_idx').on(t.operationId),
    siteIdx: index('handovers_site_id_idx').on(t.siteId)
  })
);
