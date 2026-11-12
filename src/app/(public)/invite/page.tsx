import { dict } from "@/lib/i18n";
import { uiLocale } from "@/server/locale";
import { InviteForm } from "./InviteForm";

// GET of this page performs NO lookup, consumes nothing and records no visit:
// the token lives in the URL fragment and is only sent by an explicit form POST.
export default async function InvitePage() {
  const t = dict(await uiLocale());
  return (
    <div className="card space-y-4">
      <h1>{t.access.inviteTitle}</h1>
      <p>{t.access.inviteIntro}</p>
      <InviteForm labels={{ email: t.access.email, send: t.access.sendCode, missing: t.access.inviteMissing }} />
      <p className="text-sm text-muted">{t.access.mailboxNote}</p>
      <p className="text-sm text-muted">{t.access.trackingNotice}</p>
    </div>
  );
}
