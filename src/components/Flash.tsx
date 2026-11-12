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
export function Badge({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="badge">—</span>;
  return <span className={`badge ${tone[v] ?? ""}`}>{v}</span>;
}
