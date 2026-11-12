CREATE SEQUENCE "public"."document_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"recipient_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"verified_email" text NOT NULL,
	"identity_declaration_id" uuid NOT NULL,
	"declared_full_name" text NOT NULL,
	"declared_company" text,
	"declared_position" text,
	"acting_capacity" text NOT NULL,
	"represented_entity" text,
	"nda_version_id" uuid NOT NULL,
	"terms_version_id" uuid NOT NULL,
	"privacy_version_id" uuid NOT NULL,
	"displayed_text" text NOT NULL,
	"displayed_text_sha256" text NOT NULL,
	"checkbox_label" text NOT NULL,
	"action_label" text NOT NULL,
	"locale" text NOT NULL,
	"session_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_record_hash" text,
	"record_hash" text NOT NULL,
	CONSTRAINT "acceptances_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "access_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"recipient_id" uuid,
	"group_id" uuid,
	"target_type" text NOT NULL,
	"section_id" uuid,
	"folder_id" uuid,
	"document_id" uuid,
	"version_id" uuid,
	"effect" text NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_download_watermarked" boolean DEFAULT false NOT NULL,
	"can_download_original" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_subject_chk" CHECK (("access_rules"."subject_type" = 'recipient' and "access_rules"."recipient_id" is not null and "access_rules"."group_id" is null) or ("access_rules"."subject_type" = 'group' and "access_rules"."group_id" is not null and "access_rules"."recipient_id" is null)),
	CONSTRAINT "rule_target_chk" CHECK (
    ("access_rules"."target_type" = 'section'  and "access_rules"."section_id" is not null and "access_rules"."folder_id" is null and "access_rules"."document_id" is null and "access_rules"."version_id" is null) or
    ("access_rules"."target_type" = 'folder'   and "access_rules"."folder_id" is not null and "access_rules"."section_id" is null and "access_rules"."document_id" is null and "access_rules"."version_id" is null) or
    ("access_rules"."target_type" = 'document' and "access_rules"."document_id" is not null and "access_rules"."section_id" is null and "access_rules"."folder_id" is null and "access_rules"."version_id" is null) or
    ("access_rules"."target_type" = 'version'  and "access_rules"."version_id" is not null and "access_rules"."section_id" is null and "access_rules"."folder_id" is null and "access_rules"."document_id" is null)),
	CONSTRAINT "rule_effect_chk" CHECK ("access_rules"."effect" in ('allow','deny')),
	CONSTRAINT "rule_caps_nonempty_chk" CHECK ("access_rules"."can_view" or "access_rules"."can_download_watermarked" or "access_rules"."can_download_original"),
	CONSTRAINT "rule_allow_requires_view_chk" CHECK ("access_rules"."effect" = 'deny' or "access_rules"."can_view")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_clock" (
	"recipient_id" uuid PRIMARY KEY NOT NULL,
	"credited_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"session_id" text,
	"kind" text NOT NULL,
	"document_id" uuid,
	"version_id" uuid,
	"page_number" integer,
	"view_session_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"anonymized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"attachment_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "answer_status_chk" CHECK ("answers"."status" in ('draft','published')),
	CONSTRAINT "answer_published_chk" CHECK ("answers"."status" = 'draft' or "answers"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	"justification" text,
	"document_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_status_chk" CHECK ("checklist_items"."status" in ('expected','pending','received','not_applicable')),
	CONSTRAINT "checklist_na_justified_chk" CHECK ("checklist_items"."status" <> 'not_applicable' or length(trim(coalesce("checklist_items"."justification",''))) > 0),
	CONSTRAINT "checklist_pending_justified_chk" CHECK ("checklist_items"."status" <> 'pending' or length(trim(coalesce("checklist_items"."justification",''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "derived_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"watermark_hash" text NOT NULL,
	"kind" text NOT NULL,
	"page_number" integer DEFAULT 0 NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_kind_chk" CHECK ("derived_cache"."kind" in ('page','download_pdf'))
);
--> statement-breakpoint
CREATE TABLE "dev_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"original_file_id" uuid NOT NULL,
	"viewing_pdf_file_id" uuid,
	"page_count" integer,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"scan_detail" text,
	"fidelity_status" text DEFAULT 'pending' NOT NULL,
	"conversion_report" jsonb,
	"fidelity_confirmed_by" text,
	"fidelity_confirmed_at" timestamp with time zone,
	"change_summary" text,
	"review_notes" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"published_by" text,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_batch_id" uuid,
	CONSTRAINT "doc_version_status_chk" CHECK ("document_versions"."status" in ('uploaded','processing','conversion_failed','in_review','approved','published','superseded','withdrawn','rejected')),
	CONSTRAINT "doc_version_scan_chk" CHECK ("document_versions"."scan_status" in ('pending','clean','infected','not_configured','error','released_unscanned_dev')),
	CONSTRAINT "doc_version_fid_chk" CHECK ("document_versions"."fidelity_status" in ('pending','ok','warning','failed'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text DEFAULT 'DOC-' || lpad(nextval('document_ref_seq')::text, 5, '0') NOT NULL,
	"title" text NOT NULL,
	"section_id" uuid NOT NULL,
	"folder_id" uuid,
	"kind" text DEFAULT 'standard' NOT NULL,
	"redacted_from_version_id" uuid,
	"product" text,
	"market" text,
	"document_date" date,
	"owner_name" text,
	"confidentiality" text DEFAULT 'confidential' NOT NULL,
	"validity_status" text DEFAULT 'pending_verification' NOT NULL,
	"valid_until" date,
	"next_review_at" date,
	"source" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"contains_patient_data" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"current_published_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_ref_unique" UNIQUE("ref"),
	CONSTRAINT "doc_kind_chk" CHECK ("documents"."kind" in ('standard','redacted')),
	CONSTRAINT "doc_redacted_link_chk" CHECK (("documents"."kind" = 'redacted') = ("documents"."redacted_from_version_id" is not null)),
	CONSTRAINT "doc_conf_chk" CHECK ("documents"."confidentiality" in ('internal','confidential','highly_confidential')),
	CONSTRAINT "doc_validity_chk" CHECK ("documents"."validity_status" in ('not_applicable','valid','expired','pending_verification','superseded'))
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"purpose" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_purpose_chk" CHECK ("files"."purpose" in ('original','viewing_pdf','page_render','derived','qa_attachment'))
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_recipient_id_pk" PRIMARY KEY("group_id","recipient_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heartbeats" (
	"view_session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visible" boolean NOT NULL,
	"active" boolean NOT NULL,
	"page_number" integer,
	"credited_ms" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "heartbeats_view_session_id_seq_pk" PRIMARY KEY("view_session_id","seq")
);
--> statement-breakpoint
CREATE TABLE "identity_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"company" text,
	"position" text,
	"acting_capacity" text NOT NULL,
	"represented_entity" text,
	"authority_declared" boolean DEFAULT false NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_capacity_chk" CHECK ("identity_declarations"."acting_capacity" in ('personal','on_behalf')),
	CONSTRAINT "identity_on_behalf_chk" CHECK ("identity_declarations"."acting_capacity" = 'personal' or ("identity_declarations"."represented_entity" is not null and "identity_declarations"."authority_declared"))
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_label" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 0 NOT NULL,
	"first_verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_status_chk" CHECK ("invitations"."status" in ('created','sent','verified','expired','revoked','superseded'))
);
--> statement-breakpoint
CREATE TABLE "legal_text_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_text_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"body" text NOT NULL,
	"body_sha256" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requires_reacceptance" boolean DEFAULT true NOT NULL,
	"legal_review_status" text DEFAULT 'pending_legal_review' NOT NULL,
	"change_summary" text,
	"activated_at" timestamp with time zone,
	"activated_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_version_status_chk" CHECK ("legal_text_versions"."status" in ('draft','active','retired')),
	CONSTRAINT "legal_review_chk" CHECK ("legal_text_versions"."legal_review_status" in ('pending_legal_review','legal_reviewed'))
);
--> statement-breakpoint
CREATE TABLE "legal_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_texts_key_unique" UNIQUE("key"),
	CONSTRAINT "legal_kind_chk" CHECK ("legal_texts"."kind" in ('nda','terms','privacy_notice'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"recipient_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'investor' NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_kind_chk" CHECK ("organizations"."kind" in ('investor','advisor','strategic','internal','other'))
);
--> statement-breakpoint
CREATE TABLE "page_renders" (
	"version_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "page_renders_version_id_page_number_pk" PRIMARY KEY("version_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "question_internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"document_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_user_id" text,
	"visibility" text DEFAULT 'author_only' NOT NULL,
	"shared_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_status_chk" CHECK ("questions"."status" in ('open','in_progress','answered','closed')),
	CONSTRAINT "question_visibility_chk" CHECK (("questions"."visibility" = 'author_only' and "questions"."shared_group_id" is null) or ("questions"."visibility" = 'group' and "questions"."shared_group_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"organization_id" uuid,
	"role_title" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"access_code" text NOT NULL,
	"nda_text_id" uuid NOT NULL,
	"access_starts_at" timestamp with time zone,
	"access_expires_at" timestamp with time zone,
	"allow_watermarked_downloads" boolean DEFAULT false NOT NULL,
	"allow_original_downloads" boolean DEFAULT false NOT NULL,
	"qa_enabled" boolean DEFAULT false NOT NULL,
	"session_max_hours" integer DEFAULT 12 NOT NULL,
	"profile_id" uuid,
	"locale" text DEFAULT 'es' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"internal_notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "recipients_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "recipients_access_code_unique" UNIQUE("access_code"),
	CONSTRAINT "recipient_status_chk" CHECK ("recipients"."status" in ('draft','invited','active','suspended','revoked')),
	CONSTRAINT "recipient_email_lower_chk" CHECK ("recipients"."email" = lower("recipients"."email")),
	CONSTRAINT "recipient_session_hours_chk" CHECK ("recipients"."session_max_hours" between 1 and 168)
);
--> statement-breakpoint
CREATE TABLE "redaction_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"redacted_version_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"terms_count" integer NOT NULL,
	"result" text NOT NULL,
	"checks" jsonb NOT NULL,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attested_by" text,
	"attested_at" timestamp with time zone,
	"attestation" text,
	CONSTRAINT "redaction_result_chk" CHECK ("redaction_checks"."result" in ('pass','fail','incomplete'))
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"description_es" text,
	"description_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"recipient_id" uuid,
	"email_hmac" text,
	"ip_hmac" text,
	"client_class" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text DEFAULT 'recipient' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_chk" CHECK ("user"."role" in ('admin','recipient'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"active_ms" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_identity_declaration_id_identity_declarations_id_fk" FOREIGN KEY ("identity_declaration_id") REFERENCES "public"."identity_declarations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_nda_version_id_legal_text_versions_id_fk" FOREIGN KEY ("nda_version_id") REFERENCES "public"."legal_text_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_terms_version_id_legal_text_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."legal_text_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_privacy_version_id_legal_text_versions_id_fk" FOREIGN KEY ("privacy_version_id") REFERENCES "public"."legal_text_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_rules" ADD CONSTRAINT "access_rules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_clock" ADD CONSTRAINT "activity_clock_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_cache" ADD CONSTRAINT "derived_cache_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_cache" ADD CONSTRAINT "derived_cache_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_cache" ADD CONSTRAINT "derived_cache_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_original_file_id_files_id_fk" FOREIGN KEY ("original_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_viewing_pdf_file_id_files_id_fk" FOREIGN KEY ("viewing_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_fidelity_confirmed_by_user_id_fk" FOREIGN KEY ("fidelity_confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_view_session_id_view_sessions_id_fk" FOREIGN KEY ("view_session_id") REFERENCES "public"."view_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_declarations" ADD CONSTRAINT "identity_declarations_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_text_versions" ADD CONSTRAINT "legal_text_versions_legal_text_id_legal_texts_id_fk" FOREIGN KEY ("legal_text_id") REFERENCES "public"."legal_texts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_text_versions" ADD CONSTRAINT "legal_text_versions_activated_by_user_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_text_versions" ADD CONSTRAINT "legal_text_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_renders" ADD CONSTRAINT "page_renders_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_renders" ADD CONSTRAINT "page_renders_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_internal_notes" ADD CONSTRAINT "question_internal_notes_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_internal_notes" ADD CONSTRAINT "question_internal_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_shared_group_id_groups_id_fk" FOREIGN KEY ("shared_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_nda_text_id_legal_texts_id_fk" FOREIGN KEY ("nda_text_id") REFERENCES "public"."legal_texts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_profile_id_access_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."access_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_checks" ADD CONSTRAINT "redaction_checks_redacted_version_id_document_versions_id_fk" FOREIGN KEY ("redacted_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_checks" ADD CONSTRAINT "redaction_checks_source_version_id_document_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_checks" ADD CONSTRAINT "redaction_checks_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redaction_checks" ADD CONSTRAINT "redaction_checks_attested_by_user_id_fk" FOREIGN KEY ("attested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_sessions" ADD CONSTRAINT "view_sessions_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acceptances_recipient_idx" ON "acceptances" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_profiles_name_uq" ON "access_profiles" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "rules_recipient_idx" ON "access_rules" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "rules_group_idx" ON "access_rules" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_recipient_at_idx" ON "activity_events" USING btree ("recipient_id","at");--> statement-breakpoint
CREATE INDEX "activity_doc_idx" ON "activity_events" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "activity_kind_idx" ON "activity_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_cache_uq" ON "derived_cache" USING btree ("recipient_id","version_id","watermark_hash","kind","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_version_number_uq" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_one_published_uq" ON "document_versions" USING btree ("document_id") WHERE "document_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "doc_versions_doc_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "documents_section_idx" ON "documents" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "documents_folder_idx" ON "documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "documents_title_idx" ON "documents" USING gin (to_tsvector('simple', "title"));--> statement-breakpoint
CREATE INDEX "files_sha_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "folders_section_idx" ON "folders" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "group_members_recipient_idx" ON "group_members" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_uq" ON "groups" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "invitations_recipient_idx" ON "invitations" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_version_label_uq" ON "legal_text_versions" USING btree ("legal_text_id","version_label");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_one_active_uq" ON "legal_text_versions" USING btree ("legal_text_id") WHERE "legal_text_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_name_uq" ON "organizations" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "questions_recipient_idx" ON "questions" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipients_email_uq" ON "recipients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "recipients_org_idx" ON "recipients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "security_at_idx" ON "security_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "security_kind_idx" ON "security_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "view_sessions_recipient_idx" ON "view_sessions" USING btree ("recipient_id");