"use server";
import { redirect } from "next/navigation";
import { recipientGate } from "@/server/authz";
import { acceptAgreement, AgreementChangedError } from "@/server/legal";
import { requestMeta } from "@/server/request";

export async function acceptAction(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  const g = await recipientGate();
  if (!g.ok) redirect(`/access?reason=${g.reason}`);
  if (g.stage === "ready") redirect("/room");
  try {
    await acceptAgreement(g, {
      fullName: fd.get("fullName"), company: fd.get("company") ?? "", position: fd.get("position") ?? "",
      actingCapacity: fd.get("actingCapacity"), representedEntity: fd.get("representedEntity") ?? "",
      authorityDeclared: fd.get("authorityDeclared") === "on", accepted: fd.get("accepted") === "on",
      displayedSha256: fd.get("displayedSha256"), locale: fd.get("locale") === "en" ? "en" : "es",
    }, await requestMeta());
  } catch (e) {
    if (e instanceof AgreementChangedError) return { error: "changed" };
    return { error: "invalid" };
  }
  redirect("/room");
}
