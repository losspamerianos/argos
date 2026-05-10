/**
 * Server-side i18n. Translations live in the DB; this module loads them
 * per locale into a process-local cache and provides a `t()` helper that
 * resolves lookups in the order:
 *   operation override → org override → platform default →
 *   fallback locale (same chain) → key itself.
 *
 * Cache invalidation hooks into Postgres LISTEN/NOTIFY in a follow-up step;
 * for the skeleton, restart the process to reload.
 */
import { db } from '../db';
import { translations, locales } from '../db/schema';
import { eq } from 'drizzle-orm';

type LocaleCache = Map<string /* namespace.key */, string>;
type ScopeCache = Map<string /* scope-id */, LocaleCache>;
type LocaleStore = {
  base: LocaleCache;
  byOrg: ScopeCache;
  byOperation: ScopeCache;
};

const store = new Map<string /* locale */, LocaleStore>();
let localesMeta: { code: string; displayName: string; isDefault: boolean }[] | null = null;

async function loadLocaleMeta() {
  return await db
    .select({
      code: locales.code,
      displayName: locales.displayName,
      isDefault: locales.isDefault
    })
    .from(locales)
    .where(eq(locales.enabled, true));
}

async function loadLocaleIntoCache(locale: string): Promise<LocaleStore> {
  const rows = await db.select().from(translations).where(eq(translations.locale, locale));

  const localeStore: LocaleStore = { base: new Map(), byOrg: new Map(), byOperation: new Map() };

  for (const r of rows) {
    const fullKey = `${r.namespace}.${r.key}`;
    if (r.operationId !== null) {
      let opCache = localeStore.byOperation.get(r.operationId);
      if (!opCache) {
        opCache = new Map();
        localeStore.byOperation.set(r.operationId, opCache);
      }
      opCache.set(fullKey, r.value);
    } else if (r.organizationId !== null) {
      let orgCache = localeStore.byOrg.get(r.organizationId);
      if (!orgCache) {
        orgCache = new Map();
        localeStore.byOrg.set(r.organizationId, orgCache);
      }
      orgCache.set(fullKey, r.value);
    } else {
      localeStore.base.set(fullKey, r.value);
    }
  }

  store.set(locale, localeStore);
  return localeStore;
}

async function ensureLocaleLoaded(locale: string): Promise<LocaleStore> {
  return store.get(locale) ?? (await loadLocaleIntoCache(locale));
}

export type TFn = (
  key: string,
  params?: Record<string, string | number>,
  scope?: { organizationId?: string; operationId?: string }
) => string;

export async function makeT(locale: string, fallbackLocale = 'en'): Promise<TFn> {
  const primary = await ensureLocaleLoaded(locale);
  const fallback =
    locale === fallbackLocale ? primary : await ensureLocaleLoaded(fallbackLocale);

  return (key, params, scope) => {
    const lookup = (s: LocaleStore): string | undefined => {
      if (scope?.operationId) {
        const op = s.byOperation.get(scope.operationId);
        if (op?.has(key)) return op.get(key);
      }
      if (scope?.organizationId) {
        const org = s.byOrg.get(scope.organizationId);
        if (org?.has(key)) return org.get(key);
      }
      return s.base.get(key);
    };
    const raw = lookup(primary) ?? lookup(fallback) ?? key;
    return interpolate(raw, params);
  };
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

export async function listEnabledLocales() {
  if (!localesMeta) localesMeta = await loadLocaleMeta();
  return localesMeta;
}

export async function pickLocale(
  preferred: string | null | undefined,
  acceptLanguage: string | null | undefined,
  scopeDefault: string | null | undefined,
  platformDefault: string
): Promise<string> {
  const enabled = (await listEnabledLocales()).map((l) => l.code);
  const candidates = [
    preferred,
    ...parseAcceptLanguage(acceptLanguage),
    scopeDefault,
    platformDefault
  ];
  for (const c of candidates) {
    if (c && enabled.includes(c)) return c;
  }
  return platformDefault;
}

function parseAcceptLanguage(h: string | null | undefined): string[] {
  if (!h) return [];
  return h
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase())
    .map((tag) => tag.split('-')[0])
    .filter(Boolean);
}
