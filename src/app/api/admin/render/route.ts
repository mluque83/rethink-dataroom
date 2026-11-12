import { and, eq } from "drizzle-orm";
import { getAdmin } from "@/server/authz";
import { db, schema } from "@/server/db";
import { storage } from "@/server/storage";
import { isUuid } from "@/server/permissions";
import { buildWatermarkSpec, watermarkPage } from "@/server/documents/watermark";
import { notFound, privateHeaders } from "@/server/http";

/** Internal review of renditions (any status) — watermarked with the ADMIN's identity. */
export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a) return notFound();
  const u = new URL(req.url);
  const v = u.searchParams.get("v") ?? "", p = Number(u.searchParams.get("p"));
  if (!isUuid(v) || !Number.isInteger(p)) return notFound();
  const r = await db().select({ key: schema.files.storageKey }).from(schema.pageRenders).innerJoin(schema.files, eq(schema.files.id, schema.pageRenders.fileId))
    .where(and(eq(schema.pageRenders.versionId, v), eq(schema.pageRenders.pageNumber, p)));
  if (!r[0]) return notFound();
  const spec = buildWatermarkSpec({ name: "INTERNAL REVIEW", email: a.email, accessCode: "ADMIN", date: new Date() });
  const img = await watermarkPage(await storage().get(r[0].key), spec);
  return new Response(new Uint8Array(img), { headers: privateHeaders("image/png") });
}
