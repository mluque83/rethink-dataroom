import { recipientGate } from "@/server/authz";
import { currentAgreement } from "@/server/legal";

export async function GET() {
  const g = await recipientGate();
  if (!g.ok) return new Response("Not found", { status: 404 });
  const ag = await currentAgreement(g.recipient);
  if (!ag) return new Response("Not found", { status: 404 });
  return new Response(`${ag.text}\n\nSHA-256: ${ag.sha256}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="rethink-medical-terms-nda.txt"', "Cache-Control": "private, no-store" },
  });
}
