import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createAdmin, q, totp, waitMail } from "./helpers";

const SHOTS = "test-results/screens";
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const stamp = Date.now().toString(36);
const adminEmail = `e2e-admin-${stamp}@example.test`;
const adminPassword = randomBytes(18).toString("base64url");
const recipientEmail = `e2e-investor-${stamp}@example.test`;
const docTitle = `E2E documento sintético ${stamp}`;

test("admin + recipient end-to-end walkthrough", async ({ browser }) => {
  createAdmin(adminEmail, adminPassword);
  const admin = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: "es-ES" });

  // --- admin login + mandatory TOTP enrolment
  await admin.goto("/admin/login");
  await admin.getByLabel("Correo").fill(adminEmail);
  await admin.getByLabel("Contraseña").fill(adminPassword);
  await admin.getByRole("button", { name: "Continuar" }).click();
  await admin.waitForURL(/\/admin\/mfa/);
  await admin.getByLabel("Confirma tu contraseña").fill(adminPassword);
  await admin.getByRole("button", { name: "Generar clave TOTP" }).click();
  const secret = (await admin.getByTestId("totp-secret").textContent())!.trim();
  await admin.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await admin.getByRole("button", { name: "Verificar y activar" }).click();
  await admin.waitForURL(/\/admin$/);
  await shot(admin, "01-admin-dashboard");

  // --- upload a document (private, in review)
  await admin.goto("/admin/library");
  await admin.locator("summary", { hasText: "Nuevo documento" }).click();
  await admin.getByLabel("Título *").fill(docTitle);
  await admin.getByLabel("Categoría *").selectOption({ label: "02. Cap Table & Financing" });
  await admin.locator("input[name=file]").first().setInputFiles(path.resolve("tests/fixtures/sample.docx"));
  await admin.getByRole("button", { name: "Crear documento" }).click();
  await admin.waitForURL(/\/admin\/documents\//);
  const docId = admin.url().split("/documents/")[1].split("?")[0];
  // wait for the worker (sandboxed conversion)
  await expect(async () => { await admin.reload(); await expect(admin.getByTestId("version-1")).toContainText("En revisión"); }).toPass({ timeout: 90_000 });
  await shot(admin, "02-document-in-review");
  const v1 = admin.getByTestId("version-1");
  if (await v1.getByRole("button", { name: /Liberar SIN antivirus/ }).count()) { await v1.getByRole("button", { name: /Liberar SIN antivirus/ }).click(); await admin.waitForURL(/msg=/); }
  if (await admin.getByTestId("version-1").getByRole("button", { name: /Confirmo fidelidad/ }).count()) { await admin.getByTestId("version-1").getByRole("button", { name: /Confirmo fidelidad/ }).click(); await admin.waitForURL(/msg=/); }
  await admin.getByTestId("version-1").getByPlaceholder("Motivo / notas").first().fill("revisado e2e");
  await admin.getByTestId("version-1").getByRole("button", { name: "Aprobar" }).click();
  await admin.waitForURL(/msg=approve/);
  // published only after explicit confirmation
  const pub = admin.getByTestId("publish-form");
  await pub.getByLabel(/He revisado la audiencia/).check();
  await pub.getByRole("button", { name: "Publicar" }).click();
  await admin.waitForURL(/msg=published/);
  await shot(admin, "03-document-published");

  // --- recipient with profile
  await admin.goto("/admin/recipients/new");
  await admin.getByLabel("Correo autorizado *").fill(recipientEmail);
  await admin.getByLabel("Nombre *").fill("E2E Inversora Prueba");
  const prof = admin.getByLabel(/Perfil \(plantilla/);
  await prof.selectOption((await prof.locator("option", { hasText: "Inversor en evaluación" }).getAttribute("value"))!);
  await admin.getByRole("button", { name: "Crear" }).click();
  await admin.waitForURL(/\/admin\/recipients\/[0-9a-f-]{36}/);
  const recipientId = admin.url().split("/recipients/")[1].split("?")[0];
  // individual restriction (deny downloads) + enable Q&A and watermarked downloads on recipient
  await admin.locator("summary", { hasText: "Datos del destinatario" }).click();
  await admin.getByLabel("Descargas con marca de agua").check();
  await admin.getByRole("button", { name: "Guardar" }).last().click();
  await admin.waitForURL(/msg=saved/);
  await expect(admin.getByText(docTitle).first()).toBeVisible();
  // master switch alone is not enough: an explicit rule must also grant the download
  const rf = admin.locator("form", { has: admin.getByRole("button", { name: "Añadir regla" }) });
  const tgt = rf.getByLabel("Objetivo");
  await tgt.selectOption((await tgt.locator("option", { hasText: docTitle }).first().getAttribute("value"))!);
  await rf.getByLabel("Descarga con marca").check();
  await rf.getByRole("button", { name: "Añadir regla" }).click();
  await admin.waitForURL(/msg=permissions_saved/);
  await shot(admin, "04-recipient-summary");

  // --- preview as recipient: must not create activity
  await admin.goto(`/admin/recipients/${recipientId}/preview`);
  await admin.getByRole("link", { name: docTitle }).click();
  await expect(admin.getByAltText("Página 1")).toBeVisible();
  await admin.waitForTimeout(1500);
  await shot(admin, "05-admin-preview-viewer");
  expect((await q("SELECT count(*)::int n FROM activity_events WHERE recipient_id = $1", [recipientId]))[0].n).toBe(0);

  // --- invitation (dev mail provider, nothing leaves the machine)
  await admin.goto(`/admin/recipients/${recipientId}`);
  const since = new Date(Date.now() - 1000);
  await admin.getByLabel(/He revisado contenido/).check();
  await admin.getByRole("button", { name: /Generar y enviar invitación/ }).click();
  await admin.waitForURL(/msg=invitation_sent/);
  const inviteUrl = (await waitMail(recipientEmail, since, /(http\S+\/invite#t=[A-Za-z0-9_-]+)/))[1];

  // --- recipient: forwarded link with another e-mail gets nowhere
  const other = await browser.newContext({ locale: "es-ES" });
  const op = await other.newPage();
  await op.goto(inviteUrl);
  await op.getByLabel("Correo electrónico").fill(`forwarded-${stamp}@example.test`);
  await op.getByRole("button", { name: "Enviar código" }).click();
  await op.waitForURL(/\/access\/verify/);
  await op.getByLabel("Código de 6 dígitos").fill("123456");
  await op.getByRole("button", { name: "Verificar" }).click();
  await expect(op.getByRole("alert")).toBeVisible();
  expect((await q("SELECT count(*)::int n FROM dev_outbox WHERE \"to\" = $1", [`forwarded-${stamp}@example.test`]))[0].n).toBe(0);
  await other.close();

  // --- recipient: real flow
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
  const rp = await ctx.newPage();
  await rp.goto(inviteUrl);
  await expect(rp).toHaveURL(/\/invite$/); // token removed from the address bar
  await shot(rp, "06-recipient-invite");
  const since2 = new Date(Date.now() - 1000);
  await rp.getByLabel("Correo electrónico").fill(recipientEmail);
  await rp.getByRole("button", { name: "Enviar código" }).click();
  await rp.waitForURL(/\/access\/verify/);
  const code = (await waitMail(recipientEmail, since2, /código de verificación es: (\d{6})/))[1];
  // no confidential content before acceptance
  expect((await rp.request.get(`/api/view/page?d=${docId}&v=00000000-0000-4000-8000-000000000000&p=1`)).status()).toBe(404);
  await rp.getByLabel("Código de 6 dígitos").fill(code);
  await rp.getByRole("button", { name: "Verificar" }).click();
  await rp.waitForURL(/\/onboarding/);
  const versionId = (await q<{ id: string }>("SELECT current_published_version_id id FROM documents WHERE id = $1", [docId]))[0].id;
  expect((await rp.request.get(`/api/view/page?d=${docId}&v=${versionId}&p=1`)).status()).toBe(404); // session but no NDA → nothing
  await rp.getByLabel(/Nombre y apellidos/).fill("Ana Prueba E2E");
  await rp.getByLabel(/Empresa/).fill("Fondo de Prueba SL");
  await shot(rp, "07-recipient-onboarding");
  const accept = rp.getByRole("button", { name: "Aceptar y acceder" });
  await expect(accept).toBeDisabled();
  await rp.getByLabel("Legal texts").evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
  await rp.getByRole("checkbox", { name: /He leído íntegramente/ }).check();
  await accept.click();
  await rp.waitForURL(/\/room$/);
  await shot(rp, "08-recipient-room");
  await rp.getByRole("link", { name: docTitle }).click();
  await expect(rp.getByAltText("Página 1")).toBeVisible();
  await rp.mouse.move(300, 300); await rp.waitForTimeout(16_000); await rp.mouse.move(320, 320); await rp.waitForTimeout(16_000);
  await shot(rp, "09-recipient-viewer");
  await rp.getByRole("button", { name: "Ampliar" }).click(); await rp.getByRole("button", { name: "Ampliar" }).click();
  await rp.waitForTimeout(500); await shot(rp, "09b-viewer-zoom");
  await rp.getByRole("button", { name: "Pantalla completa" }).click(); await rp.waitForTimeout(800);
  await rp.screenshot({ path: `${SHOTS}/09c-viewer-fullscreen.png` });
  await rp.evaluate(() => document.exitFullscreen()); await rp.waitForTimeout(500);
  await rp.setViewportSize({ width: 390, height: 844 }); await rp.reload(); await expect(rp.getByAltText("Página 1")).toBeVisible();
  await rp.waitForTimeout(800); await shot(rp, "09d-viewer-mobile");
  await rp.setViewportSize({ width: 1280, height: 900 });
  const dl = await rp.request.get(`/api/view/download?d=${docId}&v=${versionId}&kind=wm`);
  expect(dl.status()).toBe(200);
  expect((await rp.request.get(`/api/view/download?d=${docId}&v=${versionId}&kind=original`)).status()).toBe(404);
  await rp.goto("/room/qa");
  await rp.getByLabel("Asunto").fill("Pregunta e2e");
  await rp.getByLabel("Pregunta", { exact: true }).fill("¿Cuál es la fecha de referencia?");
  await rp.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(rp.getByText("Pregunta e2e")).toBeVisible();

  // --- admin sees activity; then revokes
  await admin.goto(`/admin/activity?recipientId=${recipientId}`);
  await shot(admin, "10-admin-activity");
  const s = (await q<{ sessions: number; opens: number; active: number }>(`SELECT
    (SELECT count(*)::int FROM activity_events WHERE recipient_id = $1 AND kind = 'session_start') sessions,
    (SELECT count(*)::int FROM activity_events WHERE recipient_id = $1 AND kind = 'document_open') opens,
    (SELECT coalesce(sum(active_ms),0)::int FROM view_sessions WHERE recipient_id = $1) active`, [recipientId]))[0];
  expect(s.sessions).toBe(1); expect(s.opens).toBe(2); /* desktop + mobile reload */ expect(s.active).toBeGreaterThan(0);
  await admin.goto(`/admin/recipients/${recipientId}`);
  await admin.getByPlaceholder("Motivo").fill("fin e2e");
  await admin.getByRole("button", { name: /Revocar acceso/ }).click();
  await admin.waitForURL(/msg=revoke/);
  await rp.goto("/room");
  await expect(rp).toHaveURL(/\/access/);
  expect((await rp.request.get(`/api/view/page?d=${docId}&v=${versionId}&p=1`)).status()).toBe(404);
});
