"use client";
import { useActionState, useState } from "react";
import { acceptAction } from "./actions";

type Labels = Record<string, string>;

export function AcceptForm({ email, locale, text, sha256, labels }: { email: string; locale: "es" | "en"; text: string; sha256: string; labels: Labels }) {
  const [state, action, pending] = useActionState(acceptAction, undefined);
  const [capacity, setCapacity] = useState<"personal" | "on_behalf">("personal");
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [entity, setEntity] = useState("");
  const canSubmit = checked && scrolledToEnd && (capacity === "personal" || (authority && entity.trim().length > 1));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="displayedSha256" value={sha256} />
      <input type="hidden" name="locale" value={locale} />
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><span className="lbl">{labels.verifiedEmail}</span> <span data-testid="verified-email">{email}</span></div>
        <div><label className="lbl" htmlFor="fullName">{labels.fullName} *</label><input id="fullName" name="fullName" required minLength={3} maxLength={200} className="input" autoComplete="name" /></div>
        <div><label className="lbl" htmlFor="company">{labels.company}</label><input id="company" name="company" maxLength={200} className="input" autoComplete="organization" /></div>
        <div><label className="lbl" htmlFor="position">{labels.position}</label><input id="position" name="position" maxLength={200} className="input" autoComplete="organization-title" /></div>
        <fieldset className="sm:col-span-2">
          <legend className="lbl">{labels.capacity}</legend>
          <label className="mr-4"><input type="radio" name="actingCapacity" value="personal" checked={capacity === "personal"} onChange={() => setCapacity("personal")} /> {labels.personal}</label>
          <label><input type="radio" name="actingCapacity" value="on_behalf" checked={capacity === "on_behalf"} onChange={() => setCapacity("on_behalf")} /> {labels.onBehalf}</label>
        </fieldset>
        {capacity === "on_behalf" && (
          <div className="sm:col-span-2 space-y-2">
            <label className="lbl" htmlFor="representedEntity">{labels.entity} *</label>
            <input id="representedEntity" name="representedEntity" value={entity} onChange={(e) => setEntity(e.target.value)} className="input" maxLength={200} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="authorityDeclared" checked={authority} onChange={(e) => setAuthority(e.target.checked)} /> {labels.authority}</label>
          </div>
        )}
      </div>
      <div>
        <p className="lbl">{labels.readAll}</p>
        <div
          className="card legal-text max-h-[55vh] overflow-y-auto" tabIndex={0} aria-label="Legal texts"
          onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true); }}
        >{text}</div>
        <a className="text-sm" href="/api/agreement/current" download>{labels.download}</a>
      </div>
      <label className="flex gap-2 items-start card">
        <input type="checkbox" name="accepted" checked={checked} disabled={!scrolledToEnd} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
        <span>{labels.checkbox}</span>
      </label>
      {state?.error && <p className="notice notice-danger" role="alert">{state.error === "changed" ? labels.changed : "Error"}</p>}
      <button className="btn" type="submit" disabled={!canSubmit || pending}>{labels.action}</button>
    </form>
  );
}
