export type Locale = "es" | "en";

const es = {
  brand: "Rethink Medical",
  brandSub: "Data room confidencial",
  provisionalIdentity: "Información confidencial — uso restringido a destinatarios autorizados",
  common: {
    save: "Guardar", cancel: "Cancelar", back: "Volver", continue: "Continuar", search: "Buscar", export: "Exportar CSV",
    yes: "Sí", no: "No", none: "Ninguno", actions: "Acciones", status: "Estado", date: "Fecha", logout: "Cerrar sesión",
    language: "Idioma", tzNote: "Fechas en hora de", notFound: "No encontrado", demo: "DEMO",
  },
  access: {
    title: "Acceso al data room",
    intro: "Introduce el correo electrónico al que recibiste la invitación. Te enviaremos un código de un solo uso.",
    email: "Correo electrónico", sendCode: "Enviar código",
    generic: "Si la dirección está autorizada, recibirás un código en unos instantes. Revisa también la carpeta de correo no deseado.",
    codeTitle: "Introduce el código", code: "Código de 6 dígitos", verify: "Verificar",
    codeHelp: "El código caduca en 10 minutos, solo puede usarse una vez y admite un número limitado de intentos. Solicitar uno nuevo anula el anterior.",
    invalid: "Código incorrecto o caducado. Puedes solicitar uno nuevo.",
    throttled: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
    resend: "Solicitar un nuevo código",
    mailboxNote: "Verificar el código acredita el control de este buzón de correo. No acredita la identidad física de la persona ni impide técnicamente que alguien comparta sus credenciales (compartirlas está prohibido).",
    inviteTitle: "Invitación personal",
    inviteIntro: "Esta invitación es personal. Para continuar, escribe el correo electrónico al que se dirigió. Abrir este enlace no concede acceso por sí solo.",
    inviteMissing: "El enlace no contiene una invitación válida. Usa el enlace completo recibido por correo o solicita una nueva invitación.",
    reasons: {
      no_session: "", not_recipient: "Esta cuenta no tiene acceso de destinatario.", revoked: "El acceso no está disponible.",
      not_started: "Tu acceso todavía no ha comenzado.", expired: "Tu acceso ha caducado.", session_too_old: "Tu sesión ha caducado. Verifica de nuevo tu correo.",
    } as Record<string, string>,
    trackingNotice: "Aviso: este data room registra los accesos, los documentos y versiones consultados, las páginas mostradas, las descargas y una estimación del tiempo activo. Detalles en el aviso de privacidad que se muestra antes de acceder.",
  },
  onboarding: {
    title: "Identificación y condiciones",
    intro: "Antes de acceder a cualquier información confidencial debes identificarte y leer y aceptar las condiciones de uso y el acuerdo de confidencialidad.",
    verifiedEmail: "Correo verificado", fullName: "Nombre y apellidos", company: "Empresa (si corresponde)", position: "Cargo (si corresponde)",
    capacity: "Acepto", personal: "A título personal", onBehalf: "En nombre de una entidad",
    entity: "Entidad representada", authority: "Declaro bajo mi responsabilidad que tengo facultades suficientes para obligar a esta entidad. Entiendo que Rethink Medical no las presume y puede solicitar su acreditación.",
    readAll: "Lee los textos completos (desplázate hasta el final):",
    privacyHeading: "Tratamiento de datos y registro de actividad",
    privacySeparate: "Aceptar el NDA no equivale a consentir cualquier tratamiento de datos. El aviso de privacidad explica las finalidades y bases jurídicas por separado.",
    download: "Descargar estos textos",
    changed: "Los textos han cambiado mientras los leías. Revisa la versión actual.",
    draftWarning: "Atención: textos en BORRADOR pendientes de revisión jurídica.",
    reaccept: "Las condiciones o el NDA se han actualizado con cambios materiales. Debes aceptarlos de nuevo antes de continuar.",
  },
  room: {
    title: "Documentación", empty: "No hay documentos disponibles para ti en este momento.", search: "Buscar por título",
    version: "Versión", docDate: "Fecha del documento", published: "Publicado", open: "Abrir", qa: "Preguntas", agreement: "Mi acuerdo aceptado",
    privacy: "Privacidad", olderVersions: "Versiones anteriores autorizadas", product: "Producto", confidentiality: "Confidencialidad",
    validity: "Vigencia", previewBanner: "PREVISUALIZACIÓN ADMINISTRATIVA — viendo como", previewNote: "No se registra actividad del destinatario.",
  },
  viewer: {
    page: "Página", of: "de", prev: "Anterior", next: "Siguiente", fit: "Ajustar ancho", zoomIn: "Ampliar", zoomOut: "Reducir",
    fullscreen: "Pantalla completa", downloadWm: "Descargar copia con marca de agua", downloadOriginal: "Descargar original",
    watermarkNote: "Documento con marca de agua personalizada. La marca disuade y ayuda a atribuir el origen, pero no impide fotografiar ni copiar.",
    trackingNote: "Se registra la apertura, las páginas mostradas y el tiempo activo estimado (solo con la pestaña visible y actividad reciente).",
  },
  qa: {
    title: "Preguntas y respuestas", ask: "Formular una pregunta", subject: "Asunto", body: "Pregunta", relatedDoc: "Documento relacionado (opcional)",
    submit: "Enviar pregunta", private: "Tus preguntas son privadas entre tú y Rethink Medical.", answer: "Respuesta", pending: "Pendiente de respuesta",
    disabled: "Las preguntas no están habilitadas para tu acceso.", none: "Aún no has formulado preguntas.",
    statuses: { open: "Abierta", in_progress: "En curso", answered: "Respondida", closed: "Cerrada" } as Record<string, string>,
  },
  admin: {
    nav: { dashboard: "Panel", library: "Biblioteca", checklist: "Pendientes", recipients: "Destinatarios", groups: "Grupos", profiles: "Perfiles",
      legal: "Condiciones y NDA", activity: "Actividad", audit: "Auditoría", qa: "Q&A", settings: "Configuración", importer: "Importación", metrics: "Definición de métricas" },
  },
};

