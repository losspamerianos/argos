import type { StateMachine } from './machine';

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
