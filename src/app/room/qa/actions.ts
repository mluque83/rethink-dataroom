"use server";
import { revalidatePath } from "next/cache";
import { requireRecipient } from "@/server/authz";
import { askQuestion } from "@/server/qa";

export async function askAction(_p: { ok?: boolean; error?: string } | undefined, fd: FormData) {
  const g = await requireRecipient("ready");
  try {
    await askQuestion(g.recipient, g.sessionId, { subject: fd.get("subject"), body: fd.get("body"), documentId: fd.get("documentId") || "" });
  } catch { return { error: "invalid" }; }
  revalidatePath("/room/qa");
  return { ok: true };
}
