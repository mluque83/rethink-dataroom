import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { RecipientFields } from "@/components/RecipientFields";
import { Flash } from "@/components/Flash";
import { createRecipientAction } from "../../actions";

export default async function NewRecipient({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const d = db();
  const [orgs, ndas, groups, profiles] = await Promise.all([d.select().from(schema.organizations), d.select().from(schema.legalTexts).where(eq(schema.legalTexts.kind, "nda")),
    d.select().from(schema.groups), d.select().from(schema.accessProfiles)]);
  return (
    <div className="space-y-4">
      <h1>Nuevo destinatario</h1>
      <Flash searchParams={searchParams} />
      <form action={createRecipientAction} className="card space-y-4">
        <RecipientFields orgs={orgs} ndas={ndas} groups={groups} memberOf={[]} />
        <div><label className="lbl" htmlFor="profileId">Perfil (plantilla; se copia en reglas individuales editables)</label>
          <select id="profileId" name="profileId" className="input max-w-md"><option value="">Ninguno (sin acceso hasta añadir reglas)</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}</select></div>
        <p className="text-xs text-muted">Crear el destinatario no envía nada. Podrá ajustar permisos, previsualizar y revisar el resumen antes de invitar.</p>
        <button className="btn">Crear</button>
      </form>
    </div>
  );
}
