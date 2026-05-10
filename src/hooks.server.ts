import { randomUUID } from 'node:crypto';
import { error, type Handle } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/auth/jwt';
import { ACCESS_COOKIE, LOCALE_COOKIE } from '$lib/server/auth/cookies';
import { pickLocale } from '$lib/server/i18n';

const PLATFORM_DEFAULT_LOCALE = process.env.PLATFORM_DEFAULT_LOCALE ?? 'en';
const SAFE_LOCALE_RE = /^[a-zA-Z-]{2,16}$/;

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = randomUUID();
  event.locals.user = null;

  // Origin check on state-changing requests, regardless of CSRF defaults.
  const method = event.request.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = event.request.headers.get('origin');
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // invalid origin → block
      }
      if (originHost !== event.url.host) {
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
      event.locals.user = await verifyAccessToken(token);
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
