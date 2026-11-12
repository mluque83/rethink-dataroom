"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/server/security";

export async function setLocaleAction(fd: FormData) {
  const l = fd.get("locale") === "en" ? "en" : "es";
  (await cookies()).set("rmdr_locale", l, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000, secure: process.env.APP_ENV === "production" });
  const ref = (await headers()).get("referer");
  let path = "/";
  try { if (ref) { const u = new URL(ref); path = u.pathname + u.search; } } catch { /* ignore */ }
  redirect(safeRedirectPath(path, "/"));
}
