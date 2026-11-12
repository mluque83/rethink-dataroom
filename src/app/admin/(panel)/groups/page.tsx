import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { RulesEditor } from "@/components/RulesEditor";
import { Flash } from "@/components/Flash";
import { groupAction } from "../actions";

export default async function Groups({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const d = db();
  const groups = await d.select().from(schema.groups);
  const members = await d.select({ groupId: schema.groupMembers.groupId, name: schema.recipients.displayName }).from(schema.groupMembers).innerJoin(schema.recipients, eq(schema.recipients.id, schema.groupMembers.recipientId));
  const rules = await d.select().from(schema.accessRules).where(eq(schema.accessRules.subjectType, "group"));
  return (
    <div className="space-y-4">
      <h1>Grupos</h1>
      <Flash searchParams={searchParams} />
      <p className="text-sm text-muted">Los permisos de grupo se heredan. Las restricciones (denegaciones) individuales o de grupo siempre prevalecen sobre cualquier permiso. La pertenencia se gestiona desde cada destinatario.</p>
      {groups.map((g) => (
        <section key={g.id} className="card space-y-2">
          <h2>{g.name} {g.isDemo && <span className="badge badge-demo">DEMO</span>}</h2>
          <p className="text-sm">{g.description}</p>
          <p className="text-sm">Miembros: {members.filter((m) => m.groupId === g.id).map((m) => m.name).join(", ") || "ninguno"}</p>
          <RulesEditor subjectType="group" subjectId={g.id} rules={rules.filter((r) => r.groupId === g.id)} returnTo="/admin/groups" />
        </section>))}
      <form action={groupAction} className="card flex flex-wrap gap-2 items-end">
        <div><label className="lbl" htmlFor="gname">Nuevo grupo</label><input id="gname" name="name" required className="input" /></div>
        <div className="flex-1"><label className="lbl" htmlFor="gdesc">Descripción</label><input id="gdesc" name="description" className="input" /></div>
        <button className="btn">Crear</button></form>
    </div>
  );
}
