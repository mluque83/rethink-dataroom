-- Integrity controls enforced by PostgreSQL itself (defence in depth: they hold
-- even if application code has a bug). "Ordinary modifications" are blocked;
-- a database superuser can still alter anything, which is why acceptance
-- records are additionally hash-chained and exportable (tamper-EVIDENCE, not
-- tamper-proofing).

-- ---------------------------------------------------------------------------
-- Generic append-only guard. Retention jobs may set app.retention = 'on'
-- inside their own transaction to delete/anonymise according to policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dr_block_modification() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.retention', true) = 'on' AND TG_ARGV[0] = 'retention_allowed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION dr_block_modification('retention_allowed');
--> statement-breakpoint
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION dr_block_modification('retention_allowed');
--> statement-breakpoint
CREATE TRIGGER activity_events_append_only BEFORE UPDATE OR DELETE ON activity_events
  FOR EACH ROW EXECUTE FUNCTION dr_block_modification('retention_allowed');
--> statement-breakpoint
-- Contractual evidence: never modifiable through ordinary operations, not even by retention.
CREATE TRIGGER identity_declarations_append_only BEFORE UPDATE OR DELETE ON identity_declarations
  FOR EACH ROW EXECUTE FUNCTION dr_block_modification('never');
--> statement-breakpoint
CREATE TRIGGER acceptances_append_only BEFORE UPDATE OR DELETE ON acceptances
  FOR EACH ROW EXECUTE FUNCTION dr_block_modification('never');
--> statement-breakpoint
CREATE TRIGGER acceptances_no_truncate BEFORE TRUNCATE ON acceptances
  FOR EACH STATEMENT EXECUTE FUNCTION dr_block_modification('never');
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Acceptance records: server timestamp + hash chain computed inside the DB.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dr_acceptance_chain() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(77001);
  NEW.accepted_at := now();  -- server clock, UTC storage; client values ignored
  IF NEW.displayed_text_sha256 <> encode(sha256(convert_to(NEW.displayed_text, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'displayed_text_sha256 does not match displayed_text';
  END IF;
  SELECT record_hash INTO prev FROM acceptances ORDER BY seq DESC LIMIT 1;
  NEW.prev_record_hash := prev;
  NEW.record_hash := encode(sha256(convert_to(
      coalesce(prev, 'GENESIS') || '|' || NEW.id::text || '|' || NEW.recipient_id::text || '|' ||
      NEW.user_id || '|' || NEW.verified_email || '|' || NEW.declared_full_name || '|' ||
      coalesce(NEW.declared_company, '') || '|' || coalesce(NEW.declared_position, '') || '|' ||
      NEW.acting_capacity || '|' || coalesce(NEW.represented_entity, '') || '|' ||
      NEW.nda_version_id::text || '|' || NEW.terms_version_id::text || '|' || NEW.privacy_version_id::text || '|' ||
      NEW.displayed_text_sha256 || '|' || NEW.checkbox_label || '|' || NEW.action_label || '|' ||
      NEW.session_id || '|' || to_char(NEW.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'UTF8')), 'hex');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER acceptances_chain BEFORE INSERT ON acceptances
  FOR EACH ROW EXECUTE FUNCTION dr_acceptance_chain();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Legal texts: body hash computed by DB; body immutable once activated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dr_legal_version_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'non-draft legal text versions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.language IS DISTINCT FROM OLD.language OR NEW.legal_text_id IS DISTINCT FROM OLD.legal_text_id
       OR NEW.requires_reacceptance IS DISTINCT FROM OLD.requires_reacceptance THEN
      RAISE EXCEPTION 'activated legal text versions are immutable; create a new version';
    END IF;
    IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
      RAISE EXCEPTION 'retired versions cannot be reactivated; create a new version';
    END IF;
  END IF;
  NEW.body_sha256 := encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER legal_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON legal_text_versions
  FOR EACH ROW EXECUTE FUNCTION dr_legal_version_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Publication gate: a version can only become 'published' when every control
-- passed. Enforced here so no code path can bypass it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dr_publication_gate() RETURNS trigger AS $$
DECLARE d documents%ROWTYPE; ok_redaction boolean;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT * INTO d FROM documents WHERE id = NEW.document_id;
    IF d.contains_patient_data THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: document flagged as containing identifiable patient data';
    END IF;
    IF d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'PUBLICATION_BLOCKED: document archived'; END IF;
    IF OLD.status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: version must be explicitly approved first';
    END IF;
    IF NEW.approved_at IS NULL OR NEW.approved_by IS NULL OR NEW.published_by IS NULL THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: missing approval/publisher';
    END IF;
    IF NEW.scan_status NOT IN ('clean', 'released_unscanned_dev') THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: malware scan status is %', NEW.scan_status;
    END IF;
    IF NEW.viewing_pdf_file_id IS NULL OR coalesce(NEW.page_count, 0) < 1 THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: no valid viewing rendition';
    END IF;
    IF NOT (NEW.fidelity_status = 'ok' OR (NEW.fidelity_status = 'warning' AND NEW.fidelity_confirmed_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: conversion fidelity not confirmed (%)', NEW.fidelity_status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM page_renders WHERE version_id = NEW.id) THEN
      RAISE EXCEPTION 'PUBLICATION_BLOCKED: page renders missing';
    END IF;
    IF d.kind = 'redacted' THEN
      SELECT EXISTS (SELECT 1 FROM redaction_checks rc WHERE rc.redacted_version_id = NEW.id
                       AND rc.result = 'pass' AND rc.attested_at IS NOT NULL) INTO ok_redaction;
      IF NOT ok_redaction THEN
        RAISE EXCEPTION 'PUBLICATION_BLOCKED: redacted copy lacks a passing, attested verification';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_versions_publication_gate BEFORE INSERT OR UPDATE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION dr_publication_gate();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION dr_patient_flag_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.contains_patient_data AND NOT OLD.contains_patient_data AND EXISTS (
       SELECT 1 FROM document_versions WHERE document_id = NEW.id AND status = 'published') THEN
    RAISE EXCEPTION 'withdraw published versions before flagging patient data';
  END IF;
  IF NEW.current_published_version_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM document_versions WHERE id = NEW.current_published_version_id
       AND document_id = NEW.id AND status = 'published') THEN
    RAISE EXCEPTION 'current_published_version_id must reference a published version of this document';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER documents_patient_flag_guard BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION dr_patient_flag_guard();
--> statement-breakpoint

ALTER TABLE documents ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_published_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE documents ADD CONSTRAINT documents_redacted_from_fk
  FOREIGN KEY (redacted_from_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE folders ADD CONSTRAINT folders_parent_fk
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE checklist_items ADD CONSTRAINT checklist_document_fk
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE document_versions ADD CONSTRAINT document_versions_import_fk
  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
