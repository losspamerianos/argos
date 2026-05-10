-- Round 5 hardening:
--   1. The audit append-only trigger blocked FK ON DELETE SET NULL cascades.
--      Rewrite so the trigger permits FK-driven null-outs of the three FK
--      columns (actor_user_id, organization_id, operation_id) but still rejects
--      every other UPDATE.
--   2. Add a TRUNCATE trigger so a privileged role cannot wipe the audit table
--      in one statement.
--   3. Drop the duplicate auto-named refresh_tokens_parent_id_fkey created by a
--      prior partial migration run; keep the explicitly named _fk constraint.
--   4. Re-assert the simple FKs on audit_entries.organization_id and
--      translations.organization_id. They are NOT redundant with the composite
--      consistency FK, because MATCH SIMPLE skips integrity checks whenever
--      any FK column is NULL — the (org=X, op=NULL) row pattern (platform-level
--      audit / org-default translation) needs the simple FK to ensure X exists.
--   5. Catch users.preferred_locale = 'gr' that the original 0002 step-1 rename
--      did not touch (the FK was created in step 11, after the rename).
--   6. FK organization_id/operation_id default_locale columns to locales.code
--      so the platform vocabulary can never reference a deleted/renamed code.
--
-- Idempotent: every step is guarded.

-- ============================================================================
-- 1. Audit append-only trigger: allow FK ON DELETE SET NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_entries_block_modify()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  immutable_unchanged boolean;
  fk_only_nulled boolean;
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_entries is append-only';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The non-FK columns must be byte-identical to the old row.
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

    -- The three FK columns may only transition NOT NULL → NULL (or stay).
    -- A NULL → NOT NULL or X → Y change is rejected; only the cascade SET NULL
    -- pattern is allowed through.
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

--> statement-breakpoint

-- ============================================================================
-- 2. TRUNCATE protection.
-- ============================================================================

DROP TRIGGER IF EXISTS audit_entries_no_truncate ON audit_entries;
CREATE TRIGGER audit_entries_no_truncate
  BEFORE TRUNCATE ON audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION audit_entries_block_modify();

--> statement-breakpoint

-- ============================================================================
-- 3. Drop duplicate refresh_tokens parent_id FK.
-- ============================================================================

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_parent_id_fkey;

--> statement-breakpoint

-- ============================================================================
-- 4. Re-assert simple organization_id FKs.
--    MATCH SIMPLE on the composite (organization_id, operation_id) FK skips
--    enforcement whenever any column is NULL, so a platform-level audit row
--    (org=X, op=NULL) or org-default translation (org=X, op=NULL) gets no
--    composite-FK protection on org_id. The simple FK plugs that gap.
-- ============================================================================

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_organization_id_organizations_id_fk;
ALTER TABLE audit_entries
  ADD CONSTRAINT audit_entries_organization_id_organizations_id_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE SET NULL;

ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_organization_id_organizations_id_fk;
ALTER TABLE translations
  ADD CONSTRAINT translations_organization_id_organizations_id_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE CASCADE;

--> statement-breakpoint

-- ============================================================================
-- 5. users.preferred_locale gr → el rename, missed by 0002 step 1.
-- ============================================================================

UPDATE users SET preferred_locale = 'el' WHERE preferred_locale = 'gr';

--> statement-breakpoint

-- ============================================================================
-- 6. default_locale FKs on organizations and operations.
-- ============================================================================

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_default_locale_fk;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_locale_fk
  FOREIGN KEY (default_locale) REFERENCES locales(code)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_default_locale_fk;
ALTER TABLE operations
  ADD CONSTRAINT operations_default_locale_fk
  FOREIGN KEY (default_locale) REFERENCES locales(code)
  ON DELETE RESTRICT ON UPDATE CASCADE;

--> statement-breakpoint

-- ============================================================================
-- 7. tokenVersion column on users so revoke-all can short-circuit access JWTs.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
