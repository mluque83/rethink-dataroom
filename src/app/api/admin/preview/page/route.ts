import { getAdmin } from "@/server/authz";
import { authorizeVersion, isUuid } from "@/server/permissions";
import { watermarkedPageFor } from "@/server/documents/delivery";
import { notFound, privateHeaders } from "@/server/http";

/** "View as recipient": same authorisation as the recipient; NO activity is written. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return notFound();
  const u = new URL(req.url);
  const rid = u.searchParams.get("r") ?? "";
  if (!isUuid(rid)) return notFound();
  const a = await authorizeVersion(rid, u.searchParams.get("d") ?? "", u.searchParams.get("v") ?? "");
  if (!a) return notFound();
  const img = await watermarkedPageFor(a.subject.recipient as never, a.version, Number(u.searchParams.get("p")), { preview: true });
  if (!img) return notFound();
  return new Response(new Uint8Array(img), { headers: privateHeaders("image/png") });
}
