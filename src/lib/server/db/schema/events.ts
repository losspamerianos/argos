import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { operations, users } from './platform';
import { sites, animals, persons } from './ontology';
import { geographyPoint } from '../postgis';

export const sightings = pgTable('sightings', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  observedAnimalId: uuid('observed_animal_id').references(() => animals.id, {
    onDelete: 'set null'
  }),
  reportedByPersonId: uuid('reported_by_person_id').references(() => persons.id, {
    onDelete: 'set null'
  }),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  point: geographyPoint('point'),
  description: text('description'),
  photos: jsonb('photos').$type<string[]>().default([]),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({})
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  sourceSightingId: uuid('source_sighting_id').references(() => sightings.id, {
    onDelete: 'set null'
  }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  targetAnimalId: uuid('target_animal_id').references(() => animals.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  priorityScore: integer('priority_score').notNull().default(0),
  assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
    onDelete: 'set null'
  }),
  lifecycleState: text('lifecycle_state').notNull().default('open'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  notes: text('notes'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const trapEvents = pgTable('trap_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  trappedAnimalId: uuid('trapped_animal_id').references(() => animals.id, {
    onDelete: 'set null'
  }),
  trapperPersonId: uuid('trapper_person_id').references(() => persons.id, {
    onDelete: 'set null'
  }),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  point: geographyPoint('point'),
  trapsSet: integer('traps_set'),
  result: text('result'),
  notes: text('notes')
});

export const medicalEvents = pgTable('medical_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  animalId: uuid('animal_id')
    .notNull()
    .references(() => animals.id, { onDelete: 'cascade' }),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  kind: text('kind').notNull(),
  vetPersonId: uuid('vet_person_id').references(() => persons.id, { onDelete: 'set null' }),
  triageCategory: integer('triage_category'),
  outcome: text('outcome'),
  notes: text('notes'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({})
});
