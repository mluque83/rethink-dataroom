# Arquitectura y modelo de permisos

## 1. Componentes

```
Navegador ──HTTPS──► Next.js 16 (proceso web, Node)
                       │  proxy.ts: CSP con nonce por petición, Cache-Control: no-store
                       │  Server Components / Server Actions / Route Handlers
                       │  Better Auth (sesiones en BD, OTP por correo, TOTP admin)
                       ├──► PostgreSQL 16 (datos, permisos, auditoría, cola pg-boss)
                       └──► Almacenamiento privado (S3 compatible / disco local solo dev)
Trabajador (proceso aparte: npm run worker)
   pg-boss ► antivirus (clamd) ► validación ► bubblewrap(sin red)+prlimit:
             LibreOffice → PDF │ poppler → páginas PNG │ pdftotext → fidelidad
```

- **Nada se sirve desde `/public`** salvo el favicon. Todo byte de documento pasa por un *route handler* que vuelve a comprobar sesión, aceptación y permisos efectivos. No se emiten URL prefirmadas (vigencia máxima de enlaces temporales de almacenamiento: **0**, no existen). El único enlace temporal es la invitación (configurable, 14 días por defecto) y por sí solo no da acceso.
- **Visor**: el navegador solo recibe PNG de cada página con la marca **incrustada en servidor** (sharp). No hay PDF ni original en el navegador para usuarios de solo consulta. No hay precarga de páginas (para que «páginas servidas» no se infle).
- **Descarga con marca**: PDF compuesto por las páginas rasterizadas con marca (aplanada). **Original**: capacidad independiente, desactivada por defecto, auditada.
- **Cachés derivadas**: clave única `(destinatario, versión, hash de marca, tipo, página)` y clave de almacenamiento `derived/<destinatario>/<versión>/<hash>/...`. Respuestas `Cache-Control: private, no-store`.

### Estructura de código
| Ruta | Contenido |
|---|---|
| `src/server/db/schema.ts` | Modelo de datos (Drizzle) |
| `migrations/` | SQL versionado: `0000` tablas/índices/CHECK; `0001` triggers de integridad y puerta de publicación; `0002` cadena de hash de aceptaciones |
| `src/server/permissions.ts` | Motor de autorización (función pura `evaluate` + cargadores) |
| `src/server/authz.ts`, `recipient-state.ts` | Puertas de sesión de admin y destinatario |
| `src/server/access.ts` | Invitación → OTP → sesión |
| `src/server/legal.ts` | Composición del texto mostrado y aceptación |
| `src/server/documents/*` | Validación, antivirus, sandbox, conversión, marca, entrega, expurgación, biblioteca |
| `src/server/activity.ts`, `analytics.ts` | Eventos, tiempo activo, métricas |
| `src/app/(public)`, `onboarding`, `room` | UI del destinatario |
| `src/app/admin` | UI de administración |
| `src/app/api/*` | Contenido (páginas, descargas, latidos), previsualización, exportaciones |

## 2. Modelo de datos (entidades principales)

- **Identidad**: `user` (rol `admin`|`recipient`, CHECK), `session`, `account`, `verification` (OTP con hash), `two_factor`.
- **Destinatarios**: `organizations`, `groups`, `group_members`, `recipients` (correo normalizado único, `access_code` no secreto para la marca, NDA aplicable, ventana de acceso, interruptores de descarga/Q&A, política de re-verificación), `identity_declarations` (append-only), `invitations` (solo `token_hash`).
- **Biblioteca**: `sections`, `folders` (jerarquía), `checklist_items` (pendiente / no aplica exigen justificación por CHECK), `documents` (metadatos, `kind` standard|redacted, `contains_patient_data`, `current_published_version_id`), `document_versions` (estados, antivirus, fidelidad, aprobación, publicación; índice único parcial «una publicada por documento»), `files` (blob con SHA-256), `page_renders`, `derived_cache`, `redaction_checks`, `import_batches`.
- **Permisos**: `access_profiles` (plantillas), `access_rules` (sujeto recipient|group × objetivo section|folder|document|version × allow|deny × capacidades; CHECK de coherencia).
- **Legal**: `legal_texts`, `legal_text_versions` (inmutables una vez activas; hash calculado por BD; una activa por texto), `acceptances` (append-only, encadenada).
- **Registro**: `audit_events` (acciones admin), `security_events` (OTP, enlaces, límites; correo/IP seudonimizados con HMAC), `activity_events` (actividad del destinatario confirmada por servidor), `view_sessions`, `heartbeats`, `activity_clock`.
- **Q&A**: `questions`, `answers` (borrador|publicada), `question_internal_notes`.
- **Otros**: `notifications`, `settings`, `rate_limits`, `dev_outbox` (solo desarrollo).