type Dict = typeof es;

const en: Dict = {
  brand: "Rethink Medical",
  brandSub: "Confidential data room",
  provisionalIdentity: "Confidential information — restricted to authorised recipients",
  common: {
    save: "Save", cancel: "Cancel", back: "Back", continue: "Continue", search: "Search", export: "Export CSV",
    yes: "Yes", no: "No", none: "None", actions: "Actions", status: "Status", date: "Date", logout: "Sign out",
    language: "Language", tzNote: "Times shown in", notFound: "Not found", demo: "DEMO",
  },
  access: {
    title: "Data room access",
    intro: "Enter the e-mail address your invitation was sent to. We will send you a one-time code.",
    email: "E-mail address", sendCode: "Send code",
    generic: "If the address is authorised, you will receive a code shortly. Please also check your spam folder.",
    codeTitle: "Enter the code", code: "6-digit code", verify: "Verify",
    codeHelp: "The code expires in 10 minutes, can be used once and allows a limited number of attempts. Requesting a new one cancels the previous one.",
    invalid: "Incorrect or expired code. You can request a new one.",
    throttled: "Too many attempts. Please wait a few minutes and try again.",
    resend: "Request a new code",
    mailboxNote: "Verifying the code proves control of this mailbox. It does not prove the person's physical identity nor technically prevent credential sharing (sharing is prohibited).",
    inviteTitle: "Personal invitation",
    inviteIntro: "This invitation is personal. To continue, type the e-mail address it was sent to. Opening this link does not grant access by itself.",
    inviteMissing: "The link does not contain a valid invitation. Use the full link from the e-mail or ask for a new invitation.",
    reasons: {
      no_session: "", not_recipient: "This account has no recipient access.", revoked: "Access is not available.",
      not_started: "Your access has not started yet.", expired: "Your access has expired.", session_too_old: "Your session expired. Please verify your e-mail again.",
    },
    trackingNotice: "Notice: this data room logs access, documents and versions opened, pages displayed, downloads and an estimate of active time. See the privacy notice shown before access.",
  },
  onboarding: {
    title: "Identification and terms",
    intro: "Before accessing any confidential information you must identify yourself and read and accept the terms of use and the non-disclosure agreement.",
    verifiedEmail: "Verified e-mail", fullName: "Full name", company: "Company (if applicable)", position: "Position (if applicable)",
    capacity: "I accept", personal: "In a personal capacity", onBehalf: "On behalf of an entity",
    entity: "Represented entity", authority: "I declare under my responsibility that I have sufficient authority to bind this entity. I understand Rethink Medical does not presume it and may request evidence.",
    readAll: "Read the full texts (scroll to the end):",
    privacyHeading: "Data processing and activity logging",
    privacySeparate: "Accepting the NDA is not consent to any data processing. The privacy notice explains purposes and legal bases separately.",
    download: "Download these texts",
    changed: "The texts changed while you were reading them. Please review the current version.",
    draftWarning: "Attention: DRAFT texts pending legal review.",
    reaccept: "The terms or NDA have been materially updated. You must accept them again before continuing.",
  },
  room: {
    title: "Documents", empty: "No documents are available to you at the moment.", search: "Search by title",
    version: "Version", docDate: "Document date", published: "Published", open: "Open", qa: "Questions", agreement: "My accepted agreement",
    privacy: "Privacy", olderVersions: "Authorised earlier versions", product: "Product", confidentiality: "Confidentiality",
    validity: "Validity", previewBanner: "ADMIN PREVIEW — viewing as", previewNote: "No recipient activity is recorded.",
  },
  viewer: {
    page: "Page", of: "of", prev: "Previous", next: "Next", fit: "Fit width", zoomIn: "Zoom in", zoomOut: "Zoom out",
    fullscreen: "Full screen", downloadWm: "Download watermarked copy", downloadOriginal: "Download original",
    watermarkNote: "Personalised watermark. It deters disclosure and helps attribution, but cannot prevent photographs or copying.",
    trackingNote: "Opening, pages displayed and estimated active time are recorded (only while the tab is visible and with recent activity).",
  },
  qa: {
    title: "Questions & answers", ask: "Ask a question", subject: "Subject", body: "Question", relatedDoc: "Related document (optional)",
    submit: "Send question", private: "Your questions are private between you and Rethink Medical.", answer: "Answer", pending: "Awaiting answer",
    disabled: "Questions are not enabled for your access.", none: "You have not asked any questions yet.",
    statuses: { open: "Open", in_progress: "In progress", answered: "Answered", closed: "Closed" },
  },
  admin: {
    nav: { dashboard: "Dashboard", library: "Library", checklist: "Pending items", recipients: "Recipients", groups: "Groups", profiles: "Profiles",
      legal: "Terms & NDA", activity: "Activity", audit: "Audit", qa: "Q&A", settings: "Settings", importer: "Import", metrics: "Metric definitions" },
  },
};

export const dictionaries: Record<Locale, Dict> = { es, en };
export const dict = (l: Locale) => dictionaries[l] ?? es;
