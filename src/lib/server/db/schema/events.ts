import { pgTable, uuid, text, timestamp, integer, jsonb, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { operations, users } from './platform';
import { sites, animals, persons } from './ontology';
import { geographyPoint } from '../postgis';

export const sightings = pgTable(
  'sightings',
  {
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
  },
  (t) => ({
    opIdx: index('sightings_op_id_idx').on(t.operationId),
    siteIdx: index('sightings_site_id_idx').on(t.siteId),
    animalIdx: index('sightings_animal_id_idx').on(t.observedAnimalId),
    personIdx: index('sightings_person_id_idx').on(t.reportedByPersonId),
    tsIdx: index('sightings_ts_idx').on(t.operationId, t.ts)
  })
);

export const leads = pgTable(
  'leads',
  {
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
  },
  (t) => ({
    lifecycleCheck: check(
      'leads_lifecycle_check',
      sql`${t.lifecycleState} IN ('open','triaged','scheduled','in_progress','resolved','dropped')`
    ),
    opIdx: index('leads_op_id_idx').on(t.operationId),
    lifecycleIdx: index('leads_lifecycle_idx').on(t.operationId, t.lifecycleState),
    assigneeIdx: index('leads_assignee_idx').on(t.assignedToUserId),
    siteIdx: index('leads_site_id_idx').on(t.siteId),
    priorityIdx: index('leads_priority_idx').on(t.operationId, t.priorityScore)
  })
);

export const trapEvents = pgTable(
  'trap_events',
  {
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
  },
  (t) => ({
    opIdx: index('trap_events_op_id_idx').on(t.operationId),
    leadIdx: index('trap_events_lead_id_idx').on(t.leadId),
    siteIdx: index('trap_events_site_id_idx').on(t.siteId),
    animalIdx: index('trap_events_animal_id_idx').on(t.trappedAnimalId)
  })
);

/**
 * animal_id ON DELETE RESTRICT (set in migration 0002): a TNR programme's
 * medical record is the most load-bearing audit data; a hard delete must
 * surface as an explicit operator action, not cascade silently.
 */
export const medicalEvents = pgTable(
  'medical_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'cascade' }),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'restrict' }),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    kind: text('kind').notNull(),
    vetPersonId: uuid('vet_person_id').references(() => persons.id, { onDelete: 'set null' }),
    triageCategory: integer('triage_category'),
    outcome: text('outcome'),
    notes: text('notes'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().default({})
  },
  (t) => ({
    triageCheck: check(
      'medical_events_triage_check',
      sql`${t.triageCategory} IS NULL OR ${t.triageCategory} BETWEEN 1 AND 4`
    ),
    opIdx: index('medical_events_op_id_idx').on(t.operationId),
    animalIdx: index('medical_events_animal_id_idx').on(t.animalId),
    vetIdx: index('medical_events_vet_id_idx').on(t.vetPersonId),
    tsIdx: index('medical_events_ts_idx').on(t.operationId, t.ts)
  })
);
