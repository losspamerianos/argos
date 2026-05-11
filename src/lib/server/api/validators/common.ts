/**
 * Shared validation helpers for hand-rolled API validators.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string };

const ATTR_KEYS_MAX = 64;
const ATTR_SERIALISED_MAX = 8192;
const ATTR_DEPTH_MAX = 6;
const ATTR_KEY_LEN_MAX = 128;
// Reject prototype-pollution sinks. Even though JSON.parse stores `__proto__`
// as an own property (no actual pollution at parse time), downstream code that
// spreads the object can still trip the inherited prototype. Cheap defence.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a user-supplied `attributes` blob: plain object, ≤ATTR_KEYS_MAX
 * top-level keys, no forbidden keys (at any depth), bounded depth, bounded
 * serialised size. Returns the same object on success (or normalised empty).
 */
export function validateAttributes(
  raw: unknown
): ValidationResult<Record<string, unknown>> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, code: 'invalid_attributes' };
  if (Object.keys(raw).length > ATTR_KEYS_MAX) {
    return { ok: false, code: 'attributes_too_many_keys' };
  }
  const depthErr = walkForForbidden(raw, 0);
  if (depthErr) return { ok: false, code: depthErr };
  let serialised: string;
  try {
    serialised = JSON.stringify(raw);
  } catch {
    return { ok: false, code: 'invalid_attributes' };
  }
  if (serialised.length > ATTR_SERIALISED_MAX) {
    return { ok: false, code: 'attributes_too_large' };
  }
  return { ok: true, value: raw };
}

function walkForForbidden(node: unknown, depth: number): string | null {
  if (depth > ATTR_DEPTH_MAX) return 'attributes_too_deep';
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const v of node) {
      const err = walkForForbidden(v, depth + 1);
      if (err) return err;
    }
    return null;
  }
  for (const k of Object.keys(node)) {
    if (FORBIDDEN_KEYS.has(k)) return 'forbidden_attribute_key';
    if (k.length > ATTR_KEY_LEN_MAX) return 'attribute_key_too_long';
    const err = walkForForbidden((node as Record<string, unknown>)[k], depth + 1);
    if (err) return err;
  }
  return null;
}

/** RFC 4122 v4 UUID (version nibble = 4, variant nibble in {8,9,a,b}). */
export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** lon/lat pair validation. Both must be present or both absent. */
export type PointResult =
  | { kind: 'present'; lon: number; lat: number }
  | { kind: 'absent' }
  | { kind: 'error'; code: string };

export function validatePoint(body: Record<string, unknown>): PointResult {
  const hasLon = body.lon !== undefined && body.lon !== null;
  const hasLat = body.lat !== undefined && body.lat !== null;
  if (hasLon !== hasLat) return { kind: 'error', code: 'incomplete_point' };
  if (!hasLon && !hasLat) return { kind: 'absent' };
  if (typeof body.lon !== 'number' || !Number.isFinite(body.lon)) {
    return { kind: 'error', code: 'invalid_lon' };
  }
  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) {
    return { kind: 'error', code: 'invalid_lat' };
  }
  if (body.lon < -180 || body.lon > 180) return { kind: 'error', code: 'invalid_lon' };
  if (body.lat < -90 || body.lat > 90) return { kind: 'error', code: 'invalid_lat' };
  return { kind: 'present', lon: body.lon, lat: body.lat };
}
