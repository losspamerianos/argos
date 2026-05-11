import type { CreateSitePayload } from '$lib/types/api';
import {
  isPlainObject,
  validateAttributes,
  validatePoint,
  type ValidationResult
} from './common';

export type { ValidationResult };

const SITE_KIND_RE = /^[a-z0-9_-]{1,64}$/;
const NAME_MIN = 1;
const NAME_MAX = 200;

export function parseCreateSitePayload(body: unknown): ValidationResult<CreateSitePayload> {
  if (!isPlainObject(body)) return { ok: false, code: 'body_not_object' };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, code: 'invalid_name' };
  }

  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  if (!SITE_KIND_RE.test(kind)) return { ok: false, code: 'invalid_kind' };

  const point = validatePoint(body);
  if (point.kind === 'error') return { ok: false, code: point.code };

  const attrs = validateAttributes(body.attributes);
  if (!attrs.ok) return attrs;

  return {
    ok: true,
    value: {
      name,
      kind,
      lon: point.kind === 'present' ? point.lon : null,
      lat: point.kind === 'present' ? point.lat : null,
      attributes: attrs.value
    }
  };
}
