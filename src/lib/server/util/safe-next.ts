/**
 * Defend against open-redirect: only allow the `next` query parameter to point
 * back at a same-origin path. Anything that could be interpreted as a fully
 * qualified URL or protocol-relative reference is reset to the fallback.
 *
 * The decoded form of the path is also checked, because some browsers (notably
 * older Safari/iOS) collapse `%5C` → `\` before navigation, so a literal-byte
 * filter alone misses the obvious bypasses.
 */
const MAX_NEXT_LENGTH = 4096;
const FORBIDDEN_PREFIXES_LOWER = ['//', '/\\', '/%2f', '/%5c'];
// Reject any control character (NUL, CR, LF, TAB, DEL, …) and any backslash.
// CR/LF can split into HTTP header injection through downstream proxies that
// interpret the redirect Location loosely.
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\x00-\x1f\x7f\\]/;

export function safeNext(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback;
  if (!raw.startsWith('/')) return fallback;
  const lower = raw.toLowerCase();
  if (FORBIDDEN_PREFIXES_LOWER.some((p) => lower.startsWith(p))) return fallback;
  if (BAD_CHARS.test(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return fallback;
  if (BAD_CHARS.test(decoded)) return fallback;
  return raw;
}
