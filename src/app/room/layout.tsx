import Link from "next/link";
import { Brand } from "@/components/Brand";
import { dict } from "@/lib/i18n";
import { requireRecipient } from "@/server/authz";
import { recipientSignOutAction } from "@/app/(public)/actions";

export default async function RoomLayout({ children }: { children: React.ReactNode }) {
  const g = await requireRecipient("ready");
  const l = g.recipient.locale === "en" ? "en" : "es";
  const t = dict(l);
  return (
    <div className="min-h-screen">
      <div className="brand-band" aria-hidden />
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <Brand sub={t.brandSub} />
          <nav className="flex flex-wrap gap-3 text-sm flex-1" aria-label="Main">
            <Link href="/room">{t.room.title}</Link>
            {g.recipient.qaEnabled && <Link href="/room/qa">{t.room.qa}</Link>}
            <a href="/api/agreement/accepted">{t.room.agreement}</a>
            <Link href="/room/privacy">{t.room.privacy}</Link>
          </nav>
          <span className="text-sm text-muted">{g.recipient.displayName} · {g.email}</span>
          <form action={recipientSignOutAction}><button className="btn btn-secondary btn-sm">{t.common.logout}</button></form>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
