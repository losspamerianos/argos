import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, cookies }) => {
  cookies.set('argos_locale', params.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false
  });
  return json({ ok: true, locale: params.locale });
};
