"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AdminLoginForm() {
  const [step, setStep] = useState<"password" | "totp">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
    setBusy(false);
    if (r.error) return setError("Credenciales no válidas o demasiados intentos.");
    if ((r.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) return setStep("totp");
    // full navigation on purpose: reload server state with the new session cookie
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/mfa";
  }
  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const r = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (r.error) return setError("Código no válido.");
    // full navigation on purpose: reload server state with the new session cookie
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin";
  }
  return step === "password" ? (
    <form onSubmit={onPassword} className="space-y-3">
      <div><label className="lbl" htmlFor="email">Correo</label><input id="email" name="email" type="email" required className="input" autoComplete="username" /></div>
      <div><label className="lbl" htmlFor="password">Contraseña</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>Continuar</button>
    </form>
  ) : (
    <form onSubmit={onTotp} className="space-y-3">
      <div><label className="lbl" htmlFor="code">Código de la app autenticadora</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input" maxLength={7} /></div>
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>Verificar</button>
    </form>
  );
}
