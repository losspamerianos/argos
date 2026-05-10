/**
 * Canonical list of ontology entity types and their i18n keys. UI code
 * references these constants instead of hard-coding labels, so an Operation
 * can override the visible terminology without code changes.
 */

export const ENTITY_TYPES = [
  'operation',
  'sector',
  'site',
  'person',
  'animal',
  'sighting',
  'lead',
  'trap_event',
  'medical_event',
  'handover'
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const SITE_KINDS = [
  'colony',
  'feeding_station',
  'farm',
  'hotel',
  'shelter',
  'household',
  'other'
] as const;

export const SECTOR_KINDS = ['operational', 'perimeter', 'offlimits'] as const;

export const PERSON_ROLES = [
  'caretaker',
  'trapper',
  'vet',
  'coordinator',
  'resident',
  'business',
  'authority',
  'volunteer'
] as const;

export const TRIAGE_CATEGORIES = [1, 2, 3, 4] as const;

export function entityKey(type: EntityType, suffix: string): string {
  return `ontology.${type}.${suffix}`;
}
