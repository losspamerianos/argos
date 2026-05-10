import type { StateMachine } from './machine';

export type LeadState = 'open' | 'triaged' | 'scheduled' | 'in_progress' | 'resolved' | 'dropped';

export const leadMachine: StateMachine<LeadState> = {
  initial: 'open',
  transitions: {
    open: ['triaged', 'dropped'],
    triaged: ['scheduled', 'dropped'],
    scheduled: ['in_progress', 'dropped', 'open'],
    in_progress: ['resolved', 'dropped', 'scheduled'],
    resolved: [],
    dropped: ['open']
  },
  terminal: ['resolved']
};
