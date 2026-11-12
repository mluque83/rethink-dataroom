"use client";
import { useActionState } from "react";
import { verifyCodeAction } from "../../actions";

export function VerifyForm({ labels }: { labels: { code: string; verify: string; invalid: string; throttled: string } }) {
  const [state, action, pending] = useActionState(verifyCodeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="lbl" htmlFor="code">{labels.code}</label>
        <input id="code" name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required className="input text-2xl tracking-[0.4em] max-w-[14rem]" maxLength={7} />
      </div>
      {state?.error && <p className="notice notice-danger" role="alert">{state.error === "throttled" ? labels.throttled : labels.invalid}</p>}
      <button className="btn" type="submit" disabled={pending}>{labels.verify}</button>
    </form>
  );
}
