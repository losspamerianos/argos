/**
 * Server-side re-export of the lifecycle state-machine kernel. Authoritative
 * definition lives at `$lib/shared/lifecycle/machine` so the client can pull
 * the same data without dragging server-only code into the browser bundle.
 */
export {
  type StateMachine,
  canTransition,
  nextStates,
  isTerminal,
  TransitionError,
  assertTransition
} from '$lib/shared/lifecycle/machine';
