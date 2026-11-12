/**
 * Data model for the Rethink Medical data room.
 *
 * Conventions
 * - All timestamps are `timestamptz` and written by the server in UTC.
 * - Domain ids are random UUIDs (not enumerable). Human-friendly document
 *   references (DOC-00012) are ADMIN-ONLY because their sequence would reveal
 *   the existence of hidden documents.
 * - Integrity-critical invariants are enforced in PostgreSQL (CHECK, partial
 *   unique indexes and triggers in migrations/0001_integrity.sql), not only in
 *   application code.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, boolean, integer, uuid, jsonb, date, bigserial, bigint,
  primaryKey, uniqueIndex, index, check, customType, pgSequence,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tz("created_at").notNull().defaultNow();
export const inet = customType<{ data: string }>({ dataType: () => "inet" });

/* ------------------------------------------------------------------ */
/* Better Auth core tables (users of both kinds: admins and recipients) */
/* ------------------------------------------------------------------ */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  /** 'admin' | 'recipient' — never settable from client input. */
  role: text("role").notNull().default("recipient"),
}, (t) => [check("user_role_chk", sql`${t.role} in ('admin','recipient')`)]);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: tz("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: tz("access_token_expires_at"),
  refreshTokenExpiresAt: tz("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: tz("locked_until"),
}, (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)]);

/* ------------------------------------------------------------------ */
/* Organisations, groups, recipients                                   */
/* ------------------------------------------------------------------ */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("investor"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("organizations_name_uq").on(sql`lower(${t.name})`),
  check("org_kind_chk", sql`${t.kind} in ('investor','advisor','strategic','internal','other')`),
]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("groups_name_uq").on(sql`lower(${t.name})`)]);

export const legalTexts = pgTable("legal_texts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 'nda' | 'terms' | 'privacy_notice' */
  kind: text("kind").notNull(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  createdAt: createdAt(),
}, (t) => [check("legal_kind_chk", sql`${t.kind} in ('nda','terms','privacy_notice')`)]);

export const legalTextVersions = pgTable("legal_text_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalTextId: uuid("legal_text_id").notNull().references(() => legalTexts.id, { onDelete: "restrict" }),
  versionLabel: text("version_label").notNull(),
  language: text("language").notNull().default("es"),
  body: text("body").notNull(),
  bodySha256: text("body_sha256").notNull(),
  /** draft -> active -> retired. Body is immutable once not draft (trigger). */
  status: text("status").notNull().default("draft"),
  /** Material change: recipients must accept again before new access. */
  requiresReacceptance: boolean("requires_reacceptance").notNull().default(true),
  legalReviewStatus: text("legal_review_status").notNull().default("pending_legal_review"),
  changeSummary: text("change_summary"),
  activatedAt: tz("activated_at"),
  activatedBy: text("activated_by").references(() => user.id),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("legal_version_label_uq").on(t.legalTextId, t.versionLabel),
  check("legal_version_status_chk", sql`${t.status} in ('draft','active','retired')`),
  check("legal_review_chk", sql`${t.legalReviewStatus} in ('pending_legal_review','legal_reviewed')`),
  // at most one active version per text
  uniqueIndex("legal_one_active_uq").on(t.legalTextId).where(sql`${t.status} = 'active'`),
]);

export const accessProfiles = pgTable("access_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  /** Template only: { sections: [{code, view, downloadWatermarked, downloadOriginal}], qaEnabled, ... } */
  definition: jsonb("definition").notNull(),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("access_profiles_name_uq").on(sql`lower(${t.name})`)]);

