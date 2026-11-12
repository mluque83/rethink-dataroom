import Link from "next/link";
import type { VisibleDoc } from "@/server/permissions";
import { dict, type Locale } from "@/lib/i18n";
import { fmtDate, fmtDateTime } from "@/lib/format";

type Section = { id: string; code: string; nameEs: string; nameEn: string; sortOrder: number };

/** Receives ONLY documents already filtered by the permission engine. Sections without visible documents are not rendered. */
export function RoomView({ docs, sections, locale, basePath, q }: { docs: VisibleDoc[]; sections: Section[]; locale: Locale; basePath: string; q?: string }) {
  const t = dict(locale);
  const needle = (q ?? "").trim().toLowerCase();
  const filtered = needle ? docs.filter((d) => d.doc.title.toLowerCase().includes(needle) || (d.doc.tags ?? []).some((x) => x.toLowerCase().includes(needle))) : docs;
  const bySection = sections.map((s) => ({ s, items: filtered.filter((d) => d.doc.sectionId === s.id).sort((a, b) => a.doc.title.localeCompare(b.doc.title)) })).filter((x) => x.items.length);
  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="q">{t.room.search}</label>
        <input id="q" name="q" defaultValue={q} placeholder={t.room.search} className="input max-w-md" />
        <button className="btn btn-secondary">{t.common.search}</button>
      </form>
      {!bySection.length && <p className="card">{t.room.empty}</p>}
      {bySection.map(({ s, items }) => (
        <section key={s.id} className="card" aria-labelledby={`s-${s.id}`}>
          <h2 id={`s-${s.id}`}>{s.code}. {locale === "en" ? s.nameEn : s.nameEs}</h2>
          <ul className="divide-y divide-line mt-2">
            {items.map((d) => (
              <li key={d.doc.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link href={`${basePath}/doc/${d.doc.id}`} className="font-semibold flex-1 min-w-[14rem]">{d.doc.title}</Link>
                {d.doc.isDemo && <span className="badge badge-demo">{t.common.demo}</span>}
                <span className="text-sm text-muted">{t.room.version} {d.version.versionNumber}</span>
                <span className="text-sm text-muted">{t.room.docDate}: {fmtDate(d.doc.documentDate, locale)}</span>
                <span className="text-sm text-muted">{t.room.published}: {fmtDateTime(d.version.publishedAt, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
