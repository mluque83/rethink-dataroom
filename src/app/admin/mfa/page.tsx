import { redirect } from "next/navigation";
import { getAdmin } from "@/server/authz";
import { Brand } from "@/components/Brand";
import { MfaEnroll } from "./MfaEnroll";

export default async function MfaPage() {
  const a = await getAdmin({ allowWithoutMfa: true });
  if (!a) redirect("/admin/login");
  if (await getAdmin()) redirect("/admin");
  return (
    <main className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="bg-orange rounded-lg px-5 py-4"><Brand negative sub="Administración del data room" /></div>
      <div className="card space-y-4">
        <h1>Activar segundo factor (obligatorio)</h1>
        <p className="text-sm">Los administradores deben usar una app autenticadora (TOTP). Hasta completar este paso no hay acceso al panel.</p>
        <MfaEnroll />
      </div>
    </main>
  );
}
