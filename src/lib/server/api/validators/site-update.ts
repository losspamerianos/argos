import type { UpdateSitePayload } from '$lib/types/api';
import {
  isPlainObject,
  validateAttributes,
  validatePoint,
  type ValidationResult
} from './common';

const SITE_KIND_RE = /^[a-z0-9_-]{1,64}$/;
const NAME_MIN = 1;
const NAME_MAX = 200;

/**
 * Fields the wire shape does **not** support today. `lifecycleState` is
 * channelled through the transition endpoint so the state machine is
 * authoritative; `sectorId` waits for Sprint-2 (sector management).
 * Rejecting them up front beats silently dropping — the caller sees what
 * they did wrong instead of wondering why nothing changed.
 */
const FIELDS_NOT_YET_SUPPORTED = ['lifecycleState', 'sectorId', 'operationId', 'id'];

/**
 * Partial-update payload. A field is touched only when its key is explicitly
 * present in the body. Passing `null` for an optional field clears it; the
 * absence of the key leaves the column untouched.
 *
 * `attributes` is replace-not-merge: when present, the value is the new
 * complete blob. We do not deep-merge into the existing attributes because
 * deep-merge semantics are surprising (how do you remove a key?) and the
 * existing column is small enough that the caller can read-modify-write.
 */
export function parseUpdateSitePayload(body: unknown): ValidationResult<UpdateSitePayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  for (const k of FIELDS_NOT_YET_SUPPORTED) {
    if (Object.hasOwn(body, k)) return { ok: false, code: `field_not_yet_supported:${k}` };
  }

  const out: UpdateSitePayload = {};
  let touched = false;

  if (Object.hasOwn(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return { ok: false, code: 'invalid_name' };
    }
    out.name = name;
    touched = true;
  }

  if (Object.hasOwn(body, 'kind')) {
    const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
    if (!SITE_KIND_RE.test(kind)) return { ok: false, code: 'invalid_kind' };
    out.kind = kind;
    touched = true;
  }

  // `validatePoint` enforces both-or-neither; we treat the *pair* as a single
  // logical field. If the caller passes only one of {lon, lat} as present
  // and the other absent, that's incomplete_point.
  const lonPresent = Object.hasOwn(body, 'lon');
  const latPresent = Object.hasOwn(body, 'lat');
  if (lonPresent || latPresent) {
    if (lonPresent !== latPresent) return { ok: false, code: 'incomplete_point' };
    // Allow `null/null` as "clear the point". Otherwise validate.
    if (body.lon === null && body.lat === null) {
      out.lon = null;
      out.lat = null;
    } else {
      const pt = validatePoint(body);
      if (pt.kind === 'error') return { ok: false, code: pt.code };
      if (pt.kind === 'absent') return { ok: false, code: 'incomplete_point' };
      out.lon = pt.lon;
      out.lat = pt.lat;
    }
    touched = true;
  }

  if (Object.hasOwn(body, 'attributes')) {
    const attrs = validateAttributes(body.attributes);
    if (!attrs.ok) return attrs;
    out.attributes = attrs.value;
    touched = true;
  }

  // Reject empty/no-op PATCHes. The Sprint-1 dossier UI always serialises
  // the full edit form so this path is unreachable from the in-tree
  // client today; a future caller that diffs-before-send (auto-save on
  // blur, partial-update API consumers) will earn this code.
  if (!touched) return { ok: false, code: 'no_fields_to_update' };

  return { ok: true, value: out };
}
