import type { StateMachine } from './machine';

export type AnimalState =
  | 'sighted'
  | 'identified'
  | 'trap_target'
  | 'captured'
  | 'operated'
  | 'recovering'
  | 'released'
  | 'monitored'
  | 'adopted'
  | 'deceased';

export const animalMachine: StateMachine<AnimalState> = {
  initial: 'sighted',
  transitions: {
    sighted: ['identified', 'deceased'],
    identified: ['trap_target', 'monitored', 'deceased'],
    trap_target: ['captured', 'identified', 'deceased'],
    captured: ['operated', 'released', 'adopted', 'deceased'],
    operated: ['recovering', 'deceased'],
    recovering: ['released', 'adopted', 'deceased'],
    released: ['monitored', 'trap_target', 'deceased'],
    monitored: ['trap_target', 'adopted', 'deceased'],
    adopted: ['deceased'],
    deceased: []
  },
  terminal: ['deceased', 'adopted']
};
