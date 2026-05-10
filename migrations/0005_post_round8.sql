-- Round 9 hardening:
--   1. Schema-source ↔ DB drift: audit_entries.organizationId no longer claims
--      `.references()`. This DROP is the migration drizzle-kit emits for that
--      change, made idempotent so it succeeds on DBs where 0004 already did
--      the drop AND on fresh DBs where 0000-0004 ran sequentially.
--   2. Composite FK ON DELETE: switch from SET NULL to NO ACTION + a trigger
--      that nulls *only* operation_id on op delete, preserving the org
--      attribution that the SET NULL variant unconditionally threw away.
--   3. Reference-integrity trigger for audit_entries.organization_id: with no
--      simple FK in place, MATCH SIMPLE on the composite FK skipped validation
--      whenever operation_id was NULL, allowing inserts with bogus org_ids.
--      The trigger validates on every INSERT/UPDATE where the column is not
--      NULL but skips the cascade SET NULL path (column value is NULL there).

-- ============================================================================
-- 1. audit_entries.organization_id: drop the simple FK (idempotent).
-- ============================================================================

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_organization_id_organizations_id_fk;

--> statement-breakpoint

-- ============================================================================
-- 2. Composite FK: ON DELETE SET NULL → NO ACTION, plus operations BEFORE
--    DELETE trigger that nulls only operation_id (preserves organization_id).
-- ============================================================================

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_op_org_consistent_fk;
ALTER TABLE audit_entries
  ADD CONSTRAINT audit_entries_op_org_consistent_fk
  FOREIGN KEY (organization_id, operation_id)
  REFERENCES operations(organization_id, id)
  ON DELETE NO ACTION;

CREATE OR REPLACE FUNCTION audit_entries_clear_op_on_op_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  -- Null only operation_id; keep organization_id as a forensic record of the
  -- org under which the event happened. The audit append-only trigger permits
  -- this transition because organization_id is unchanged and operation_id
  -- moves NOT NULL → NULL, which is in the allow-list.
  UPDATE audit_entries
     SET operation_id = NULL
   WHERE operation_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_entries_clear_op_on_op_delete ON operations;
CREATE TRIGGER audit_entries_clear_op_on_op_delete
  BEFORE DELETE ON operations
  FOR EACH ROW EXECUTE FUNCTION audit_entries_clear_op_on_op_delete();

--> statement-breakpoint

-- ============================================================================
-- 3. Reference-integrity trigger for audit_entries.organization_id.
--    Fires only on INSERT/UPDATE; the cascade SET NULL paths come through
--    with NEW.organization_id IS NULL and skip the existence check.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_entries_org_id_validate()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id)
  THEN
    RAISE EXCEPTION 'audit_entries.organization_id references unknown organization %',
      NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_entries_org_id_validate ON audit_entries;
CREATE TRIGGER audit_entries_org_id_validate
  BEFORE INSERT OR UPDATE OF organization_id ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_entries_org_id_validate();
