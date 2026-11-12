// Base structure (NOT demo data). Categories and checklist items are editable
// in the admin UI. A checklist item does not imply that the document exists or
// is mandatory: each can be marked "pending" or "not applicable" with justification.
export const SECTIONS: { code: string; es: string; en: string; items: string[] }[] = [
  { code: "00", es: "Start Here", en: "Start Here", items: ["Presentación de la empresa", "Índice documental", "Instrucciones de navegación", "Contactos", "Resumen del proceso"] },
  { code: "01", es: "Corporate & Governance", en: "Corporate & Governance", items: ["Escrituras y estatutos", "Documentación registral", "Pactos de socios", "Actas y poderes", "Estructura societaria y titularidad real"] },
  { code: "02", es: "Cap Table & Financing", en: "Cap Table & Financing", items: ["Cap table con fecha de referencia", "Ampliaciones y acuerdos de inversión", "Préstamos e instrumentos convertibles", "Ayudas públicas y obligaciones asociadas", "Propuesta de ronda y uso de fondos"] },
  { code: "03", es: "Financials & Tax", en: "Financials & Tax", items: ["Cuentas anuales", "Estados de gestión", "Tesorería", "Modelo financiero y supuestos", "Deuda y calendario de pagos", "Documentación fiscal"] },
  { code: "04", es: "Product & Technology", en: "Product & Technology", items: ["T-Control®", "T-Control® Easy In", "Especificaciones y versiones", "Verificaciones y validaciones", "Hoja de ruta"] },
  { code: "05", es: "Regulatory & Quality", en: "Regulatory & Quality", items: ["Certificados y alcance", "Declaraciones de conformidad", "Situación por producto y mercado", "Sistema de calidad", "Auditorías", "Gestión de riesgos", "Vigilancia y acciones correctivas", "Etiquetado e instrucciones de uso"] },
  { code: "06", es: "Clinical & Scientific", en: "Clinical & Scientific", items: ["Protocolos y autorizaciones", "Estudios en curso y finalizados", "Informes y publicaciones", "Evidencia preclínica", "Limitaciones de la evidencia"] },
  { code: "07", es: "Intellectual Property", en: "Intellectual Property", items: ["Patentes por familia y jurisdicción", "Estado documental de solicitudes y concesiones", "Marcas", "Titularidad y cesiones", "Licencias", "Informes de libertad de operación, si existen"] },
  { code: "08", es: "Manufacturing & Supply Chain", en: "Manufacturing & Supply Chain", items: ["Fabricantes y proveedores críticos", "Contratos", "Capacidad y plazos", "Costes y supuestos", "Esterilización, controles y liberación", "Continuidad de suministro"] },
  { code: "09", es: "Commercial & Market", en: "Commercial & Market", items: ["Contratos comerciales y de distribución", "Ventas documentadas", "Pipeline (separado de ventas)", "Precios y condiciones", "Mercado y competencia con fuentes", "Estrategia comercial"] },
  { code: "10", es: "Team & HR", en: "Team & HR", items: ["Organigrama", "Perfiles", "Contratos relevantes", "Incentivos", "Compromisos de confidencialidad y propiedad intelectual"] },
  { code: "11", es: "Legal, Insurance & Compliance", en: "Legal, Insurance & Compliance", items: ["Contratos materiales", "Seguros", "Litigios y contingencias", "Privacidad", "Obligaciones relevantes"] },
  { code: "12", es: "Risks & Due Diligence Q&A", en: "Risks & Due Diligence Q&A", items: ["Registro de riesgos", "Preguntas y respuestas", "Solicitudes de documentación", "Incidencias y seguimiento"] },
];

type P = { code: string; view: boolean; downloadWatermarked?: boolean };
const v = (codes: string[], dl = false): P[] => codes.map((code) => ({ code, view: true, downloadWatermarked: dl }));

/** Reusable, editable TEMPLATES (proposals — adjust to the actual process). */
export const PROFILES = [
  { name: "Presentación inicial", description: "Solo 00 Start Here. Sin descargas ni Q&A.", definition: { sections: v(["00"]), qaEnabled: false } },
  { name: "Inversor en evaluación", description: "Visión general del negocio sin datos financieros detallados. Sin descargas. Q&A habilitado.",
    definition: { sections: v(["00", "01", "02", "04", "05", "06", "07", "09"]), qaEnabled: true } },
  { name: "Due diligence avanzada", description: "Todas las secciones. Descarga con marca de agua. Q&A.",
    definition: { sections: v(["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"], true), qaEnabled: true, allowWatermarkedDownloads: true } },
  { name: "Asesor financiero", description: "Societario, cap table, financiero, legal y riesgos. Descarga con marca de agua. Q&A.",
    definition: { sections: v(["00", "01", "02", "03", "11", "12"], true), qaEnabled: true, allowWatermarkedDownloads: true } },
  { name: "Asesor regulatorio", description: "Producto, regulatorio y calidad, clínico y fabricación. Q&A.",
    definition: { sections: v(["00", "04", "05", "06", "08"]), qaEnabled: true } },
];

export const LEGAL_TEXTS = [
  { kind: "nda", key: "nda-investor", title: "Acuerdo de confidencialidad (NDA) — inversores y asesores", file: "nda-es.md", language: "es" },
  { kind: "nda", key: "nda-investor-en", title: "Non-disclosure agreement (NDA) — investors and advisers", file: "nda-en.md", language: "en" },
  { kind: "terms", key: "terms", title: "Condiciones de uso", file: "terms-es.md", language: "es" },
  { kind: "terms", key: "terms-en", title: "Terms of use", file: "terms-en.md", language: "en" },
  { kind: "privacy_notice", key: "privacy", title: "Aviso de privacidad", file: "privacy-es.md", language: "es" },
  { kind: "privacy_notice", key: "privacy-en", title: "Privacy notice", file: "privacy-en.md", language: "en" },
] as const;
