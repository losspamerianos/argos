import type { UpdateSightingPayload } from '$lib/types/api';
import {
  isPlainObject,
  parseIsoTimestamp,
  UUID_V4_RE,
  validateAttributes,
  validatePoint,
  type ValidationResult
} from './common';
import { SIGHTING_FIELDS_NOT_YET_SUPPORTED } from './sighting';

const DESC_MAX = 4000;

/**
 * Partial-update payload for sightings. A field is touched only when its
 * key is explicitly present in the body; passing `null` for an optional
 * field clears it. `attributes` is replace-not-merge (mirror of the site
 * update validator's choice — see that file for the why).
 *
 * Same Phase-1B-deferred fields are blocked here as in create, so the wire
 * shape stays in lockstep.
 */
export function parseUpdateSightingPayload(
  body: unknown
): ValidationResult<UpdateSightingPayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  for (const k of SIGHTING_FIELDS_NOT_YET_SUPPORTED) {
    if (Object.hasOwn(body, k)) return { ok: false, code: `field_not_yet_supported:${k}` };
  }

  const out: UpdateSightingPayload = {};
  let touched = false;

  if (Object.hasOwn(body, 'ts')) {
    // `ts` is NOT NULL on the column (events.ts:21 defaults it to `now()`),
    // so "clear ts" is meaningless — reject `null` outright rather than
    // hand the validator's null through to a guaranteed 500 from the FK
    // constraint.
    if (body.ts === null) return { ok: false, code: 'invalid_ts' };
    const parsed = parseIsoTimestamp(body.ts);
    if (!parsed.ok) return parsed;
    out.ts = parsed.value;
    touched = true;
  }

  const lonPresent = Object.hasOwn(body, 'lon');
  const latPresent = Object.hasOwn(body, 'lat');
  if (lonPresent || latPresent) {
    if (lonPresent !== latPresent) return { ok: false, code: 'incomplete_point' };
    if (body.lon === null && body.lat === null) {
      out.lon = null;
      out.lat = null;
    } else {
      // Pass an explicit lon/lat-only object so `validatePoint`'s contract
      // (`hasLon = body.lon !== undefined && !== null`) reads only the
      // two fields it cares about, not whatever else the caller sent
      // alongside.
      const pt = validatePoint({ lon: body.lon, lat: body.lat });
      if (pt.kind === 'error') return { ok: false, code: pt.code };
      if (pt.kind === 'absent') return { ok: false, code: 'incomplete_point' };
      out.lon = pt.lon;
      out.lat = pt.lat;
    }
    touched = true;
  }

  if (Object.hasOwn(body, 'siteId')) {
    if (body.siteId === null) {
      out.siteId = null;
    } else {
      if (typeof body.siteId !== 'string' || !UUID_V4_RE.test(body.siteId)) {
        return { ok: false, code: 'invalid_site_id' };
      }
      out.siteId = body.siteId;
    }
    touched = true;
  }

  if (Object.hasOwn(body, 'description')) {
    if (body.description === null) {
      out.description = null;
    } else {
      if (typeof body.description !== 'string') {
        return { ok: false, code: 'invalid_description' };
      }
      const trimmed = body.description.trim();
      if (trimmed.length > DESC_MAX) return { ok: false, code: 'description_too_long' };
      // Both `null` and an all-whitespace string clear the description.
      // The dossier UI uses an empty textarea to mean "clear"; explicit
      // null is the same wire shape for programmatic callers. There is
      // intentionally no way to send a description of just spaces.
      out.description = trimmed.length > 0 ? trimmed : null;
    }
    touched = true;
  }

  if (Object.hasOwn(body, 'attributes')) {
    // Reject `attributes: null` outright — the DB column is non-null with a
    // `{}` default, so "clear to null" is meaningless. `validateAttributes`
    // would silently coerce null→{}, which is inconsistent with the wire
    // contract for the other clearable fields (`description: null` → NULL).
    if (body.attributes === null) return { ok: false, code: 'invalid_attributes' };
    const attrs = validateAttributes(body.attributes);
    if (!attrs.ok) return attrs;
    out.attributes = attrs.value;
    touched = true;
  }

  // Reject empty/no-op PATCHes. The Sprint-2 dossier UI always serialises
  // the full edit form so this path is unreachable from the in-tree client
  // today; a future diff-before-send caller would earn this code.
  if (!touched) return { ok: false, code: 'no_fields_to_update' };

  return { ok: true, value: out };
}
