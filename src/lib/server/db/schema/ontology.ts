import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { operations } from './platform';
import { geographyPoint, geographyPolygon } from '../postgis';

export const sectors = pgTable('sectors', {
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
});

export const sites = pgTable('sites', {
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
});

export const persons = pgTable('persons', {
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
});

export const animals = pgTable('animals', {
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
});

export const handovers = pgTable('handovers', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  leadCaretakerId: uuid('lead_caretaker_id').references(() => persons.id, {
    onDelete: 'set null'
  }),
  status: text('status').notNull().default('none'),
  since: timestamp('since', { withTimezone: true }),
  notes: text('notes')
});
