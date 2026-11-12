import { dict } from "@/lib/i18n";
import { uiLocale } from "@/server/locale";
import { requestCodeAction } from "../actions";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const t = dict(await uiLocale());
  const { reason } = await searchParams;
  const msg = reason ? t.access.reasons[reason] : "";
  return (
    <div className="card space-y-4">
      <h1>{t.access.title}</h1>
      {msg && <p className="notice notice-warn" role="status">{msg}</p>}
      <p>{t.access.intro}</p>
      <form action={requestCodeAction} className="space-y-3">
        <div>
          <label className="lbl" htmlFor="email">{t.access.email}</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" maxLength={320} />
        </div>
        <button className="btn" type="submit">{t.access.sendCode}</button>
      </form>
      <p className="text-sm text-muted">{t.access.mailboxNote}</p>
      <p className="text-sm text-muted">{t.access.trackingNotice}</p>
    </div>
  );
}
