-- Seed Nine Lives Operations (NLO) and its first Operation, OP HELENA.
--
-- Run after migrations (0000 + 0001) and locales seed (01_locales.sql).
-- Idempotent: ON CONFLICT DO UPDATE refreshes scalar fields. The AO polygon
-- is a coarse rectangle around the Pyla/Oroklini corridor; refine via the
-- map drawing tool when implemented.
--
-- Usage:
--   docker compose exec -T db psql -U argos -d argos < db/seed/02_nlo_helena.sql

INSERT INTO organizations (slug, name, country_code, default_locale, status)
VALUES ('nlo', 'Nine Lives Operations', 'CY', 'en', 'active')
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  country_code   = EXCLUDED.country_code,
  default_locale = EXCLUDED.default_locale,
  status         = EXCLUDED.status,
  updated_at     = now();

INSERT INTO operations (organization_id, slug, name, default_locale, status, ao_polygon)
SELECT
  org.id,
  'helena',
  'OP HELENA',
  'en',
  'active',
  ST_GeogFromText(
    'POLYGON((33.620 34.920, 33.620 35.000, 33.710 35.000, 33.710 34.920, 33.620 34.920))'
  )
FROM organizations org
WHERE org.slug = 'nlo'
ON CONFLICT (organization_id, slug) DO UPDATE SET
  name           = EXCLUDED.name,
  default_locale = EXCLUDED.default_locale,
  status         = EXCLUDED.status,
  ao_polygon     = EXCLUDED.ao_polygon,
  updated_at     = now();
