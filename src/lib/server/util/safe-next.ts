/**
 * Defend against open-redirect: only allow the `next` query parameter to point
 * back at a same-origin path. Anything that could be interpreted as a fully
 * qualified URL or protocol-relative reference is reset to the fallback.
 */
export function safeNext(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
