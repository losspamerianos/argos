-- Security & integrity hardening pass.
-- Hand-written because the diff includes triggers, CHECK constraints, composite
-- FKs and a data rename that drizzle-kit cannot synthesize.
--
-- Idempotent: every statement is guarded so this migration can be (re-)run
-- against a database that already had the original (non-idempotent) version
-- applied via psql, without erroring.

-- ============================================================================
-- 1. Locale rename: 'gr' is non-standard; ISO 639-1 for Greek is 'el'.
-- ============================================================================

UPDATE translations SET locale = 'el' WHERE locale = 'gr';
UPDATE locales      SET code = 'el' WHERE code = 'gr';
UPDATE locales      SET fallback_locale = 'el' WHERE fallback_locale = 'gr';

--> statement-breakpoint

-- ============================================================================
-- 2. refresh_tokens: token-family for replay/theft detection + indexes
-- ============================================================================

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id uuid,
  ADD COLUMN IF NOT EXISTS parent_id uuid;

DO $$ BEGIN
  ALTER TABLE refresh_tokens
    ADD CONSTRAINT refresh_tokens_parent_id_fk
    FOREIGN KEY (parent_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;

ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_unique ON refresh_tokens (token_hash);
CREATE INDEX        IF NOT EXISTS refresh_tokens_user_id_idx       ON refresh_tokens (user_id);
CREATE INDEX        IF NOT EXISTS refresh_tokens_family_id_idx     ON refresh_tokens (family_id);
CREATE INDEX        IF NOT EXISTS refresh_tokens_parent_id_idx     ON refresh_tokens (parent_id);
CREATE INDEX        IF NOT EXISTS refresh_tokens_expires_at_idx    ON refresh_tokens (expires_at);

--> statement-breakpoint

-- ============================================================================
-- 3. audit_entries: forensic columns + indexes + append-only enforcement
-- ============================================================================

ALTER TABLE audit_entries
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS audit_entries_org_ts_idx     ON audit_entries (organization_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_entries_op_ts_idx      ON audit_entries (operation_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_entries_actor_ts_idx   ON audit_entries (actor_user_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_entries_entity_idx     ON audit_entries (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_entries_request_id_idx ON audit_entries (request_id);

CREATE OR REPLACE FUNCTION audit_entries_block_modify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_entries_no_update ON audit_entries;
CREATE TRIGGER audit_entries_no_update
  BEFORE UPDATE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_entries_block_modify();

DROP TRIGGER IF EXISTS audit_entries_no_delete ON audit_entries;
CREATE TRIGGER audit_entries_no_delete
  BEFORE DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_entries_block_modify();

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_action_check;
ALTER TABLE audit_entries
  ADD CONSTRAINT audit_entries_action_check
  CHECK (action IN ('create','update','delete','transition','login','logout','login_failed','session_revoked','session_theft_detected'));

--> statement-breakpoint

-- ============================================================================
-- 4. updated_at: trigger to bump on every UPDATE.
--    Drizzle's defaultNow() runs only on INSERT; without this trigger the
--    column is silently stale. The WHEN guard avoids no-op writes from
--    re-bumping the column when nothing else changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','operations','users','sites','persons','animals','leads','translations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) '
      'EXECUTE FUNCTION trg_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

--> statement-breakpoint

-- ============================================================================
-- 5. CHECK constraints on text-typed enum-like fields.
--    Code FSMs and the DB diverge silently without these.
-- ============================================================================

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_status_check CHECK (status IN ('active','archived'));

ALTER TABLE operations    DROP CONSTRAINT IF EXISTS operations_status_check;
ALTER TABLE operations
  ADD CONSTRAINT operations_status_check    CHECK (status IN ('active','archived'));

-- Slugs: lowercase, valid pattern, must contain at least one a-z letter.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_slug_format;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_format CHECK (
    slug = lower(slug) AND
    slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' AND
    slug ~ '[a-z]'
  );
ALTER TABLE operations    DROP CONSTRAINT IF EXISTS operations_slug_format;
ALTER TABLE operations
  ADD CONSTRAINT operations_slug_format CHECK (
    slug = lower(slug) AND
    slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' AND
    slug ~ '[a-z]'
  );

-- Email canonical lower
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lower_check;
ALTER TABLE users
  ADD CONSTRAINT users_email_lower_check CHECK (email = lower(email));

-- Role enums
ALTER TABLE organization_members  DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('admin','member'));
ALTER TABLE user_operation_roles  DROP CONSTRAINT IF EXISTS user_operation_roles_role_check;
ALTER TABLE user_operation_roles
  ADD CONSTRAINT user_operation_roles_role_check
  CHECK (role IN ('coordinator','trapper','vet','caretaker','data_manager','observer'));

-- Lifecycle states: one CHECK per table, mirrors lib/server/lifecycle/*.ts
ALTER TABLE sites   DROP CONSTRAINT IF EXISTS sites_lifecycle_check;
ALTER TABLE sites
  ADD CONSTRAINT sites_lifecycle_check
  CHECK (lifecycle_state IN
    ('discovered','assessed','in_sanitation','at_threshold','in_hold','handed_over','archived'));
ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_lifecycle_check;
ALTER TABLE animals
  ADD CONSTRAINT animals_lifecycle_check
  CHECK (lifecycle_state IN
    ('sighted','identified','trap_target','captured','operated','recovering','released','monitored','adopted','deceased'));
ALTER TABLE leads   DROP CONSTRAINT IF EXISTS leads_lifecycle_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_lifecycle_check
  CHECK (lifecycle_state IN
    ('open','triaged','scheduled','in_progress','resolved','dropped'));

-- Sectors / handovers
ALTER TABLE sectors   DROP CONSTRAINT IF EXISTS sectors_kind_check;
ALTER TABLE sectors
  ADD CONSTRAINT sectors_kind_check
  CHECK (kind IN ('operational','perimeter','offlimits'));
ALTER TABLE handovers DROP CONSTRAINT IF EXISTS handovers_status_check;
ALTER TABLE handovers
  ADD CONSTRAINT handovers_status_check
  CHECK (status IN ('none','in_progress','handed_over'));

-- Animals.sex
ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_sex_check;
ALTER TABLE animals
  ADD CONSTRAINT animals_sex_check
  CHECK (sex IS NULL OR sex IN ('female','male','unknown'));

-- medical_events.triage 1..4
ALTER TABLE medical_events DROP CONSTRAINT IF EXISTS medical_events_triage_check;
ALTER TABLE medical_events
  ADD CONSTRAINT medical_events_triage_check
  CHECK (triage_category IS NULL OR triage_category BETWEEN 1 AND 4);

--> statement-breakpoint

-- ============================================================================
-- 6. operations: prerequisite UNIQUE(id, organization_id) so other tables can
--    declare composite FKs that prevent cross-tenant override.
--
--    Idempotency: a plain DROP IF EXISTS won't work because translations and
--    audit_entries' composite FKs depend on this UNIQUE; the DROP would need
--    CASCADE and re-installing the FKs. Instead we ADD ... and swallow the
--    duplicate_table exception (which is what PG raises for UNIQUE collision).
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE operations
    ADD CONSTRAINT operations_id_org_unique UNIQUE (id, organization_id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

--> statement-breakpoint

-- ============================================================================
-- 7. translations: composite FK (organization_id, operation_id) → operations.
--    Without this, an org-A admin could plant a translation row pointing at
--    op-B's id and have it served on op-B's pages.
--
--    The CHECK below closes the MATCH SIMPLE partial-NULL bypass: with the
--    default MATCH SIMPLE, (org=NULL, op=Y) would skip the FK check entirely.
--    The precedence model (op override → org override → platform default)
--    requires that op_id implies org_id, so we enforce it explicitly.
-- ============================================================================

ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_op_implies_org;
ALTER TABLE translations
  ADD CONSTRAINT translations_op_implies_org
  CHECK (operation_id IS NULL OR organization_id IS NOT NULL);

ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_operation_id_operations_id_fk;
ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_op_org_consistent_fk;
ALTER TABLE translations
  ADD CONSTRAINT translations_op_org_consistent_fk
  FOREIGN KEY (organization_id, operation_id)
  REFERENCES operations(organization_id, id)
  ON DELETE CASCADE;

-- locale FK: explicit ON DELETE RESTRICT (was NO ACTION) and ON UPDATE CASCADE
-- so that a future locale-code rename (already needed for gr→el above) cascades.
ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_locale_locales_code_fk;
ALTER TABLE translations
  ADD CONSTRAINT translations_locale_locales_code_fk
  FOREIGN KEY (locale) REFERENCES locales(code)
  ON DELETE RESTRICT ON UPDATE CASCADE;

--> statement-breakpoint

-- ============================================================================
-- 8. audit_entries: composite FK so org_id and op_id cannot disagree.
--    Same MATCH SIMPLE bypass closure as translations.
-- ============================================================================

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_op_implies_org;
ALTER TABLE audit_entries
  ADD CONSTRAINT audit_entries_op_implies_org
  CHECK (operation_id IS NULL OR organization_id IS NOT NULL);

ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_operation_id_operations_id_fk;
ALTER TABLE audit_entries DROP CONSTRAINT IF EXISTS audit_entries_op_org_consistent_fk;
ALTER TABLE audit_entries
  ADD CONSTRAINT audit_entries_op_org_consistent_fk
  FOREIGN KEY (organization_id, operation_id)
  REFERENCES operations(organization_id, id)
  ON DELETE SET NULL;

--> statement-breakpoint

-- ============================================================================
-- 9. Indexes on every FK and tenant-filter column.
--    drizzle-kit emitted zero indexes; every join against operation_id /
--    organization_id was a sequential scan.
-- ============================================================================

CREATE INDEX IF NOT EXISTS operations_organization_id_idx       ON operations           (organization_id);
CREATE INDEX IF NOT EXISTS organization_members_org_id_idx      ON organization_members (organization_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx     ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS user_operation_roles_op_id_idx       ON user_operation_roles (operation_id);
CREATE INDEX IF NOT EXISTS user_operation_roles_user_id_idx     ON user_operation_roles (user_id);

CREATE INDEX IF NOT EXISTS sectors_op_id_idx                    ON sectors              (operation_id);

CREATE INDEX IF NOT EXISTS sites_op_id_idx                      ON sites                (operation_id);
CREATE INDEX IF NOT EXISTS sites_sector_id_idx                  ON sites                (sector_id);
CREATE INDEX IF NOT EXISTS sites_lifecycle_idx                  ON sites                (operation_id, lifecycle_state);

CREATE INDEX IF NOT EXISTS persons_op_id_idx                    ON persons              (operation_id);

CREATE INDEX IF NOT EXISTS animals_op_id_idx                    ON animals              (operation_id);
CREATE INDEX IF NOT EXISTS animals_current_site_id_idx          ON animals              (current_site_id);
CREATE INDEX IF NOT EXISTS animals_lifecycle_idx                ON animals              (operation_id, lifecycle_state);

CREATE INDEX IF NOT EXISTS sightings_op_id_idx                  ON sightings            (operation_id);
CREATE INDEX IF NOT EXISTS sightings_site_id_idx                ON sightings            (site_id);
CREATE INDEX IF NOT EXISTS sightings_animal_id_idx              ON sightings            (observed_animal_id);
CREATE INDEX IF NOT EXISTS sightings_person_id_idx              ON sightings            (reported_by_person_id);
CREATE INDEX IF NOT EXISTS sightings_ts_idx                     ON sightings            (operation_id, ts DESC);

CREATE INDEX IF NOT EXISTS leads_op_id_idx                      ON leads                (operation_id);
CREATE INDEX IF NOT EXISTS leads_lifecycle_idx                  ON leads                (operation_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS leads_assignee_idx                   ON leads                (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS leads_site_id_idx                    ON leads                (site_id);
CREATE INDEX IF NOT EXISTS leads_priority_idx                   ON leads                (operation_id, priority_score DESC);

CREATE INDEX IF NOT EXISTS trap_events_op_id_idx                ON trap_events          (operation_id);
CREATE INDEX IF NOT EXISTS trap_events_lead_id_idx              ON trap_events          (lead_id);
CREATE INDEX IF NOT EXISTS trap_events_site_id_idx              ON trap_events          (site_id);
CREATE INDEX IF NOT EXISTS trap_events_animal_id_idx            ON trap_events          (trapped_animal_id);

CREATE INDEX IF NOT EXISTS medical_events_op_id_idx             ON medical_events       (operation_id);
CREATE INDEX IF NOT EXISTS medical_events_animal_id_idx         ON medical_events       (animal_id);
CREATE INDEX IF NOT EXISTS medical_events_vet_id_idx            ON medical_events       (vet_person_id);
CREATE INDEX IF NOT EXISTS medical_events_ts_idx                ON medical_events       (operation_id, ts DESC);

CREATE INDEX IF NOT EXISTS handovers_op_id_idx                  ON handovers            (operation_id);
CREATE INDEX IF NOT EXISTS handovers_site_id_idx                ON handovers            (site_id);

CREATE INDEX IF NOT EXISTS translations_locale_idx              ON translations         (locale);
CREATE INDEX IF NOT EXISTS translations_org_id_idx              ON translations         (organization_id);
CREATE INDEX IF NOT EXISTS translations_op_id_idx               ON translations         (operation_id);
CREATE INDEX IF NOT EXISTS translations_namespace_key_idx       ON translations         (namespace, key);

CREATE INDEX IF NOT EXISTS users_preferred_locale_idx           ON users                (preferred_locale);

--> statement-breakpoint

-- ============================================================================
-- 10. ON DELETE policy revisits — keep history through cascade boundaries.
--     RESTRICT both ways: archiving an animal/site requires explicit lifecycle
--     transition, never a silent cascade through a parent delete.
-- ============================================================================

ALTER TABLE medical_events DROP CONSTRAINT IF EXISTS medical_events_animal_id_animals_id_fk;
ALTER TABLE medical_events
  ADD CONSTRAINT medical_events_animal_id_animals_id_fk
  FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE RESTRICT;

ALTER TABLE handovers DROP CONSTRAINT IF EXISTS handovers_site_id_sites_id_fk;
ALTER TABLE handovers
  ADD CONSTRAINT handovers_site_id_sites_id_fk
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;

--> statement-breakpoint

-- ============================================================================
-- 11. preferred_locale FK so users.preferred_locale is always a known code.
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferred_locale_fk;
ALTER TABLE users
  ADD CONSTRAINT users_preferred_locale_fk
  FOREIGN KEY (preferred_locale) REFERENCES locales(code)
  ON DELETE SET NULL ON UPDATE CASCADE;
