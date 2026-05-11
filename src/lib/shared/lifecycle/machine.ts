/**
 * Tiny finite-state-machine kernel. Each domain entity gets its own machine
 * declared as a record of `state -> allowed transitions`. The machine is
 * data, not code; UI menus and server-side API enforcement both consult the
 * same definition.
 *
 * Lives under `$lib/shared/` (rather than `$lib/server/`) so it is safe to
 * import from client components without dragging server-only dependencies
 * into the browser bundle.
 */

export type StateMachine<S extends string> = {
  initial: S;
  transitions: Record<S, readonly S[]>;
  terminal?: readonly S[];
};

export function canTransition<S extends string>(m: StateMachine<S>, from: S, to: S): boolean {
  return m.transitions[from]?.includes(to) ?? false;
}

export function nextStates<S extends string>(m: StateMachine<S>, from: S): readonly S[] {
  return m.transitions[from] ?? [];
}

export function isTerminal<S extends string>(m: StateMachine<S>, state: S): boolean {
  return m.terminal?.includes(state) ?? false;
}

export class TransitionError extends Error {
  constructor(
    public from: string,
    public to: string
  ) {
    super(`illegal transition: ${from} -> ${to}`);
    this.name = 'TransitionError';
  }
}

export function assertTransition<S extends string>(m: StateMachine<S>, from: S, to: S): void {
  if (!canTransition(m, from, to)) throw new TransitionError(from, to);
}
