/**
 * Server-side i18n. Translations live in the DB; this module loads them per
 * locale into a process-local cache and provides a `t()` helper that resolves
 * lookups in the order:
 *   operation override → platform default → fallback locale → key itself.
 *
 * Cache invalidation hooks into Postgres LISTEN/NOTIFY in a follow-up step;
 * for the skeleton, restart the process to reload.
 */
import { db } from '../db';
import { translations, locales } from '../db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';

type LocaleCache = Map<string /* namespace.key */, string>;
type OperationCache = Map<string /* operationId */, LocaleCache>;
type LocaleStore = {
  base: LocaleCache;
  byOperation: OperationCache;
};

const store = new Map<string /* locale */, LocaleStore>();
let localesMeta: Awaited<ReturnType<typeof db.select>> | null = null;

async function loadLocaleMeta() {
  return await db.select().from(locales).where(eq(locales.enabled, true));
}

async function loadLocaleIntoCache(locale: string): Promise<LocaleStore> {
  const rows = await db
    .select()
    .from(translations)
    .where(eq(translations.locale, locale));

  const localeStore: LocaleStore = { base: new Map(), byOperation: new Map() };

  for (const r of rows) {
    const fullKey = `${r.namespace}.${r.key}`;
    if (r.operationId === null) {
      localeStore.base.set(fullKey, r.value);
    } else {
      let opCache = localeStore.byOperation.get(r.operationId);
      if (!opCache) {
        opCache = new Map();
        localeStore.byOperation.set(r.operationId, opCache);
      }
      opCache.set(fullKey, r.value);
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
  opts?: { operationId?: string }
) => string;

export async function makeT(locale: string, fallbackLocale = 'en'): Promise<TFn> {
  const primary = await ensureLocaleLoaded(locale);
  const fallback = locale === fallbackLocale ? primary : await ensureLocaleLoaded(fallbackLocale);

  return (key, params, opts) => {
    const lookup = (s: LocaleStore): string | undefined => {
      if (opts?.operationId) {
        const op = s.byOperation.get(opts.operationId);
        if (op?.has(key)) return op.get(key);
      }
      return s.base.get(key);
    };
    const raw = lookup(primary) ?? lookup(fallback) ?? key;
    return interpolate(raw, params);
  };
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export async function listEnabledLocales() {
  if (!localesMeta) localesMeta = await loadLocaleMeta();
  return localesMeta;
}

export async function pickLocale(
  preferred: string | null | undefined,
  acceptLanguage: string | null | undefined,
  operationDefault: string | null | undefined,
  platformDefault: string
): Promise<string> {
  const enabled = (await listEnabledLocales()).map((l) => (l as { code: string }).code);
  const candidates = [preferred, ...parseAcceptLanguage(acceptLanguage), operationDefault, platformDefault];
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