## 3. Autorización

### 3.1 Precedencia (inequívoca)
1. **Denegación por defecto**: sin regla `allow` aplicable no se ve nada.
2. **Puerta de publicación**: solo la versión vigente publicada; una versión sustituida solo con `allow` explícito a nivel de versión. Borradores, en revisión, aprobadas sin publicar, retiradas y documentos archivados: nunca.
3. Reglas aplicables = las del destinatario **y** de todos sus grupos, sobre la sección, cualquier carpeta antecesora, el documento o la versión.
4. `efectivo = ∪(capacidades allow) − ∪(capacidades deny)`. **Un deny siempre gana**, sea individual o de grupo y a cualquier nivel → las restricciones individuales prevalecen sobre permisos heredados. (Consecuencia documentada: un deny de grupo tampoco se puede anular con un allow individual; hay que sacar a la persona del grupo o quitar la regla.)
5. Descargas: además requieren el interruptor del destinatario. Original ≠ copia con marca. Toda capacidad requiere consulta.
6. Se evalúa **en servidor en cada petición** de contenido; la UI nunca es la fuente de autorización.
7. Fallo → **404 genérico** idéntico para «no existe», «no permitido» y «sin sesión». Los listados, búsquedas, Q&A, adjuntos de respuestas y exportaciones del destinatario se construyen solo desde `visibleDocuments()`. Las referencias DOC-xxxxx (correlativas) solo se muestran al administrador.

### 3.2 Matriz de autorización

