// E-mail templates. They NEVER include confidential documents, titles of
// documents or data-room contents — only access instructions.
type L = "es" | "en";

export function otpMail(locale: L, code: string, minutes: number) {
  return locale === "en" ? {
    subject: "Your Rethink Medical data room verification code",
    text: `Your verification code is: ${code}\n\nIt expires in ${minutes} minutes and can be used once.\nIf you did not request it, ignore this message. Never share this code.\n\nVerifying the code proves control of this mailbox only.`,
  } : {
    subject: "Código de verificación — Data room Rethink Medical",
    text: `Tu código de verificación es: ${code}\n\nCaduca en ${minutes} minutos y solo puede usarse una vez.\nSi no lo has solicitado, ignora este mensaje. No compartas este código.\n\nVerificar el código acredita el control de este buzón, no la identidad de la persona.`,
  };
}

export function invitationMail(locale: L, p: { name: string; url: string; expiresAt: string }) {
  return locale === "en" ? {
    subject: "Invitation to the Rethink Medical data room",
    text: `Dear ${p.name},\n\nRethink Medical S.L. has invited you to a confidential data room.\n\nYour personal access link: ${p.url}\n\nThe link is personal and valid until ${p.expiresAt}. Access requires a one-time code sent to this address and acceptance of the confidentiality terms. Do not forward this message.\n\nRethink Medical S.L.`,
  } : {
    subject: "Invitación al data room de Rethink Medical",
    text: `Estimado/a ${p.name}:\n\nRethink Medical S.L. le ha invitado a un data room confidencial.\n\nSu enlace personal de acceso: ${p.url}\n\nEl enlace es personal y válido hasta ${p.expiresAt}. El acceso requiere un código de un solo uso enviado a esta dirección y la aceptación de las condiciones de confidencialidad. No reenvíe este mensaje.\n\nRethink Medical S.L.`,
  };
}

export function adminNotificationMail(kind: string, who: string, appUrl: string) {
  const labels: Record<string, string> = {
    first_visit: "Primera visita / First visit",
    nda_accepted: "NDA aceptado / NDA accepted",
    access_request: "Solicitud de acceso / Access request",
    question_created: "Nueva pregunta / New question",
  };
  return {
    subject: `[Data room] ${labels[kind] ?? kind}`,
    text: `${labels[kind] ?? kind}: ${who}\n\nDetalles en el panel de administración / Details in the admin panel: ${appUrl}/admin\n\n(Este correo no contiene información confidencial del data room.)`,
  };
}
