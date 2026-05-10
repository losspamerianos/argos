import type { CreateSitePayload } from '$lib/types/api';

const SITE_KIND_RE = /^[a-z0-9_-]{1,64}$/;
const NAME_MIN = 1;
const NAME_MAX = 200;
const ATTRS_KEYS_MAX = 64;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string };

export function parseCreateSitePayload(body: unknown): ValidationResult<CreateSitePayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, code: 'invalid_name' };
  }

  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  if (!SITE_KIND_RE.test(kind)) return { ok: false, code: 'invalid_kind' };

  // lon/lat: both must be present and finite, or both absent/null. A site with
  // a name but no point is legitimate (mapped later). A half-pair is a bug.
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

  let attributes: Record<string, unknown> = {};
  if (body.attributes !== undefined && body.attributes !== null) {
    if (!isPlainObject(body.attributes)) return { ok: false, code: 'invalid_attributes' };
    if (Object.keys(body.attributes).length > ATTRS_KEYS_MAX) {
      return { ok: false, code: 'attributes_too_large' };
    }
    attributes = body.attributes;
  }

  return { ok: true, value: { name, kind, lon, lat, attributes } };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
