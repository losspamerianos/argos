-- Seed the five initial UI locales for ARGOS.
-- Run after drizzle migrations have created the `locales` table.
--
-- Usage:
--   docker compose exec -T db psql -U argos -d argos < db/seed/01_locales.sql
--
-- Or, idempotently, this file is safe to re-run.

INSERT INTO locales (code, display_name, is_default, enabled, fallback_locale, display_order) VALUES
  ('en', 'English',     TRUE,  TRUE, NULL, 0),
  ('gr', 'Ελληνικά',    FALSE, TRUE, 'en', 1),
  ('tr', 'Türkçe',      FALSE, TRUE, 'en', 2),
  ('de', 'Deutsch',     FALSE, TRUE, 'en', 3),
  ('ru', 'Русский',     FALSE, TRUE, 'en', 4)
ON CONFLICT (code) DO UPDATE SET
  display_name    = EXCLUDED.display_name,
  is_default      = EXCLUDED.is_default,
  enabled         = EXCLUDED.enabled,
  fallback_locale = EXCLUDED.fallback_locale,
  display_order   = EXCLUDED.display_order;
