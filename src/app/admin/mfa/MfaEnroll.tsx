"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";

export function MfaEnroll() {
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const r = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
    if (r.error || !r.data || !("totpURI" in r.data)) return setError("No se pudo iniciar el alta. Revisa la contraseña.");
    setUri(r.data.totpURI); setCodes(r.data.backupCodes ?? []);
    setQr(await QRCode.toDataURL(r.data.totpURI, { margin: 1, width: 220 }));
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const r = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "") });
    if (r.error) return setError("Código no válido.");
    // full navigation on purpose: reload server state with the new session cookie
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin";
  }
  if (!uri) return (
    <form onSubmit={start} className="space-y-3">
      <div><label className="lbl" htmlFor="password">Confirma tu contraseña</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
      {error && <p className="notice notice-danger">{error}</p>}
      <button className="btn">Generar clave TOTP</button>
    </form>
  );
  const secret = new URL(uri).searchParams.get("secret");
  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="Código QR TOTP" width={220} height={220} />}
      <p className="text-xs break-all">Clave manual: <code data-testid="totp-secret">{secret}</code></p>
      {codes.length > 0 && <details className="text-sm"><summary>Códigos de recuperación (guárdalos de forma segura; se muestran una vez)</summary><pre className="text-xs">{codes.join("\n")}</pre></details>}
      <form onSubmit={verify} className="space-y-3">
        <div><label className="lbl" htmlFor="code">Código de 6 dígitos</label><input id="code" name="code" inputMode="numeric" required className="input" maxLength={7} /></div>
        {error && <p className="notice notice-danger">{error}</p>}
        <button className="btn">Verificar y activar</button>
      </form>
    </div>
  );
}
