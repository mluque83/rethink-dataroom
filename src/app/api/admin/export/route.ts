import { desc, eq, sql } from "drizzle-orm";
import { getAdmin } from "@/server/authz";
import { db, schema } from "@/server/db";
import { recipientSummaries, timeline, toCsv } from "@/server/analytics";
import { isUuid } from "@/server/permissions";
import { notFound, privateHeaders, contentDisposition } from "@/server/http";
import { audit } from "@/server/audit";

/** Admin-only exports. Recipients never reach this route (404). */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return notFound();
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const rid = u.searchParams.get("recipientId") ?? "";
  const csv = (name: string, rows: Record<string, unknown>[]) => new Response("﻿" + toCsv(rows), { headers: privateHeaders("text/csv; charset=utf-8", { "Content-Disposition": contentDisposition(name) }) });
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "export.downloaded", details: { type, recipientId: rid || null } });
  switch (type) {
    case "index": {
      const r = await db().execute(sql`SELECT d.ref, s.code AS section, s.name_es AS section_name, d.title, d.kind, d.product, d.market, d.document_date, d.owner_name, d.confidentiality,
        d.validity_status, d.valid_until, d.next_review_at, d.source, d.notes, array_to_string(d.tags, '; ') AS tags, d.contains_patient_data, d.is_demo,
        pv.version_number AS published_version, pv.published_at, (SELECT max(version_number) FROM document_versions WHERE document_id = d.id) AS latest_version,
        d.created_at AS uploaded_first_at, d.archived_at
        FROM documents d JOIN sections s ON s.id = d.section_id LEFT JOIN document_versions pv ON pv.id = d.current_published_version_id ORDER BY s.sort_order, d.ref`);
      return csv("indice-documental.csv", r.rows);
    }
    case "pending": {
      const r = await db().execute(sql`SELECT s.code, s.name_es AS section, c.title, c.status, c.justification, d.ref AS linked_document
        FROM checklist_items c JOIN sections s ON s.id = c.section_id LEFT JOIN documents d ON d.id = c.document_id
        WHERE c.status IN ('expected','pending','not_applicable') ORDER BY s.sort_order, c.sort_order`);
      return csv("documentacion-pendiente.csv", r.rows);
    }
    case "activity": {
      const f = { recipientId: isUuid(rid) ? rid : undefined, company: u.searchParams.get("company") ?? undefined, documentId: isUuid(u.searchParams.get("documentId") ?? "") ? u.searchParams.get("documentId")! : undefined, from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined };
      return csv("actividad.csv", await recipientSummaries(f));
    }
    case "timeline": if (!isUuid(rid)) return notFound(); return csv("cronologia.csv", await timeline(rid));
    case "audit": return csv("auditoria.csv", (await db().select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.at)).limit(50000)).map((r) => ({ ...r, details: JSON.stringify(r.details) })));
    case "acceptances": {
      if (!isUuid(rid)) return notFound();
      const acc = await db().select().from(schema.acceptances).where(eq(schema.acceptances.recipientId, rid)).orderBy(schema.acceptances.seq);
      const chain = (await db().execute(sql`SELECT * FROM dr_verify_acceptance_chain() WHERE id IN (SELECT id FROM acceptances WHERE recipient_id = ${rid})`)).rows;
      const versions = await db().select().from(schema.legalTextVersions);
      const body = JSON.stringify({ exportedAt: new Date().toISOString(), note: "Hashes provide tamper evidence against ordinary modification, not absolute proof.", acceptances: acc,
        verification: chain, legalTextVersions: versions.filter((v) => acc.some((a) => [a.ndaVersionId, a.termsVersionId, a.privacyVersionId].includes(v.id))) }, null, 2);
      return new Response(body, { headers: privateHeaders("application/json", { "Content-Disposition": contentDisposition(`expediente-aceptacion-${rid}.json`) }) });
    }
  }
  return notFound();
}
