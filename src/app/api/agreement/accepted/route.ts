import { recipientGate } from "@/server/authz";
import { acceptancesOf } from "@/server/legal";
import { fmtUtc } from "@/lib/format";

/** The recipient's own copy of what they accepted (with evidence metadata). */
export async function GET() {
  const g = await recipientGate();
  if (!g.ok || g.stage !== "ready") return new Response("Not found", { status: 404 });
  const [a] = await acceptancesOf(g.recipient.id);
  if (!a) return new Response("Not found", { status: 404 });
  const body = [
    "RETHINK MEDICAL — COPIA DEL ACUERDO ACEPTADO / COPY OF ACCEPTED AGREEMENT", "",
    `Aceptado por / Accepted by: ${a.declaredFullName} <${a.verifiedEmail}>`,
    `Empresa / Company: ${a.declaredCompany ?? "—"} · Cargo / Position: ${a.declaredPosition ?? "—"}`,
    `Capacidad / Capacity: ${a.actingCapacity}${a.representedEntity ? ` (${a.representedEntity})` : ""}`,
    `Fecha y hora del servidor / Server time: ${fmtUtc(a.acceptedAt)}`,
    `Casilla / Checkbox: ${a.checkboxLabel}`, `Acción / Action: ${a.actionLabel}`,
    `SHA-256 del texto / text hash: ${a.displayedTextSha256}`, `Registro / Record: ${a.id} (hash ${a.recordHash})`, "",
    a.displayedText,
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="acuerdo-aceptado-${a.acceptedAt.toISOString().slice(0, 10)}.txt"`, "Cache-Control": "private, no-store" },
  });
}
