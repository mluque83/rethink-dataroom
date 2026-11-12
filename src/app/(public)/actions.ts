"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { beginInvitation, requestCode, verifyCode } from "@/server/access";
import { requestMeta } from "@/server/request";
import { auth } from "@/server/auth";

const COOKIE = { httpOnly: true, sameSite: "strict" as const, path: "/", maxAge: 900, secure: process.env.APP_ENV === "production" };

export async function startInvitationAction(fd: FormData) {
  const token = String(fd.get("token") ?? "").slice(0, 100);
  const email = String(fd.get("email") ?? "").slice(0, 320);
  await beginInvitation(token, email, await requestMeta());
  const c = await cookies();
  c.set("rmdr_pe", email.trim().toLowerCase(), COOKIE);
  c.set("rmdr_pi", token, COOKIE); // only to allow "resend" on the next screen
  redirect("/access/verify?sent=1");
}

export async function requestCodeAction(fd: FormData) {
  const email = String(fd.get("email") ?? "").slice(0, 320);
  await requestCode(email, await requestMeta());
  (await cookies()).set("rmdr_pe", email.trim().toLowerCase(), COOKIE);
  redirect("/access/verify?sent=1");
}

export async function resendCodeAction() {
  const c = await cookies();
  const email = c.get("rmdr_pe")?.value ?? "";
  const token = c.get("rmdr_pi")?.value;
  if (token) await beginInvitation(token, email, await requestMeta());
  else await requestCode(email, await requestMeta());
  redirect("/access/verify?sent=1");
}

export async function verifyCodeAction(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  const c = await cookies();
  const email = c.get("rmdr_pe")?.value ?? "";
  const code = String(fd.get("code") ?? "").replace(/\s/g, "").slice(0, 10);
  const r = await verifyCode(email, code, await requestMeta(), await headers());
  if (!r.ok) return { error: r.error };
  c.delete("rmdr_pe"); c.delete("rmdr_pi");
  redirect(r.stage === "ready" ? "/room" : "/onboarding");
}

export async function recipientSignOutAction() {
  await auth().api.signOut({ headers: await headers() });
  redirect("/access");
}
