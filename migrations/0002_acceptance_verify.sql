-- Single definition of the acceptance record hash, used by the insert trigger
-- and by the verification routine (export / admin integrity check).
CREATE OR REPLACE FUNCTION dr_acceptance_compute(a acceptances, prev text) RETURNS text AS $$
  SELECT encode(sha256(convert_to(
      coalesce(prev, 'GENESIS') || '|' || a.id::text || '|' || a.recipient_id::text || '|' ||
      a.user_id || '|' || a.verified_email || '|' || a.declared_full_name || '|' ||
      coalesce(a.declared_company, '') || '|' || coalesce(a.declared_position, '') || '|' ||
      a.acting_capacity || '|' || coalesce(a.represented_entity, '') || '|' ||
      a.nda_version_id::text || '|' || a.terms_version_id::text || '|' || a.privacy_version_id::text || '|' ||
      a.displayed_text_sha256 || '|' || a.checkbox_label || '|' || a.action_label || '|' ||
      a.session_id || '|' || to_char(a.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'UTF8')), 'hex')
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dr_acceptance_chain() RETURNS trigger AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(77001);
  NEW.accepted_at := now();
  IF NEW.displayed_text_sha256 <> encode(sha256(convert_to(NEW.displayed_text, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'displayed_text_sha256 does not match displayed_text';
  END IF;
  SELECT record_hash INTO prev FROM acceptances ORDER BY seq DESC LIMIT 1;
  NEW.prev_record_hash := prev;
  NEW.record_hash := dr_acceptance_compute(NEW, prev);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Returns one row per acceptance with whether its link and content hash verify.
CREATE OR REPLACE FUNCTION dr_verify_acceptance_chain()
RETURNS TABLE(id uuid, seq bigint, link_ok boolean, record_ok boolean, text_ok boolean) AS $$
  SELECT a.id, a.seq,
    a.prev_record_hash IS NOT DISTINCT FROM lag(a.record_hash) OVER (ORDER BY a.seq),
    a.record_hash = dr_acceptance_compute(a, a.prev_record_hash),
    a.displayed_text_sha256 = encode(sha256(convert_to(a.displayed_text, 'UTF8')), 'hex')
  FROM acceptances a ORDER BY a.seq
$$ LANGUAGE sql STABLE;