export const recipients = pgTable("recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "restrict" }),
  /** normalised lower-case address that must be verified by OTP */
  email: text("email").notNull(),
  /** name entered by the admin (expected); the declared identity is stored separately */
  displayName: text("display_name").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  roleTitle: text("role_title"),
  /** draft | invited | active | suspended | revoked */
  status: text("status").notNull().default("draft"),
  /** Non-secret identifier printed in watermarks (e.g. RM-7F3K-92QD). */
  accessCode: text("access_code").notNull().unique(),
  ndaTextId: uuid("nda_text_id").notNull().references(() => legalTexts.id),
  accessStartsAt: tz("access_starts_at"),
  accessExpiresAt: tz("access_expires_at"),
  /** Recipient-level master switches (intersected with rule capabilities). */
  allowWatermarkedDownloads: boolean("allow_watermarked_downloads").notNull().default(false),
  allowOriginalDownloads: boolean("allow_original_downloads").notNull().default(false),
  qaEnabled: boolean("qa_enabled").notNull().default(false),
  /** Max authenticated session age before re-verification by e-mail code. */
  sessionMaxHours: integer("session_max_hours").notNull().default(12),
  profileId: uuid("profile_id").references(() => accessProfiles.id, { onDelete: "set null" }),
  locale: text("locale").notNull().default("es"),
  isDemo: boolean("is_demo").notNull().default(false),
  internalNotes: text("internal_notes"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  revokedAt: tz("revoked_at"),
  revokedReason: text("revoked_reason"),
}, (t) => [
  uniqueIndex("recipients_email_uq").on(t.email),
  check("recipient_status_chk", sql`${t.status} in ('draft','invited','active','suspended','revoked')`),
  check("recipient_email_lower_chk", sql`${t.email} = lower(${t.email})`),
  check("recipient_session_hours_chk", sql`${t.sessionMaxHours} between 1 and 168`),
  index("recipients_org_idx").on(t.organizationId),
]);

export const groupMembers = pgTable("group_members", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.groupId, t.recipientId] }), index("group_members_recipient_idx").on(t.recipientId)]);

/** Identity declared by the recipient during onboarding (append-only). */
export const identityDeclarations = pgTable("identity_declarations", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  company: text("company"),
  position: text("position"),
  /** 'personal' | 'on_behalf' — representation is DECLARED, never verified */
  actingCapacity: text("acting_capacity").notNull(),
  representedEntity: text("represented_entity"),
  authorityDeclared: boolean("authority_declared").notNull().default(false),
  sessionId: text("session_id"),
  declaredAt: createdAt(),
}, (t) => [
  check("identity_capacity_chk", sql`${t.actingCapacity} in ('personal','on_behalf')`),
  check("identity_on_behalf_chk", sql`${t.actingCapacity} = 'personal' or (${t.representedEntity} is not null and ${t.authorityDeclared})`),
]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  /** SHA-256 of a 256-bit random token. The token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  /** created | sent | verified | expired | revoked | superseded */
  status: text("status").notNull().default("created"),
  expiresAt: tz("expires_at").notNull(),
  sentAt: tz("sent_at"),
  sendCount: integer("send_count").notNull().default(0),
  firstVerifiedAt: tz("first_verified_at"),
  revokedAt: tz("revoked_at"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
}, (t) => [
  check("invitation_status_chk", sql`${t.status} in ('created','sent','verified','expired','revoked','superseded')`),
  index("invitations_recipient_idx").on(t.recipientId),
]);

/* ------------------------------------------------------------------ */
/* Library: sections, folders, documents, versions, files              */
/* ------------------------------------------------------------------ */
export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionEs: text("description_es"),
  descriptionEn: text("description_en"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("folders_section_idx").on(t.sectionId), index("folders_parent_idx").on(t.parentId)]);

/** Expected documentation per section (pending list). Existence of an item does not imply the document exists. */
export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** expected | pending | received | not_applicable */
  status: text("status").notNull().default("expected"),
  justification: text("justification"),
  documentId: uuid("document_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [
  check("checklist_status_chk", sql`${t.status} in ('expected','pending','received','not_applicable')`),
  check("checklist_na_justified_chk", sql`${t.status} <> 'not_applicable' or length(trim(coalesce(${t.justification},''))) > 0`),
  check("checklist_pending_justified_chk", sql`${t.status} <> 'pending' or length(trim(coalesce(${t.justification},''))) > 0`),
]);

