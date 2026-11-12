import { requireRecipient } from "@/server/authz";
import { questionsForRecipient } from "@/server/qa";
import { loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { dict } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/format";
import { AskForm } from "./AskForm";
import Link from "next/link";

export default async function QaPage() {
  const g = await requireRecipient("ready");
  const l = g.recipient.locale === "en" ? "en" : "es";
  const t = dict(l);
  if (!g.recipient.qaEnabled) return <p className="card">{t.qa.disabled}</p>;
  const qs = await questionsForRecipient(g.recipient);
  const subject = await loadSubject(g.recipient.id);
  const docs = subject ? visibleDocuments(subject, await loadLibrary()).map((d) => ({ id: d.doc.id, title: d.doc.title })) : [];
  return (
    <div className="space-y-4">
      <h1>{t.qa.title}</h1>
      <p className="notice">{t.qa.private}</p>
      <AskForm docs={docs} labels={t.qa} />
      {!qs.length && <p className="text-muted">{t.qa.none}</p>}
      {qs.map((q) => (
        <article key={q.id} className="card space-y-2">
          <div className="flex flex-wrap gap-2 items-center"><h2 className="flex-1">{q.subject}</h2><span className="badge">{t.qa.statuses[q.status]}</span></div>
          <p className="text-xs text-muted">{fmtDateTime(q.createdAt, l)}{q.documentTitle && <> · <Link href={`/room/doc/${q.documentId}`}>{q.documentTitle}</Link></>}</p>
          <p className="whitespace-pre-wrap">{q.body}</p>
          {q.answers.length ? q.answers.map((a, i) => (
            <div key={i} className="notice"><strong>{t.qa.answer}</strong> <span className="text-xs text-muted">{fmtDateTime(a.publishedAt, l)}</span>
              <p className="whitespace-pre-wrap">{a.body}</p>
              {a.attachments.map((x) => <Link key={x.id} className="block text-sm" href={`/room/doc/${x.id}`}>📎 {x.title}</Link>)}
            </div>)) : <p className="text-sm text-muted">{t.qa.pending}</p>}
        </article>
      ))}
    </div>
  );
}
