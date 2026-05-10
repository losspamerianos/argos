import type { Cookies } from '@sveltejs/kit';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from './jwt';

/**
 * COOKIES_SECURE drives both the `Secure` flag and the `__Secure-` cookie name
 * prefix. In production we expect the deployment to set this independently of
 * NODE_ENV so the secure flag never silently regresses behind a misconfigured
 * proxy.
 */
const SECURE = process.env.COOKIES_SECURE === 'true';
const PREFIX = SECURE ? '__Secure-' : '';

export const ACCESS_COOKIE = `${PREFIX}argos_access`;
export const REFRESH_COOKIE = `${PREFIX}argos_refresh`;
export const LOCALE_COOKIE = `${PREFIX}argos_locale`;

const REFRESH_COOKIE_PATH = '/api/auth';

export function setAuthCookies(
  cookies: Cookies,
  accessToken: string,
  refreshTokenRaw: string
) {
  cookies.set(ACCESS_COOKIE, accessToken, {
    path: '/',
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    maxAge: ACCESS_TTL_SECONDS
  });
  cookies.set(REFRESH_COOKIE, refreshTokenRaw, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: SECURE,
    sameSite: 'strict',
    maxAge: REFRESH_TTL_SECONDS
  });
}

export function clearAuthCookies(cookies: Cookies) {
  cookies.delete(ACCESS_COOKIE, { path: '/' });
  cookies.delete(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export function setLocaleCookie(cookies: Cookies, locale: string) {
  cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  });
}

export const COOKIES_SECURE = SECURE;
