-- Round 7 hardening:
--   1. Drop the simple FK on audit_entries.organization_id. The Round-5 attempt
--      to plug the MATCH SIMPLE NULL bypass via this FK collided with the
--      `audit_entries_op_implies_org` CHECK during org-delete cascades: the
--      simple FK fires SET NULL on organization_id while operation_id is still
--      set, and the CHECK aborts the cascade. The composite consistency FK
--      (organization_id, operation_id) → operations(...) already nulls *both*
--      atomically when an op is deleted; combined with the CHECK, the bypass
--      that worried us — (org=NULL, op=Y) — is rejected at insert time anyway.
--   2. Drop redundant single-column user_id indexes on tables whose composite
--      PK already starts with user_id. Index covers the same prefix queries.
--   3. Prevent refresh_tokens.parent_id from pointing at its own row (a
--      self-cycle defeats theft-detection chain walks).
--   4. FK locales.fallback_locale → locales.code (parallel to the default_locale
--      FKs added in 0003) and forbid self-fallback.
--   5. Pin search_path inside the audit and updated_at trigger functions.

-- ============================================================================
-- 1. Drop the audit_entries simple FK that collides with op_implies_org.
-- ============================================================================

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_organization_id_organizations_id_fk;

--> statement-breakpoint

-- ============================================================================
-- 2. Drop redundant user_id indexes on composite-PK tables.
-- ============================================================================

DROP INDEX IF EXISTS organization_members_user_id_idx;
DROP INDEX IF EXISTS user_operation_roles_user_id_idx;

--> statement-breakpoint

-- ============================================================================
-- 3. refresh_tokens.parent_id self-cycle CHECK.
-- ============================================================================

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_parent_id_not_self;
ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_parent_id_not_self
  CHECK (parent_id IS NULL OR parent_id <> id);

--> statement-breakpoint

-- ============================================================================
-- 4. locales.fallback_locale FK + no-self-fallback CHECK.
-- ============================================================================

ALTER TABLE locales DROP CONSTRAINT IF EXISTS locales_fallback_locale_fk;
ALTER TABLE locales
  ADD CONSTRAINT locales_fallback_locale_fk
  FOREIGN KEY (fallback_locale) REFERENCES locales(code)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE locales DROP CONSTRAINT IF EXISTS locales_fallback_not_self;
ALTER TABLE locales
  ADD CONSTRAINT locales_fallback_not_self
  CHECK (fallback_locale IS NULL OR fallback_locale <> code);

--> statement-breakpoint

-- ============================================================================
-- 5. Pin search_path inside the trigger functions so a future schema rename
--    cannot redirect the audit-trigger logic via search_path manipulation.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_entries_block_modify()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  immutable_unchanged boolean;
  fk_only_nulled boolean;
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_entries is append-only';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    immutable_unchanged :=
      NEW.id          IS NOT DISTINCT FROM OLD.id          AND
      NEW.ts          IS NOT DISTINCT FROM OLD.ts          AND
      NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type AND
      NEW.entity_id   IS NOT DISTINCT FROM OLD.entity_id   AND
      NEW.action      IS NOT DISTINCT FROM OLD.action      AND
      NEW.before      IS NOT DISTINCT FROM OLD.before      AND
      NEW.after       IS NOT DISTINCT FROM OLD.after       AND
      NEW.request_id  IS NOT DISTINCT FROM OLD.request_id  AND
      NEW.ip_address  IS NOT DISTINCT FROM OLD.ip_address  AND
      NEW.user_agent  IS NOT DISTINCT FROM OLD.user_agent;

    fk_only_nulled :=
      (NEW.actor_user_id   IS NULL OR NEW.actor_user_id   IS NOT DISTINCT FROM OLD.actor_user_id)   AND
      (NEW.organization_id IS NULL OR NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id) AND
      (NEW.operation_id    IS NULL OR NEW.operation_id    IS NOT DISTINCT FROM OLD.operation_id);

    IF immutable_unchanged AND fk_only_nulled THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_entries is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--> statement-breakpoint

-- ============================================================================
-- 6. Index direction parity: 0002 created the timestamp- and priority-leading
--    indexes as DESC, but the Drizzle schema source had them implicit-ASC.
--    Round 7 schema source now declares `.desc()`; rebuild the indexes so the
--    snapshot matches reality and a future regenerate cannot silently swap
--    them back to ASC.
-- ============================================================================

DROP INDEX IF EXISTS "leads_priority_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "medical_events_ts_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sightings_ts_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_entries_org_ts_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_entries_op_ts_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_entries_actor_ts_idx";--> statement-breakpoint
CREATE INDEX "leads_priority_idx" ON "leads" USING btree ("operation_id","priority_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "medical_events_ts_idx" ON "medical_events" USING btree ("operation_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sightings_ts_idx" ON "sightings" USING btree ("operation_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_entries_org_ts_idx" ON "audit_entries" USING btree ("organization_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_entries_op_ts_idx" ON "audit_entries" USING btree ("operation_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_entries_actor_ts_idx" ON "audit_entries" USING btree ("actor_user_id","ts" DESC NULLS LAST);