import { randomUUID } from 'node:crypto';
import type { Handle } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/auth/jwt';
import { pickLocale } from '$lib/server/i18n';

const PLATFORM_DEFAULT_LOCALE = process.env.PLATFORM_DEFAULT_LOCALE ?? 'en';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = randomUUID();
  event.locals.user = null;

  // Auth: Bearer header first, then access cookie.
  const authHeader = event.request.headers.get('authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const c = event.cookies.get('argos_access');
    if (c) token = c;
  }
  if (token) {
    try {
      event.locals.user = await verifyAccessToken(token);
    } catch {
      event.locals.user = null;
    }
  }

  const cookieLocale = event.cookies.get('argos_locale');
  event.locals.locale = await pickLocale(
    event.locals.user?.locale ?? cookieLocale ?? null,
    event.request.headers.get('accept-language'),
    null,
    PLATFORM_DEFAULT_LOCALE
  );

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
  });
};
