import { Brand } from "@/components/Brand";
import { dict } from "@/lib/i18n";
import { uiLocale } from "@/server/locale";
import { LocaleSwitch } from "@/components/LocaleSwitch";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const l = await uiLocale();
  const t = dict(l);
  return (
    <div className="min-h-screen flex flex-col">
      <div className="brand-band" aria-hidden />
      <header className="bg-white border-b border-line">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Brand sub={t.brandSub} />
          <LocaleSwitch current={l} />
        </div>
      </header>
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">{children}</main>
      <footer className="text-xs text-muted text-center py-4 px-4">Rethink Medical S.L. · {t.provisionalIdentity}</footer>
    </div>
  );
}
