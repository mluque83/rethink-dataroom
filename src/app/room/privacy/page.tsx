import { requireRecipient, requiredLegalVersions } from "@/server/authz";
export default async function PrivacyPage() {
  const g = await requireRecipient("ready");
  const req = await requiredLegalVersions(g.recipient);
  return <div className="card legal-text">{req.privacy?.body ?? "—"}</div>;
}
