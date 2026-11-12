import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { dict, type Locale } from "@/lib/i18n";
import { recipientGate } from "@/server/authz";
import { currentAgreement, ACCEPT_LABELS, acceptancesOf } from "@/server/legal";
import { AcceptForm } from "./AcceptForm";

export default async function OnboardingPage() {
  const g = await recipientGate();
  if (!g.ok) redirect(`/access?reason=${g.reason}`);
  if (g.stage === "ready") redirect("/room");
  const l = (g.recipient.locale === "en" ? "en" : "es") as Locale;
  const t = dict(l);
  const ag = await currentAgreement(g.recipient);
  const previous = (await acceptancesOf(g.recipient.id)).length > 0;
  const isDraft = ag && [ag.nda, ag.terms, ag.privacy].some((v) => v.legalReviewStatus !== "legal_reviewed");
  return (
    <div className="min-h-screen">
      <div className="brand-band" aria-hidden />
      <header className="bg-white border-b border-line"><div className="max-w-4xl mx-auto px-4 py-3"><Brand sub={t.brandSub} /></div></header>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <h1>{t.onboarding.title}</h1>
        {previous && <p className="notice notice-warn">{t.onboarding.reaccept}</p>}
        <p>{t.onboarding.intro}</p>
        {!ag ? <p className="notice notice-danger">No hay textos activos. / No active texts. (Contacte con Rethink Medical)</p> : (
          <>
            {isDraft && <p className="notice notice-warn">{t.onboarding.draftWarning}</p>}
            <p className="notice">{t.access.trackingNotice} {t.onboarding.privacySeparate}</p>
            <AcceptForm
              email={g.email} locale={l} text={ag.text} sha256={ag.sha256}
              labels={{ ...t.onboarding, checkbox: ACCEPT_LABELS[l].checkbox, action: ACCEPT_LABELS[l].action }}
            />
          </>
        )}
      </main>
    </div>
  );
}
