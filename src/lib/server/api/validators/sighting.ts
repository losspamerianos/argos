import type { CreateSightingPayload } from '$lib/types/api';
import {
  isPlainObject,
  parseIsoTimestamp,
  UUID_V4_RE,
  validateAttributes,
  validatePoint,
  type ValidationResult
} from './common';

const DESC_MAX = 4000;

/**
 * Fields the wire shape does not support yet. Both create and update reject
 * them up front so the caller learns immediately, rather than silently
 * dropping unknown keys.
 */
export const SIGHTING_FIELDS_NOT_YET_SUPPORTED = [
  'observedAnimalId',
  'reportedByPersonId',
  'photos'
] as const;

export function parseCreateSightingPayload(
  body: unknown
): ValidationResult<CreateSightingPayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  for (const k of SIGHTING_FIELDS_NOT_YET_SUPPORTED) {
    // `Object.hasOwn` rather than `k in body`: the latter walks the
    // prototype chain, which is harmless for the current keys but
    // would silently break if the list ever grew to include
    // `toString` / `constructor` / similar Object.prototype members.
    if (Object.hasOwn(body, k)) return { ok: false, code: `field_not_yet_supported:${k}` };
  }

  let ts: string | null = null;
  if (body.ts !== undefined && body.ts !== null) {
    const parsed = parseIsoTimestamp(body.ts);
    if (!parsed.ok) return parsed;
    ts = parsed.value;
  }

  const point = validatePoint(body);
  if (point.kind === 'error') return { ok: false, code: point.code };

  let siteId: string | null = null;
  if (body.siteId !== undefined && body.siteId !== null) {
    if (typeof body.siteId !== 'string' || !UUID_V4_RE.test(body.siteId)) {
      return { ok: false, code: 'invalid_site_id' };
    }
    siteId = body.siteId;
  }

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return { ok: false, code: 'invalid_description' };
    }
    const trimmed = body.description.trim();
    if (trimmed.length > DESC_MAX) return { ok: false, code: 'description_too_long' };
    description = trimmed.length > 0 ? trimmed : null;
  }

  const attrs = validateAttributes(body.attributes);
  if (!attrs.ok) return attrs;

  return {
    ok: true,
    value: {
      ts,
      lon: point.kind === 'present' ? point.lon : null,
      lat: point.kind === 'present' ? point.lat : null,
      siteId,
      description,
      attributes: attrs.value
    }
  };
}