export const docRefSeq = pgSequence("document_ref_seq", { startWith: 1 });

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  storageKey: text("storage_key").notNull().unique(),
  /** original | viewing_pdf | page_render | derived | qa_attachment */
  purpose: text("purpose").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  extension: text("extension"),
  /** sanitised; display only, never used as a storage path */
  originalFilename: text("original_filename"),
  createdAt: createdAt(),
}, (t) => [
  check("files_purpose_chk", sql`${t.purpose} in ('original','viewing_pdf','page_render','derived','qa_attachment')`),
  index("files_sha_idx").on(t.sha256),
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ref: text("ref").notNull().unique().default(sql`'DOC-' || lpad(nextval('document_ref_seq')::text, 5, '0')`),
  title: text("title").notNull(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  /** standard | redacted (a redacted copy linked to an original version) */
  kind: text("kind").notNull().default("standard"),
  redactedFromVersionId: uuid("redacted_from_version_id"),
  product: text("product"),
  market: text("market"),
  documentDate: date("document_date"),
  ownerName: text("owner_name"),
  /** internal | confidential | highly_confidential */
  confidentiality: text("confidentiality").notNull().default("confidential"),
  /** not_applicable | valid | expired | pending_verification | superseded */
  validityStatus: text("validity_status").notNull().default("pending_verification"),
  validUntil: date("valid_until"),
  nextReviewAt: date("next_review_at"),
  source: text("source"),
  notes: text("notes"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  /** Contains identifiable patient data → may never be published (DB trigger). */
  containsPatientData: boolean("contains_patient_data").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  currentPublishedVersionId: uuid("current_published_version_id"),
  archivedAt: tz("archived_at"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [
  check("doc_kind_chk", sql`${t.kind} in ('standard','redacted')`),
  check("doc_redacted_link_chk", sql`(${t.kind} = 'redacted') = (${t.redactedFromVersionId} is not null)`),
  check("doc_conf_chk", sql`${t.confidentiality} in ('internal','confidential','highly_confidential')`),
  check("doc_validity_chk", sql`${t.validityStatus} in ('not_applicable','valid','expired','pending_verification','superseded')`),
  index("documents_section_idx").on(t.sectionId),
  index("documents_folder_idx").on(t.folderId),
  index("documents_title_idx").using("gin", sql`to_tsvector('simple', ${t.title})`),
]);

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  /**
   * uploaded -> processing -> (conversion_failed | in_review) -> approved -> published -> superseded
   *                                               in_review -> rejected ; published -> withdrawn
   */
  status: text("status").notNull().default("uploaded"),
  originalFileId: uuid("original_file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
  viewingPdfFileId: uuid("viewing_pdf_file_id").references(() => files.id),
  pageCount: integer("page_count"),
  /** pending | clean | infected | not_configured | error | released_unscanned_dev */
  scanStatus: text("scan_status").notNull().default("pending"),
  scanDetail: text("scan_detail"),
  /** pending | ok | warning | failed */
  fidelityStatus: text("fidelity_status").notNull().default("pending"),
  conversionReport: jsonb("conversion_report"),
  fidelityConfirmedBy: text("fidelity_confirmed_by").references(() => user.id),
  fidelityConfirmedAt: tz("fidelity_confirmed_at"),
  changeSummary: text("change_summary"),
  reviewNotes: text("review_notes"),
  approvedBy: text("approved_by").references(() => user.id),
  approvedAt: tz("approved_at"),
  publishedBy: text("published_by").references(() => user.id),
  publishedAt: tz("published_at"),
  withdrawnAt: tz("withdrawn_at"),
  uploadedBy: text("uploaded_by").references(() => user.id),
  uploadedAt: createdAt(),
  importBatchId: uuid("import_batch_id"),
}, (t) => [
  uniqueIndex("doc_version_number_uq").on(t.documentId, t.versionNumber),
  uniqueIndex("doc_one_published_uq").on(t.documentId).where(sql`${t.status} = 'published'`),
  check("doc_version_status_chk", sql`${t.status} in ('uploaded','processing','conversion_failed','in_review','approved','published','superseded','withdrawn','rejected')`),
  check("doc_version_scan_chk", sql`${t.scanStatus} in ('pending','clean','infected','not_configured','error','released_unscanned_dev')`),
  check("doc_version_fid_chk", sql`${t.fidelityStatus} in ('pending','ok','warning','failed')`),
  index("doc_versions_doc_idx").on(t.documentId),
]);

export const pageRenders = pgTable("page_renders", {
  versionId: uuid("version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  fileId: uuid("file_id").notNull().references(() => files.id),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
}, (t) => [primaryKey({ columns: [t.versionId, t.pageNumber] })]);

/** Per-recipient watermarked derivatives. Key includes recipient, version and watermark config hash. */
export const derivedCache = pgTable("derived_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  watermarkHash: text("watermark_hash").notNull(),
  /** page | download_pdf */
  kind: text("kind").notNull(),
  pageNumber: integer("page_number").notNull().default(0),
  fileId: uuid("file_id").notNull().references(() => files.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("derived_cache_uq").on(t.recipientId, t.versionId, t.watermarkHash, t.kind, t.pageNumber),
  check("derived_kind_chk", sql`${t.kind} in ('page','download_pdf')`),
]);

/** Verification record for a redacted copy (redacted document version vs source version). */
export const redactionChecks = pgTable("redaction_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  redactedVersionId: uuid("redacted_version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  sourceVersionId: uuid("source_version_id").notNull().references(() => documentVersions.id),
  /** Terms are never stored; only how many were checked and per-term results by index. */
  termsCount: integer("terms_count").notNull(),
  /** pass | fail | incomplete */
  result: text("result").notNull(),
  checks: jsonb("checks").notNull(),
  checkedBy: text("checked_by").references(() => user.id),
  checkedAt: createdAt(),
  attestedBy: text("attested_by").references(() => user.id),
  attestedAt: tz("attested_at"),
  attestation: text("attestation"),
}, (t) => [check("redaction_result_chk", sql`${t.result} in ('pass','fail','incomplete')`)]);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceLabel: text("source_label").notNull(),
  report: jsonb("report").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Permissions                                                          */
/* ------------------------------------------------------------------ */
/**
 * Access rule. Effective permission (see src/server/permissions.ts):
 *   effective = (∪ allow caps of applicable rules) − (∪ deny caps of applicable rules)
 *               ∩ recipient master switches, and only if publication gate passes.
 * Deny ALWAYS wins regardless of subject (individual or group) or specificity.
 */
export const accessRules = pgTable("access_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: text("subject_type").notNull(),
  recipientId: uuid("recipient_id").references(() => recipients.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => documentVersions.id, { onDelete: "cascade" }),
  effect: text("effect").notNull(),
  canView: boolean("can_view").notNull().default(false),
  canDownloadWatermarked: boolean("can_download_watermarked").notNull().default(false),
  canDownloadOriginal: boolean("can_download_original").notNull().default(false),
  note: text("note"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
}, (t) => [
  check("rule_subject_chk", sql`(${t.subjectType} = 'recipient' and ${t.recipientId} is not null and ${t.groupId} is null) or (${t.subjectType} = 'group' and ${t.groupId} is not null and ${t.recipientId} is null)`),
  check("rule_target_chk", sql`
    (${t.targetType} = 'section'  and ${t.sectionId} is not null and ${t.folderId} is null and ${t.documentId} is null and ${t.versionId} is null) or
    (${t.targetType} = 'folder'   and ${t.folderId} is not null and ${t.sectionId} is null and ${t.documentId} is null and ${t.versionId} is null) or
    (${t.targetType} = 'document' and ${t.documentId} is not null and ${t.sectionId} is null and ${t.folderId} is null and ${t.versionId} is null) or
    (${t.targetType} = 'version'  and ${t.versionId} is not null and ${t.sectionId} is null and ${t.folderId} is null and ${t.documentId} is null)`),
  check("rule_effect_chk", sql`${t.effect} in ('allow','deny')`),
  check("rule_caps_nonempty_chk", sql`${t.canView} or ${t.canDownloadWatermarked} or ${t.canDownloadOriginal}`),
  check("rule_allow_requires_view_chk", sql`${t.effect} = 'deny' or ${t.canView}`),
  index("rules_recipient_idx").on(t.recipientId),
  index("rules_group_idx").on(t.groupId),
]);

/* ------------------------------------------------------------------ */
/* Acceptance evidence (append-only, hash-chained)                     */
/* ------------------------------------------------------------------ */
export const acceptances = pgTable("acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: bigserial("seq", { mode: "number" }).notNull().unique(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull(),
  verifiedEmail: text("verified_email").notNull(),
  identityDeclarationId: uuid("identity_declaration_id").notNull().references(() => identityDeclarations.id, { onDelete: "restrict" }),
  declaredFullName: text("declared_full_name").notNull(),
  declaredCompany: text("declared_company"),
  declaredPosition: text("declared_position"),
  actingCapacity: text("acting_capacity").notNull(),
  representedEntity: text("represented_entity"),
  ndaVersionId: uuid("nda_version_id").notNull().references(() => legalTextVersions.id, { onDelete: "restrict" }),
  termsVersionId: uuid("terms_version_id").notNull().references(() => legalTextVersions.id, { onDelete: "restrict" }),
  privacyVersionId: uuid("privacy_version_id").notNull().references(() => legalTextVersions.id, { onDelete: "restrict" }),
  /** Exact composite text shown to the user (NDA + terms + privacy notice) and its hash. */
  displayedText: text("displayed_text").notNull(),
  displayedTextSha256: text("displayed_text_sha256").notNull(),
  checkboxLabel: text("checkbox_label").notNull(),
  actionLabel: text("action_label").notNull(),
  locale: text("locale").notNull(),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: tz("accepted_at").notNull().defaultNow(),
  prevRecordHash: text("prev_record_hash"),
  recordHash: text("record_hash").notNull(),
}, (t) => [index("acceptances_recipient_idx").on(t.recipientId)]);

/* ------------------------------------------------------------------ */
/* Audit, security and activity                                         */
/* ------------------------------------------------------------------ */
export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: tz("at").notNull().defaultNow(),
  actorType: text("actor_type").notNull(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details"),
  ip: text("ip"),
}, (t) => [index("audit_at_idx").on(t.at), index("audit_target_idx").on(t.targetType, t.targetId)]);

