import type { StateMachine } from './machine';

/**
 * The single source of truth for the site lifecycle state machine. Imported
 * by both the server (validators + API enforcement) and the client (dossier
 * UI picker). Pure data — no runtime dependencies — so it can cross the
 * server/client boundary safely.
 *
 * **Always mirror `sites_lifecycle_check` in the DB** (see migration 0001):
 * adding a state here without updating the CHECK constraint will let the
 * server insert rows the DB rejects.
 */
export type SiteState =
  | 'discovered'
  | 'assessed'
  | 'in_sanitation'
  | 'at_threshold'
  | 'in_hold'
  | 'handed_over'
  | 'archived';

export const siteMachine: StateMachine<SiteState> = {
  initial: 'discovered',
  transitions: {
    discovered: ['assessed', 'archived'],
    assessed: ['in_sanitation', 'archived'],
    in_sanitation: ['at_threshold', 'in_hold', 'archived'],
    at_threshold: ['in_hold', 'archived'],
    in_hold: ['handed_over', 'in_sanitation', 'archived'],
    handed_over: ['in_hold', 'archived'],
    archived: []
  },
  terminal: ['archived']
};
