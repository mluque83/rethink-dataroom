import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getAdmin } from "@/server/authz";
import { db, schema } from "@/server/db";
import { isUuid } from "@/server/permissions";
import { watermarkFor } from "@/server/documents/delivery";
import { watermarkPage } from "@/server/documents/watermark";
import { notFound, privateHeaders } from "@/server/http";

/** Watermark example for the pre-invitation summary, on a synthetic test page (no document content). */
export async function GET(req: Request) {
  if (!(await getAdmin())) return notFound();
  const id = new URL(req.url).searchParams.get("r") ?? "";
  if (!isUuid(id)) return notFound();
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.id, id) });
  if (!r) return notFound();
  const rows = Array.from({ length: 14 }, (_, i) => `<rect x="80" y="${260 + i * 50}" width="860" height="50" fill="none" stroke="#999"/><text x="100" y="${292 + i * 50}" font-size="22" font-family="DejaVu Sans">Fila de prueba ${i + 1}    123.456,78 €    Texto de ejemplo para legibilidad</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1020" height="1320"><rect width="100%" height="100%" fill="#fff"/><text x="80" y="150" font-size="40" font-family="DejaVu Sans" font-weight="700">Página de ejemplo (sin contenido real)</text>${rows}<rect x="120" y="1000" width="120" height="200" fill="#1f5a8a"/><rect x="300" y="900" width="120" height="300" fill="#1f5a8a"/><rect x="480" y="1050" width="120" height="150" fill="#1f5a8a"/></svg>`;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const img = await watermarkPage(base, await watermarkFor(r));
  return new Response(new Uint8Array(img), { headers: privateHeaders("image/png") });
}