/** Security log: OTP requests, link fetches, rate-limit hits. Emails/IPs pseudonymised by HMAC. */
export const securityEvents = pgTable("security_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: tz("at").notNull().defaultNow(),
  kind: text("kind").notNull(),
  recipientId: uuid("recipient_id"),
  emailHmac: text("email_hmac"),
  ipHmac: text("ip_hmac"),
  /** human_suspected | automated_suspected | unknown */
  clientClass: text("client_class"),
  details: jsonb("details"),
}, (t) => [index("security_at_idx").on(t.at), index("security_kind_idx").on(t.kind)]);

/** Server-confirmed recipient activity. Never written for admin previews. */
export const activityEvents = pgTable("activity_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: tz("at").notNull().defaultNow(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  /** session_start | document_open | page_view | download_watermarked | download_original | question_created | nda_accepted */
  kind: text("kind").notNull(),
  documentId: uuid("document_id"),
  versionId: uuid("version_id"),
  pageNumber: integer("page_number"),
  viewSessionId: uuid("view_session_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  anonymizedAt: tz("anonymized_at"),
}, (t) => [
  index("activity_recipient_at_idx").on(t.recipientId, t.at),
  index("activity_doc_idx").on(t.documentId),
  index("activity_kind_idx").on(t.kind),
]);

