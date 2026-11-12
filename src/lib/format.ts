/** Events are stored in UTC; display always states the time zone explicitly. */
export const DISPLAY_TZ = process.env.APP_TIMEZONE || "Europe/Madrid";

export function fmtDateTime(d: Date | string | null | undefined, locale: "es" | "en" = "es", tz = DISPLAY_TZ) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short",
  }).format(date);
}
export const fmtUtc = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : "—");
export function fmtDate(d: Date | string | null | undefined, locale: "es" | "en" = "es") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));
}
export function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${r} s` : `${r} s`;
}
export const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
