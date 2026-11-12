import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { audit } from "./audit";

export const SETTINGS = {
  watermark: z.object({ opacity: z.number().min(0.08).max(0.35).default(0.26) }),
  tracking: z.object({
    /** Optional metrics (page views + estimated active time). Security/access logs are always kept. */
    detailedMetricsEnabled: z.boolean().default(true),
    heartbeatSeconds: z.number().int().min(5).max(60).default(15),
    idleSeconds: z.number().int().min(15).max(600).default(60),
    /** Max time credited per heartbeat interval (caps abrupt closes / lost beats). */
    maxCreditSeconds: z.number().int().min(5).max(120).default(30),
  }),
  retention: z.object({
    activityMonths: z.number().int().min(1).max(120).default(24),
    securityMonths: z.number().int().min(1).max(120).default(12),
    /** contractual evidence (acceptances) — never auto-deleted; review period to be confirmed by counsel */
    contractualNote: z.string().default("Conservación de evidencias contractuales: plazo POR CONFIRMAR con asesoría jurídica (no se borran automáticamente)."),
  }),
  notifications: z.object({
    firstVisit: z.boolean().default(true),
    ndaAccepted: z.boolean().default(true),
    accessRequest: z.boolean().default(true),
    questionCreated: z.boolean().default(true),
    emailTo: z.array(z.string().email()).default([]),
  }),
  invitations: z.object({ expiryDays: z.number().int().min(1).max(60).default(14) }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db().query.settings.findFirst({ where: eq(schema.settings.key, key) });
  const parsed = SETTINGS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SETTINGS[key].parse({})) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(adminId: string, key: K, value: unknown) {
  const v = SETTINGS[key].parse(value);
  await db().insert(schema.settings).values({ key, value: v, updatedBy: adminId })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: v, updatedBy: adminId, updatedAt: new Date() } });
  await audit({ actorType: "admin", actorUserId: adminId, action: "settings.changed", targetType: "settings", targetId: key, details: { value: v } });
}
