import type { SiteTransitionPayload, SiteLifecycleState } from '$lib/types/api';
import { isPlainObject, type ValidationResult } from './common';

const SITE_STATES: readonly SiteLifecycleState[] = [
  'discovered',
  'assessed',
  'in_sanitation',
  'at_threshold',
  'in_hold',
  'handed_over',
  'archived'
] as const;

const STATE_SET = new Set<string>(SITE_STATES);

/**
 * Shape-validates the transition payload. **Does not** consult the state
 * machine — the caller (endpoint) reads the current state from the DB row
 * and uses `assertTransition(siteMachine, from, to)` to enforce the legal
 * graph. Keeping the machine check in the endpoint avoids a stale snapshot
 * of valid states being baked into the validator at request-decode time.
 */
export function parseSiteTransitionPayload(
  body: unknown
): ValidationResult<SiteTransitionPayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };
  if (!Object.hasOwn(body, 'to')) return { ok: false, code: 'missing_to' };
  const to = body.to;
  if (typeof to !== 'string' || !STATE_SET.has(to)) {
    return { ok: false, code: 'invalid_target_state' };
  }
  return { ok: true, value: { to: to as SiteLifecycleState } };
}
