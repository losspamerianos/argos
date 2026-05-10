import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { setLocaleCookie } from '$lib/server/auth/cookies';
import { listEnabledLocales } from '$lib/server/i18n';

const LOCALE_FORMAT = /^[a-z]{2}(-[A-Z]{2})?$/;

export const POST: RequestHandler = async ({ params, cookies }) => {
  if (!LOCALE_FORMAT.test(params.locale)) throw error(400, 'invalid_locale_format');

  const enabled = await listEnabledLocales();
  if (!enabled.some((l) => l.code === params.locale)) {
    throw error(404, 'unknown_locale');
  }

  setLocaleCookie(cookies, params.locale);
  return json({ ok: true, locale: params.locale });
};
