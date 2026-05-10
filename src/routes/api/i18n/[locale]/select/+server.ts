import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { setLocaleCookie } from '$lib/server/auth/cookies';
import { invalidateLocaleMeta, listEnabledLocales } from '$lib/server/i18n';

const LOCALE_FORMAT = /^[a-z]{2}(-[A-Z]{2})?$/;

export const POST: RequestHandler = async ({ params, cookies }) => {
  if (!LOCALE_FORMAT.test(params.locale)) throw error(400, 'invalid_locale_format');

  let enabled = await listEnabledLocales();
  if (!enabled.some((l) => l.code === params.locale)) {
    // The locale-meta cache is process-local and never auto-invalidates, so a
    // newly-enabled locale would otherwise get rejected forever. On miss,
    // refresh the cache once and try again before giving up.
    invalidateLocaleMeta();
    enabled = await listEnabledLocales();
    if (!enabled.some((l) => l.code === params.locale)) {
      throw error(404, 'unknown_locale');
    }
  }

  setLocaleCookie(cookies, params.locale);
  return json({ ok: true, locale: params.locale });
};
