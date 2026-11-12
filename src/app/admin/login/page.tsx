import { Brand } from "@/components/Brand";
import { AdminLoginForm } from "./AdminLoginForm";

export default function AdminLogin() {
  return (
    <main className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="bg-orange rounded-lg px-5 py-4"><Brand negative sub="Administración del data room" /></div>
      <div className="card space-y-4">
        <h1>Acceso de administración</h1>
        <AdminLoginForm />
        <p className="text-xs text-muted">Se exige un segundo factor (TOTP). Sesiones revocables; los intentos se limitan.</p>
      </div>
    </main>
  );
}
