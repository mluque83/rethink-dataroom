import { dict } from "@/lib/i18n";
import { uiLocale } from "@/server/locale";
import { VerifyForm } from "./VerifyForm";
import { resendCodeAction } from "../../actions";

export default async function VerifyPage() {
  const t = dict(await uiLocale());
  return (
    <div className="card space-y-4">
      <h1>{t.access.codeTitle}</h1>
      <p className="notice" role="status">{t.access.generic}</p>
      <VerifyForm labels={{ code: t.access.code, verify: t.access.verify, invalid: t.access.invalid, throttled: t.access.throttled }} />
      <p className="text-sm text-muted">{t.access.codeHelp}</p>
      <form action={resendCodeAction}><button className="btn btn-secondary btn-sm" type="submit">{t.access.resend}</button></form>
      <p className="text-sm text-muted">{t.access.mailboxNote}</p>
    </div>
  );
}
