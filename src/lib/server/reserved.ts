/**
 * Reserved top-level slugs. Filesystem routes (/api, /static, /login, ...) win
 * over the [orgSlug] dynamic param at runtime, so a clashing org slug is only
 * unreachable rather than dangerous — but that "unreachable" failure is a
 * support nightmare. Block them at Org-creation time.
 */
const RESERVED_ORG_SLUGS = new Set<string>([
  'api',
  'static',
  'admin',
  'platform',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'settings',
  'help',
  'support',
  'docs',
  'health',
  'about',
  'home',
  'public',
  'assets',
  'media',
  'files',
  'uploads',
  'cdn',
  'static-assets',
  'ws',
  'metrics',
  'webhook',
  'webhooks',
  'api-docs',
  'openapi',
  'terms',
  'privacy',
  'legal',
  '404',
  '500',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  '_app',
  '_internal',
  '_layout',
  '_page'
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** Reject all-numeric slugs (`123`) — they look like ids and confuse routing. */
const ALPHA_REQUIRED = /[a-z]/;

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  return SLUG_PATTERN.test(slug) && ALPHA_REQUIRED.test(slug);
}