| Recurso / acción | Anónimo | Destinatario sin aceptación | Destinatario con aceptación | Admin sin MFA | Admin con MFA |
|---|---|---|---|---|---|
| `/access`, `/invite` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/onboarding`, texto del acuerdo vigente | ✗ | ✔ | → `/room` | ✗ | ✗ |
| `/room`, listado, búsqueda | ✗ | ✗ | ✔ solo visibles | ✗ | ✗ |
| Página de documento (`/api/view/page`) | 404 | 404 | ✔ si `view` | 404 | 404 |
| Descarga con marca | 404 | 404 | ✔ si regla + interruptor | 404 | 404 |
| Descarga original | 404 | 404 | ✔ si regla original + interruptor | 404 | 404 |
| Latido / apertura de visor | 404 | 404 | ✔ (Origin propio) | 404 | 404 |
| Q&A propio | ✗ | ✗ | ✔ si habilitado | ✗ | ✗ |
| Copia de su acuerdo aceptado | 404 | 404 | ✔ | 404 | 404 |
| `/admin/*` | → login | → login | → login | solo `/admin/mfa` | ✔ |
| Previsualización «ver como», exportaciones, renders internos | 404 | 404 | 404 | 404 | ✔ |
| Endpoints HTTP de OTP de la librería de auth | 404 | 404 | 404 | 404 | 404 |

## 4. Transiciones de estado

**Invitación**: `created` → `sent` → `verified` (primer OTP correcto) · `created|sent` → `superseded` (nueva invitación) · → `expired` (al usarse caducada) · → `revoked` (revocación del destinatario). Abrir el enlace no cambia el estado.

**Destinatario**: `draft` → `invited` (primera invitación) → `active` (primer OTP correcto) · cualquiera → `revoked` (cierra sesiones e invitaciones) → `invited` (restablecer; exige nueva invitación). El acceso se bloquea también fuera de `[access_starts_at, access_expires_at)`.

**Versión de documento**: `uploaded` → `processing` → `in_review` | `conversion_failed` · `in_review` → `approved` → `published` (trigger: aprobada, antivirus limpio o liberación dev auditada, render válido, fidelidad ok o confirmada, sin datos de pacientes, expurgación aprobada y atestada si es copia) · `published` → `superseded` (al publicar otra) · `published|superseded` → `withdrawn` · `in_review|approved|conversion_failed` → `rejected`. Una versión sustituida no puede volver a publicarse sin pasar de nuevo por aprobación.

**Aceptación**: el destinatario está en etapa `onboarding` hasta tener una aceptación que cubra las versiones activas de NDA, condiciones y aviso de privacidad. Una nueva versión activa con `requires_reacceptance` invalida la aceptación previa (sin borrarla) → vuelve a `onboarding`.

**Texto legal**: `draft` → `active` → `retired` (inmutable al activarse; `legal_review_status` independiente: `pending_legal_review` | `legal_reviewed`).

## 5. Aceptación y evidencia
El texto mostrado se compone en servidor (`composeAgreementText`) y es exactamente el que se guarda (`displayed_text` + SHA-256). El formulario envía el hash de lo que mostró; si los textos cambiaron mientras se leían, se rechaza. El trigger fija `accepted_at = now()` (reloj del servidor), verifica el hash y encadena `record_hash = SHA-256(prev | campos)`. `UPDATE/DELETE/TRUNCATE` bloqueados por trigger, incluso en modo retención. **Limitación**: un superusuario de BD podría desactivar triggers y reescribir la cadena entera; la exportación periódica y su custodia externa aportan la garantía adicional.

## 6. Tiempo activo (método)
Latido cada 15 s mientras la pestaña está visible. `active` = interacción (puntero/scroll/tecla/toque, solo marcas de tiempo; no se registran teclas) en el umbral de inactividad (60 s) **y** sin ocultación desde el latido anterior. Al ocultarse y al volver se envían latidos que no acreditan. Servidor: `crédito = clamp(ahora − max(último latido de ese visor, reloj acreditado del destinatario), 0, 30 s)`; idempotente por `(visor, seq)`; el reloj por destinatario impide acreditar el mismo segundo dos veces entre pestañas/documentos; un cierre abrupto acredita como máximo un intervalo. Es una **señal del navegador** (puede perderse o manipularse) y se presenta como estimación.

## 7. Controles de seguridad (resumen)
| Control | Implementación |
|---|---|
| Sesiones | Better Auth, cookie HttpOnly, SameSite=Lax, Secure en producción, sin caché de cookie (revocación inmediata), re-verificación configurable por destinatario |
| MFA admin | TOTP obligatorio (sin MFA solo se accede a la página de alta) |
| OTP | 6 dígitos, 10 min, hash en BD, 5 intentos, rotación invalida el anterior, espera de 45 s, límites por correo/IP/token |
| Enumeración | Respuestas y flujo idénticos para correos registrados o no; envío en segundo plano |
| Redirecciones | Solo rutas relativas del mismo origen (`safeRedirectPath`) |
| CSRF | Server Actions (comprobación de Origin de Next) + Origin propio en POST JSON + SameSite |
| Cabeceras | CSP con nonce y `strict-dynamic`, `frame-ancestors 'none'`, `no-referrer`, nosniff, COOP/CORP, HSTS en producción, `noindex` |
| Cargas | Lista blanca de extensión + tipo real por firma, sin macros/ActiveX, anti zip-bomb, límite de tamaño y cuota, nombres saneados (solo display), claves de almacenamiento generadas por servidor |
| Conversión | Proceso aparte, bubblewrap sin red, sistema de ficheros de solo lectura, prlimit (memoria/CPU/ficheros/procesos), timeout, macros deshabilitadas en el perfil de LibreOffice |
| Antivirus | clamd INSTREAM; sin escáner → cuarentena no publicable |
| Secretos | Solo variables de entorno; `.env.local` modo 600 y fuera de git; nunca en logs; correos/IP seudonimizados en registros de seguridad |
| Integridad | CHECK, índices únicos parciales, FKs RESTRICT, triggers append-only, puerta de publicación en BD |
