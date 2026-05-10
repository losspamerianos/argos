/**
 * Reserved top-level slugs that must not be used as Organization slugs.
 *
 * Filesystem routes ('/api', '/static') already win over the [orgSlug]
 * dynamic param at runtime, so nothing breaks if a clashing slug exists –
 * but the org route will simply be unreachable. Block these names at
 * Org-creation time to avoid silent shadowing.
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
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  '_app',
  '_internal',
  '_layout',
  '_page'
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
