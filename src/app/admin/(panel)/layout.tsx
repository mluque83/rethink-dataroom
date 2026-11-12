import Link from "next/link";
import { Brand } from "@/components/Brand";
import { requireAdmin } from "@/server/authz";
import { dict } from "@/lib/i18n";
import { uiLocale } from "@/server/locale";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { adminSignOutAction } from "./actions";
import { env } from "@/server/env";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const l = await uiLocale();
  const n = dict(l).admin.nav;
  const items: [string, string][] = [["/admin", n.dashboard], ["/admin/library", n.library], ["/admin/checklist", n.checklist], ["/admin/recipients", n.recipients],
    ["/admin/groups", n.groups], ["/admin/profiles", n.profiles], ["/admin/legal", n.legal], ["/admin/activity", n.activity], ["/admin/qa", n.qa],
    ["/admin/audit", n.audit], ["/admin/import", n.importer], ["/admin/settings", n.settings], ["/admin/metrics", n.metrics]];
  const dev = env().APP_ENV !== "production";
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 bg-white border-b md:border-b-0 md:border-r border-line p-4 space-y-4 border-t-[6px] border-t-orange">
        <Brand sub="Administración" small />
        <nav aria-label="Admin" className="flex md:flex-col flex-wrap gap-x-3 gap-y-1 text-sm">
          {items.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          {dev && <Link href="/admin/dev-mailbox" className="text-warn">Buzón de desarrollo</Link>}
        </nav>
        <div className="text-xs text-muted break-all">{a.email}</div>
        <div className="flex gap-2 items-center"><LocaleSwitch current={l} />
          <form action={adminSignOutAction}><button className="btn btn-secondary btn-sm">{dict(l).common.logout}</button></form></div>
        {dev && <p className="badge badge-warn">ENTORNO DE DESARROLLO</p>}
      </aside>
      <main className="flex-1 p-4 md:p-6 space-y-4 min-w-0">{children}</main>
    </div>
  );
}
