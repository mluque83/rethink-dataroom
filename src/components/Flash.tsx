export async function Flash({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.err) return <p className="notice notice-danger" role="alert">Error: {sp.err}</p>;
  if (sp.msg) return <p className="notice" role="status">✓ {sp.msg}</p>;
  return null;
}

const tone: Record<string, string> = {
  published: "badge-ok", active: "badge-ok", clean: "badge-ok", ok: "badge-ok", answered: "badge-ok", verified: "badge-ok", pass: "badge-ok", received: "badge-ok", legal_reviewed: "badge-ok",
  in_review: "badge-warn", approved: "badge-warn", warning: "badge-warn", pending: "badge-warn", processing: "badge-warn", uploaded: "badge-warn", invited: "badge-warn",
  sent: "badge-warn", created: "badge-warn", not_configured: "badge-warn", released_unscanned_dev: "badge-warn", open: "badge-warn", draft: "badge-warn", expected: "badge-warn",
  pending_legal_review: "badge-warn", incomplete: "badge-warn", in_progress: "badge-warn",
  conversion_failed: "badge-danger", failed: "badge-danger", infected: "badge-danger", revoked: "badge-danger", rejected: "badge-danger", withdrawn: "badge-danger",
  expired: "badge-danger", fail: "badge-danger", error: "badge-danger", suspended: "badge-danger",
};
/** Human-readable Spanish labels for internal state codes (the code stays in the title attribute). */
const label: Record<string, string> = {
  published: "Publicada", active: "Activo", clean: "Limpio", ok: "OK", answered: "Respondida", verified: "Verificada", pass: "Supera",
  received: "Recibido", legal_reviewed: "Revisado jurídicamente", in_review: "En revisión", approved: "Aprobada", warning: "Revisar",
  pending: "Pendiente", processing: "Procesando", uploaded: "Cargada", invited: "Invitado", sent: "Enviada", created: "Creada",
  not_configured: "Cuarentena (sin antivirus)", released_unscanned_dev: "Liberado sin antivirus (dev)", open: "Abierta", draft: "Borrador",
  expected: "Esperado", pending_legal_review: "Pendiente revisión jurídica", incomplete: "Incompleta", in_progress: "En curso",
  conversion_failed: "Conversión fallida", failed: "Fallida", infected: "Infectado", revoked: "Revocado", rejected: "Rechazada",
  withdrawn: "Retirada", expired: "Caducada", fail: "No supera", error: "Error", suspended: "Suspendido", superseded: "Sustituida",
  not_applicable: "No aplica", valid: "Vigente", pending_verification: "Pendiente de verificar", not_checked: "No comprobado",
  retired: "Retirada", closed: "Cerrada",
};
export function Badge({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="badge">—</span>;
  return <span className={`badge ${tone[v] ?? ""}`} title={v}>{label[v] ?? v}</span>;
}