/** One per opened viewer instance; client heartbeats feed estimated active time. */
export const viewSessions = pgTable("view_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  documentId: uuid("document_id").notNull(),
  versionId: uuid("version_id").notNull(),
  openedAt: tz("opened_at").notNull().defaultNow(),
  lastHeartbeatAt: tz("last_heartbeat_at"),
  activeMs: bigint("active_ms", { mode: "number" }).notNull().default(0),
}, (t) => [index("view_sessions_recipient_idx").on(t.recipientId)]);

export const heartbeats = pgTable("heartbeats", {
  viewSessionId: uuid("view_session_id").notNull().references(() => viewSessions.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  receivedAt: tz("received_at").notNull().defaultNow(),
  visible: boolean("visible").notNull(),
  active: boolean("active").notNull(),
  pageNumber: integer("page_number"),
  creditedMs: integer("credited_ms").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.viewSessionId, t.seq] })]);

/** Per-recipient wall clock: time is credited at most once across tabs/documents. */
export const activityClock = pgTable("activity_clock", {
  recipientId: uuid("recipient_id").primaryKey().references(() => recipients.id, { onDelete: "cascade" }),
  creditedUntil: tz("credited_until").notNull(),
});

/* ------------------------------------------------------------------ */
/* Q&A                                                                  */
/* ------------------------------------------------------------------ */
export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  /** open | in_progress | answered | closed */
  status: text("status").notNull().default("open"),
  assigneeUserId: text("assignee_user_id").references(() => user.id),
  /** author_only (default) | group — sharing is an explicit admin action */
  visibility: text("visibility").notNull().default("author_only"),
  sharedGroupId: uuid("shared_group_id").references(() => groups.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [
  check("question_status_chk", sql`${t.status} in ('open','in_progress','answered','closed')`),
  check("question_visibility_chk", sql`(${t.visibility} = 'author_only' and ${t.sharedGroupId} is null) or (${t.visibility} = 'group' and ${t.sharedGroupId} is not null)`),
  index("questions_recipient_idx").on(t.recipientId),
]);

