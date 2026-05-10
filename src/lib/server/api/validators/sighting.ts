import type { CreateSightingPayload } from '$lib/types/api';
import type { ValidationResult } from './site';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESC_MAX = 4000;
const ATTRS_KEYS_MAX = 64;

const FIELDS_NOT_YET_SUPPORTED = ['observedAnimalId', 'reportedByPersonId', 'photos'];

export function parseCreateSightingPayload(
  body: unknown
): ValidationResult<CreateSightingPayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  for (const k of FIELDS_NOT_YET_SUPPORTED) {
    if (k in body) return { ok: false, code: `field_not_yet_supported:${k}` };
  }

  // ts is optional: server defaults to now() when absent.
  let ts: string | null = null;
  if (body.ts !== undefined && body.ts !== null) {
    if (typeof body.ts !== 'string') return { ok: false, code: 'invalid_ts' };
    const parsed = Date.parse(body.ts);
    if (!Number.isFinite(parsed)) return { ok: false, code: 'invalid_ts' };
    ts = new Date(parsed).toISOString();
  }

  const hasLon = body.lon !== undefined && body.lon !== null;
  const hasLat = body.lat !== undefined && body.lat !== null;
  if (hasLon !== hasLat) return { ok: false, code: 'incomplete_point' };
  let lon: number | null = null;
  let lat: number | null = null;
  if (hasLon && hasLat) {
    if (typeof body.lon !== 'number' || !Number.isFinite(body.lon)) {
      return { ok: false, code: 'invalid_lon' };
    }
    if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) {
      return { ok: false, code: 'invalid_lat' };
    }
    if (body.lon < -180 || body.lon > 180) return { ok: false, code: 'invalid_lon' };
    if (body.lat < -90 || body.lat > 90) return { ok: false, code: 'invalid_lat' };
    lon = body.lon;
    lat = body.lat;
  }

  let siteId: string | null = null;
  if (body.siteId !== undefined && body.siteId !== null) {
    if (typeof body.siteId !== 'string' || !UUID_RE.test(body.siteId)) {
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

  let attributes: Record<string, unknown> = {};
  if (body.attributes !== undefined && body.attributes !== null) {
    if (!isPlainObject(body.attributes)) return { ok: false, code: 'invalid_attributes' };
    if (Object.keys(body.attributes).length > ATTRS_KEYS_MAX) {
      return { ok: false, code: 'attributes_too_large' };
    }
    attributes = body.attributes;
  }

  return { ok: true, value: { ts, lon, lat, siteId, description, attributes } };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
