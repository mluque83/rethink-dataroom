"use client";
import { useActionState } from "react";
import { askAction } from "./actions";

export function AskForm({ docs, labels }: { docs: { id: string; title: string }[]; labels: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(askAction, undefined);
  const L = labels as Record<string, string>;
  return (
    <form action={action} className="card space-y-3">
      <h2>{L.ask}</h2>
      <div><label className="lbl" htmlFor="subject">{L.subject}</label><input id="subject" name="subject" required minLength={3} maxLength={200} className="input" /></div>
      <div><label className="lbl" htmlFor="body">{L.body}</label><textarea id="body" name="body" required minLength={3} maxLength={5000} rows={4} className="input" /></div>
      <div><label className="lbl" htmlFor="documentId">{L.relatedDoc}</label>
        <select id="documentId" name="documentId" className="input"><option value="">—</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
      {state?.ok && <p className="notice" role="status">✓</p>}
      {state?.error && <p className="notice notice-danger" role="alert">Error</p>}
      <button className="btn" disabled={pending}>{L.submit}</button>
    </form>
  );
}