export const answers = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  /** draft | published */
  status: text("status").notNull().default("draft"),
  /** Attachments are data-room documents: visible only if the reader has view permission. */
  attachmentDocumentIds: uuid("attachment_document_ids").array().notNull().default(sql`'{}'::uuid[]`),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
  publishedBy: text("published_by").references(() => user.id),
  publishedAt: tz("published_at"),
}, (t) => [
  check("answer_status_chk", sql`${t.status} in ('draft','published')`),
  check("answer_published_chk", sql`${t.status} = 'draft' or ${t.publishedAt} is not null`),
]);

export const questionNotes = pgTable("question_internal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Notifications, settings, dev mailbox                                 */
/* ------------------------------------------------------------------ */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** first_visit | nda_accepted | access_request | question_created */
  kind: text("kind").notNull(),
  recipientId: uuid("recipient_id").references(() => recipients.id, { onDelete: "cascade" }),
  /** never contains document contents */
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
  readAt: tz("read_at"),
  emailedAt: tz("emailed_at"),
}, (t) => [index("notifications_created_idx").on(t.createdAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

/** DEVELOPMENT ONLY mail sink (EMAIL_PROVIDER=dev). Refused in production. */
export const devOutbox = pgTable("dev_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  createdAt: createdAt(),
});

/** Fixed-window counters for rate limiting (keys are HMACs, never raw e-mails/IPs). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEndsAt: tz("window_ends_at").notNull(),
});

export type Recipient = typeof recipients.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type AccessRule = typeof accessRules.$inferSelect;
