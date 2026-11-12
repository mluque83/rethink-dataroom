/* eslint-disable @next/next/no-img-element */
// Official imagotype extracted losslessly from the Rethink Medical brand book (Sept. 2022).
// Rules applied: positive version on white/light backgrounds, white (negative) version only on
// corporate orange, protected clear space (padding) and a minimum rendered width (~120 px).
export function Brand({ sub, small, negative }: { sub?: string; small?: boolean; negative?: boolean }) {
  const w = small ? 128 : 170;
  return (
    <div className="flex flex-col gap-1 py-1 px-1">
      <img src={negative ? "/brand/rethink-medical-logo-white.png" : "/brand/rethink-medical-logo.png"} alt="Rethink Medical" width={w} height={Math.round(w * 0.354)} className="brand-logo" />
      {sub && <span className={`text-xs ${negative ? "text-ink" : "text-muted"}`} style={{ fontFamily: "var(--font-display)", letterSpacing: ".08em", fontSize: 13 }}>{sub}</span>}
    </div>
  );
}
