import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale } from "@/lib/i18n";

export async function uiLocale(): Promise<Locale> {
  const c = (await cookies()).get("rmdr_locale")?.value;
  if (c === "es" || c === "en") return c;
  const al = (await headers()).get("accept-language") ?? "";
  return /^en/i.test(al) ? "en" : "es";
}
