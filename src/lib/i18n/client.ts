/**
 * Client-side i18n. The server hands a snapshot of the active locale's
 * translation map down via `+layout.server.ts`; this module wraps it in a
 * lightweight `t()` callable for components.
 */

export type ClientTranslations = {
  locale: string;
  fallbackLocale: string;
  base: Record<string, string>;
  byOperation: Record<string, Record<string, string>>;
  fallbackBase: Record<string, string>;
};

export function makeClientT(translations: ClientTranslations) {
  return (
    key: string,
    params?: Record<string, string | number>,
    opts?: { operationId?: string }
  ): string => {
    const lookup = (
      base: Record<string, string>,
      byOp: Record<string, Record<string, string>>
    ): string | undefined => {
      if (opts?.operationId) {
        const op = byOp[opts.operationId];
        if (op && key in op) return op[key];
      }
      return base[key];
    };
    const raw =
      lookup(translations.base, translations.byOperation) ??
      translations.fallbackBase[key] ??
      key;
    return interpolate(raw, params);
  };
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
