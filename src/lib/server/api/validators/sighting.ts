import type { CreateSightingPayload } from '$lib/types/api';
import {
  isPlainObject,
  validateAttributes,
  validatePoint,
  type ValidationResult
} from './common';

// Strict ISO-8601 with optional fractional seconds and a required timezone
// designator (Z or ±HH:MM). Rejects bare dates, locale strings and the
// near-max-date oddities that `Date.parse` would otherwise accept. Capture
// groups split components so the calendar-overflow check below doesn't have
// to re-parse.
const ISO_TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TS_MIN_YEAR = 1970;
const TS_MAX_YEAR = 2100;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Validate calendar components on their face, independent of timezone. The
 * regex enforces shape only — `Date.parse` would silently roll Feb 30, hour
 * 25, etc. into a different valid moment. This check rejects them outright,
 * which is what the user means by "invalid date" regardless of the offset
 * suffix.
 */
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

// RFC 4122 v4 UUID (version nibble = 4, variant nibble in {8,9,a,b}).
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DESC_MAX = 4000;

const FIELDS_NOT_YET_SUPPORTED = ['observedAnimalId', 'reportedByPersonId', 'photos'];

export function parseCreateSightingPayload(
  body: unknown
): ValidationResult<CreateSightingPayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  for (const k of FIELDS_NOT_YET_SUPPORTED) {
    // `Object.hasOwn` rather than `k in body`: the latter walks the
    // prototype chain, which is harmless for the current keys but
    // would silently break if the list ever grew to include
    // `toString` / `constructor` / similar Object.prototype members.
    if (Object.hasOwn(body, k)) return { ok: false, code: `field_not_yet_supported:${k}` };
  }

  let ts: string | null = null;
  if (body.ts !== undefined && body.ts !== null) {
    if (typeof body.ts !== 'string') return { ok: false, code: 'invalid_ts' };
    const m = ISO_TS_RE.exec(body.ts);
    if (!m) return { ok: false, code: 'invalid_ts' };
    // Calendar-component check is timezone-independent — earlier round-trip
    // approach via `toISOString` only worked for Z-suffixed inputs because
    // offset inputs see `Date.parse` apply the offset before rolling.
    if (!calendarComponentsValid(m)) return { ok: false, code: 'invalid_ts' };
    const parsed = Date.parse(body.ts);
    if (!Number.isFinite(parsed)) return { ok: false, code: 'invalid_ts' };
    const year = new Date(parsed).getUTCFullYear();
    if (year < TS_MIN_YEAR || year > TS_MAX_YEAR) {
      return { ok: false, code: 'invalid_ts' };
    }
    ts = new Date(parsed).toISOString();
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
