import { randomUUID } from 'node:crypto';
import { error, type Handle } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/auth/jwt';
import { ACCESS_COOKIE, LOCALE_COOKIE } from '$lib/server/auth/cookies';
import { pickLocale } from '$lib/server/i18n';
import { getTokenVersion } from '$lib/server/auth/token-version-cache';

const PLATFORM_DEFAULT_LOCALE = process.env.PLATFORM_DEFAULT_LOCALE ?? 'en';
const SAFE_LOCALE_RE = /^[a-zA-Z-]{2,16}$/;

// When the app sits behind a trusted reverse proxy (Caddy, nginx, …) the
// edge terminates TLS and forwards plain HTTP to us. The browser's Origin
// header reflects the public scheme (https://…); `event.url` reflects the
// internal scheme (http://…). Comparing them naively would 403 every POST.
// Honor `X-Forwarded-Proto` only when `TRUST_PROXY=1` is set, so a direct
// hit to the dev port without a proxy can't spoof its scheme.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SAFE_PROTO_RE = /^https?$/;

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = randomUUID();
  event.locals.user = null;

  // Origin check on state-changing requests, regardless of CSRF defaults.
  // Compare full origin (scheme + host + port), not just host, so that an
  // http://… page cannot pose as a same-host https://… principal.
  const method = event.request.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const originHeader = event.request.headers.get('origin');
    if (originHeader) {
      let originNorm: string | null = null;
      try {
        const u = new URL(originHeader);
        originNorm = `${u.protocol}//${u.host}`;
      } catch {
        // invalid origin → block
      }
      // When trusted-proxied, reconstruct the expected origin using
      // `X-Forwarded-Proto` so the scheme matches the public-facing URL the
      // browser saw, not the internal http hop Vite serves on.
      let expectedOrigin = event.url.origin;
      if (TRUST_PROXY) {
        const xfp = event.request.headers.get('x-forwarded-proto');
        if (xfp && SAFE_PROTO_RE.test(xfp)) {
          expectedOrigin = `${xfp}:` + expectedOrigin.slice(expectedOrigin.indexOf('//'));
        }
      }
      if (originNorm !== expectedOrigin) {
        throw error(403, 'cross_origin_blocked');
      }
    }
  }

  // Auth: Bearer header first, access cookie as fallback.
  const authHeader = event.request.headers.get('authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const c = event.cookies.get(ACCESS_COOKIE);
    if (c) token = c;
  }
  if (token) {
    try {
      const claims = await verifyAccessToken(token);
      // Token-version check: stateless JWTs cannot be unilaterally revoked, so
      // we keep a counter on `users.token_version` that revoke-all bumps. A
      // mismatch here means the access token outlived an explicit revocation.
      // The cache halves the per-request DB cost; see token-version-cache.ts
      // for the staleness/recovery-window trade-off.
      const tv = await getTokenVersion(claims.sub);
      if (tv !== null && tv === claims.tv) {
        event.locals.user = claims;
      }
    } catch {
      event.locals.user = null;
    }
  }

  const cookieLocale = event.cookies.get(LOCALE_COOKIE);
  event.locals.locale = await pickLocale(
    event.locals.user?.locale ?? cookieLocale ?? null,
    event.request.headers.get('accept-language'),
    null,
    PLATFORM_DEFAULT_LOCALE
  );

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      const safeLocale = SAFE_LOCALE_RE.test(event.locals.locale)
        ? event.locals.locale
        : 'en';
      return html.replace('%lang%', safeLocale);
    }
  });

  response.headers.set('x-request-id', event.locals.requestId);
  return response;
};
