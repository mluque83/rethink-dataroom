import { db, schema } from "@/server/db";
import { Flash } from "@/components/Flash";
import { profileAction } from "../actions";
import type { ProfileDefinition } from "@/server/recipients";

export default async function Profiles({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const d = db();
  const [profiles, sections] = await Promise.all([d.select().from(schema.accessProfiles), d.select().from(schema.sections).orderBy(schema.sections.sortOrder)]);
  const form = (p?: (typeof profiles)[number]) => {
    const def = (p?.definition ?? { sections: [] }) as ProfileDefinition;
    return (
      <form key={p?.id ?? "new"} action={profileAction} className="card space-y-2">
        <input type="hidden" name="profileId" value={p?.id ?? ""} />
        <div className="grid md:grid-cols-2 gap-2"><input name="name" required defaultValue={p?.name} placeholder="Nombre" className="input" /><input name="description" defaultValue={p?.description ?? ""} placeholder="Descripción" className="input" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-sm">{sections.map((s) => { const e = def.sections.find((x) => x.code === s.code); return (
          <div key={s.id}><label><input type="checkbox" name="view" value={s.code} defaultChecked={!!e?.view} /> {s.code} {s.nameEs}</label> <label className="text-xs text-muted"><input type="checkbox" name="dl" value={s.code} defaultChecked={!!e?.downloadWatermarked} /> desc.</label></div>); })}</div>
        <label className="text-sm mr-4"><input type="checkbox" name="qaEnabled" defaultChecked={!!def.qaEnabled} /> Q&A</label>
        <label className="text-sm"><input type="checkbox" name="allowWatermarkedDownloads" defaultChecked={!!def.allowWatermarkedDownloads} /> Descargas con marca</label>
        <div><button className="btn btn-sm">{p ? "Guardar" : "Crear perfil"}</button></div>
      </form>);
  };
  return (
    <div className="space-y-4">
      <h1>Perfiles de acceso (plantillas)</h1>
      <Flash searchParams={searchParams} />
      <p className="text-sm text-muted">Un perfil se copia como reglas individuales al aplicarlo; modificarlo después no cambia a quien ya lo tiene. Ajuste cada destinatario antes de invitar.</p>
      {profiles.map((p) => form(p))}
      <h2>Nuevo perfil</h2>{form()}
    </div>
  );
}
