"use client";
import { useEffect, useRef, useState } from "react";
import { startInvitationAction } from "../actions";

export function InviteForm({ labels }: { labels: { email: string; send: string; missing: string } }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const captured = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // capture once (effects may run twice in development) and then remove the token
    // from the address bar / history so it is not shared or screenshotted by accident
    if (captured.current === undefined) {
      const m = /(?:^|[#&])t=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash);
      captured.current = m ? m[1] : null;
      if (m) history.replaceState(null, "", window.location.pathname);
    }
    setToken(captured.current);
    setReady(true);
  }, []);
  if (!ready) return null;
  if (!token) return <p className="notice notice-warn">{labels.missing}</p>;
  return (
    <form action={startInvitationAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="lbl" htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" maxLength={320} />
      </div>
      <button className="btn" type="submit">{labels.send}</button>
    </form>
  );
}
