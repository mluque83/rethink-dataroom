import { requireRecipient } from "@/server/authz";
import { loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { RoomView } from "@/components/RoomView";
import { dict } from "@/lib/i18n";
import { DISPLAY_TZ } from "@/lib/format";

export default async function RoomPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const g = await requireRecipient("ready");
  const l = g.recipient.locale === "en" ? "en" : "es";
  const lib = await loadLibrary();
  const subject = await loadSubject(g.recipient.id);
  const docs = subject ? visibleDocuments(subject, lib) : [];
  const { q } = await searchParams;
  return (
    <div className="space-y-4">
      <h1>{dict(l).room.title}</h1>
      <p className="text-xs text-muted">{dict(l).common.tzNote} {DISPLAY_TZ}</p>
      <RoomView docs={docs} sections={lib.sections} locale={l} basePath="/room" q={q} />
    </div>
  );
}
