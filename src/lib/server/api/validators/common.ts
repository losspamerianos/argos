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

/**
 * Strict ISO-8601 with optional fractional seconds and a required timezone
 * designator (Z or ±HH:MM). Rejects bare dates, locale strings and the
 * near-max-date oddities that `Date.parse` would otherwise accept. Capture
 * groups split components so the calendar-overflow check below doesn't have
 * to re-parse.
 */
const ISO_TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TS_MIN_YEAR = 1970;
const TS_MAX_YEAR = 2100;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function calendarComponentsValid(m: RegExpExecArray): boolean {
  const M = Number.parseInt(m[2]!, 10);
  const D = Number.parseInt(m[3]!, 10);
  const H = Number.parseInt(m[4]!, 10);
  const Mi = Number.parseInt(m[5]!, 10);
  const S = m[6] ? Number.parseInt(m[6], 10) : 0;
  if (M < 1 || M > 12) return false;
  if (H > 23 || Mi > 59 || S > 59) return false;
  const Y = Number.parseInt(m[1]!, 10);
  const daysInMonth = [
    31, isLeapYear(Y) ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31
  ];
  if (D < 1 || D > daysInMonth[M - 1]!) return false;
  return true;
}

/**
 * Parse a wire-format ISO-8601 timestamp into a canonical UTC string.
 *
 * Accepts strings only. Validates calendar components on their face
 * (Feb 30, hour 24, leap-second :60, Feb 29 in non-leap years all reject)
 * timezone-independently, then bounds the UTC year to `[1970, 2100]` to
 * reject `Date.parse` near-max-date oddities. Returns the canonical UTC
 * ISO string (`toISOString` form) on success.
 *
 * On error, the code is always `invalid_ts` — the caller can wrap with a
 * field-specific code if they want different copy.
 *
 * **Known operational gap (Phase 2)**: the `[1970, 2100]` bound is
 * shape-only; this validator cannot consult per-operation context (e.g.
 * `operation.createdAt`) so a user *can* backdate a sighting to before
 * the operation existed. Endpoints that care should layer a contextual
 * sanity check on top (e.g. `ts >= op.createdAt - 1y`).
 */
export function parseIsoTimestamp(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') return { ok: false, code: 'invalid_ts' };
  const m = ISO_TS_RE.exec(raw);
  if (!m) return { ok: false, code: 'invalid_ts' };
  if (!calendarComponentsValid(m)) return { ok: false, code: 'invalid_ts' };
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { ok: false, code: 'invalid_ts' };
  const year = new Date(parsed).getUTCFullYear();
  if (year < TS_MIN_YEAR || year > TS_MAX_YEAR) {
    return { ok: false, code: 'invalid_ts' };
  }
  return { ok: true, value: new Date(parsed).toISOString() };
}

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
