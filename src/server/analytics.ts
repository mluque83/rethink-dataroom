import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * METRIC DEFINITIONS (also rendered at /admin/metrics)
 * - Authenticated session: a successful OTP verification (server-confirmed). Link fetches never count.
 * - First / last visit: first / last authenticated session start.
 * - Document opened: viewer instance created by the server for an authorised version (server-confirmed).
 *   Opening a document does not prove it was read.
 * - Pages served: distinct pages whose personalised raster the server delivered to a viewer instance
 *   (server-confirmed delivery; does not prove the page was looked at or understood).
 * - Downloads: personalised (watermarked) or original files delivered by the server. What happens next is unknown.
 * - Estimated active time: sum of credited heartbeat intervals (CLIENT signals: tab visible + interaction within
 *   the idle threshold; capped per interval; de-duplicated across tabs). An estimate that can be lost or manipulated.
 * Admin previews and automated link fetches never generate recipient activity.
 */
export interface Filters { recipientId?: string; company?: string; documentId?: string; from?: string; to?: string }

const period = (f: Filters, col = "e.at") => sql.raw(
  `${f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? ` AND ${col} >= '${f.from}'::date` : ""}${f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? ` AND ${col} < ('${f.to}'::date + 1)` : ""}`);

export async function recipientSummaries(f: Filters = {}) {
  const r = await db().execute<{
    id: string; display_name: string; email: string; status: string; org: string | null; declared_company: string | null; is_demo: boolean;
    invitation_status: string | null; nda_accepted_at: Date | null; first_visit: Date | null; last_visit: Date | null; sessions: number;
    docs_opened: number; opens: number; pages_served: number; downloads: number; active_ms: number;
  }>(sql`
    SELECT r.id, r.display_name, r.email, r.status, o.name AS org, r.is_demo,
      (SELECT company FROM identity_declarations i WHERE i.recipient_id = r.id ORDER BY created_at DESC LIMIT 1) AS declared_company,
      (SELECT status FROM invitations i WHERE i.recipient_id = r.id ORDER BY created_at DESC LIMIT 1) AS invitation_status,
      (SELECT max(accepted_at) FROM acceptances a WHERE a.recipient_id = r.id) AS nda_accepted_at,
      (SELECT min(at) FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'session_start' ${period(f)}) AS first_visit,
      (SELECT max(at) FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'session_start' ${period(f)}) AS last_visit,
      (SELECT count(*)::int FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'session_start' ${period(f)}) AS sessions,
      (SELECT count(DISTINCT document_id)::int FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'document_open' ${period(f)}
         ${f.documentId ? sql`AND e.document_id = ${f.documentId}` : sql``}) AS docs_opened,
      (SELECT count(*)::int FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'document_open' ${period(f)}
         ${f.documentId ? sql`AND e.document_id = ${f.documentId}` : sql``}) AS opens,
      (SELECT count(DISTINCT (version_id, page_number))::int FROM activity_events e WHERE e.recipient_id = r.id AND e.kind = 'page_view' ${period(f)}
         ${f.documentId ? sql`AND e.document_id = ${f.documentId}` : sql``}) AS pages_served,
      (SELECT count(*)::int FROM activity_events e WHERE e.recipient_id = r.id AND e.kind IN ('download_watermarked','download_original') ${period(f)}
         ${f.documentId ? sql`AND e.document_id = ${f.documentId}` : sql``}) AS downloads,
      (SELECT coalesce(sum(active_ms),0)::bigint FROM view_sessions e WHERE e.recipient_id = r.id ${period(f, "e.opened_at")}
         ${f.documentId ? sql`AND e.document_id = ${f.documentId}` : sql``}) AS active_ms
    FROM recipients r LEFT JOIN organizations o ON o.id = r.organization_id
    WHERE true ${f.recipientId ? sql`AND r.id = ${f.recipientId}` : sql``}
      ${f.company ? sql`AND (o.name ILIKE ${"%" + f.company + "%"} OR EXISTS (SELECT 1 FROM identity_declarations i WHERE i.recipient_id = r.id AND i.company ILIKE ${"%" + f.company + "%"}))` : sql``}
    ORDER BY r.display_name`);
  return r.rows.map((x) => ({ ...x, active_ms: Number(x.active_ms) }));
}

export async function documentBreakdown(recipientId: string, f: Filters = {}) {
  const r = await db().execute<{ document_id: string; title: string; ref: string; version_number: number; version_id: string; opens: number; pages_served: number; page_count: number; downloads: number; active_ms: number; first_open: Date; last_open: Date }>(sql`
    SELECT d.id AS document_id, d.title, d.ref, v.version_number, v.id AS version_id, v.page_count,
      count(*) FILTER (WHERE e.kind = 'document_open')::int AS opens,
      count(DISTINCT e.page_number) FILTER (WHERE e.kind = 'page_view')::int AS pages_served,
      count(*) FILTER (WHERE e.kind IN ('download_watermarked','download_original'))::int AS downloads,
      (SELECT coalesce(sum(active_ms),0) FROM view_sessions s WHERE s.recipient_id = ${recipientId} AND s.version_id = v.id)::bigint AS active_ms,
      min(e.at) FILTER (WHERE e.kind = 'document_open') AS first_open, max(e.at) FILTER (WHERE e.kind = 'document_open') AS last_open
    FROM activity_events e JOIN documents d ON d.id = e.document_id JOIN document_versions v ON v.id = e.version_id
    WHERE e.recipient_id = ${recipientId} ${period(f)}
    GROUP BY d.id, d.title, d.ref, v.version_number, v.id, v.page_count ORDER BY max(e.at) DESC`);
  return r.rows.map((x) => ({ ...x, active_ms: Number(x.active_ms) }));
}

export async function timeline(recipientId: string, f: Filters = {}) {
  const r = await db().execute<{ at: Date; source: string; kind: string; detail: string | null }>(sql`
    SELECT e.at, 'server' AS source, e.kind, coalesce(d.title, '') || CASE WHEN e.page_number IS NOT NULL THEN ' · p.' || e.page_number ELSE '' END AS detail
      FROM activity_events e LEFT JOIN documents d ON d.id = e.document_id WHERE e.recipient_id = ${recipientId} ${period(f)}
    UNION ALL
    SELECT e.at, 'security' AS source, e.kind, NULL FROM security_events e WHERE e.recipient_id = ${recipientId} ${period(f)}
    UNION ALL
    SELECT e.at, 'audit' AS source, e.action, NULL FROM audit_events e WHERE e.target_type = 'recipient' AND e.target_id = ${recipientId} ${period(f)}
    ORDER BY 1 DESC LIMIT 1000`);
  return r.rows;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
