# PROGRESS — Rethink Medical data room

Archivo de seguimiento para continuar entre sesiones. Actualizar al cerrar cada bloque de trabajo.

## Estado actual (2026-11-11)
Fases 1-7 **implementadas y verificadas localmente**: 52/52 pruebas Vitest, 5/5 Playwright contra build de producción, tsc y ESLint limpios.
Recorrido completo admin → destinatario funcionando (ver `test-results/screens/`). Nada publicado ni enviado.

## Decisiones (con motivo) — todas reversibles salvo indicación
| # | Decisión | Motivo |
|---|---|---|
| D1 | Next.js 16 + TS, `cacheComponents` desactivado | Todo es privado y dinámico; evita cachés compartidas de contenido confidencial |
| D2 | PostgreSQL 16 + Drizzle; migraciones SQL versionadas en `migrations/` | Restricciones/índices/triggers en BD |
| D3 | Better Auth 1.7: email-OTP (destinatarios) y password+TOTP (admins) | Proveedor mantenido; sin auth propia |
| D4 | Endpoints HTTP de Better Auth filtrados por lista blanca (`src/app/api/auth/[...all]/route.ts`) | Los flujos OTP de destinatarios solo vía server actions que validan invitación/destinatario |
| D5 | Token de invitación en el fragmento `#t=` | No viaja al servidor en GET → no aparece en logs ni lo consumen escáneres |
| D6 | Almacenamiento: interfaz única, driver `s3` (producción) y `local` (solo desarrollo, rechazado en producción) | MinIO/Docker no disponibles en este entorno |
| D7 | Visor = páginas rasterizadas con marca de agua incrustada en servidor; nunca se envía el PDF/original a usuarios de solo consulta | Requisito de marca no-CSS y no entrega de originales |
| D8 | Descarga con marca = PDF rasterizado (marca aplanada) | Más difícil de quitar que una capa vectorial; pierde texto seleccionable (documentado) |
| D9 | Conversión en proceso trabajador separado (pg-boss) dentro de bubblewrap sin red + prlimit + timeout; macros deshabilitadas y ficheros con macros rechazados | Aislamiento |
| D10 | Antivirus: cliente clamd real. Sin escáner → `not_configured` = cuarentena; liberación manual solo en desarrollo y auditada | Firmas oficiales de ClamAV no descargables aquí |
| D11 | Modelo de permisos: deny siempre gana; descargas requieren además interruptor del destinatario | Precedencia inequívoca (individual > grupo) |
| D12 | Expurgación: NO editor in-app; se cargan copias expurgadas externas + verificación automática + atestación manual | No se puede garantizar un editor fiable |
| D13 | Aceptaciones: tabla append-only (trigger), hash encadenado calculado en BD, `accepted_at = now()` | Evidencia frente a modificaciones ordinarias (no garantía absoluta) |
| D14 | Textos legales: una versión activa por texto; inmutables tras activarse; `requires_reacceptance` marca cambio material | Re-aceptación antes de nuevos accesos |
| D15 | Términos/privacidad por idioma: claves `terms`/`terms-en`, `privacy`/`privacy-en` | NDA asignado por destinatario |
| D16 | Referencias DOC-00001 solo para admin | El correlativo revelaría documentos ocultos |
| D17 | Todas las rutas se renderizan por petición (`connection()` en layout raíz) | Nonce CSP y nada prerenderizado |
| D19 | Brandbook aplicado; naranja solo en superficies/botones con texto oscuro (contraste) | WCAG AA |
| D20 | Contenido documental y mapeos de importación SOLO en `.local/` (fuera de git) | El repositorio de código no debe contener información confidencial |
| D18 | Pruebas siempre contra `dataroom_test`; E2E contra build de producción en :3100 | No contaminar desarrollo; detectar fallos solo de producción |

## Entorno local
- `scripts/local-services.sh start` — PostgreSQL privado en `.local/pgdata`, 127.0.0.1:54329
- `scripts/setup-local.sh` — BD + `.env.local`/`.env.test.local` con secretos aleatorios (modo 600)
- `npm run db:migrate && npm run db:seed && npm run admin:create -- --email ... && npm run db:seed:demo`
- Contraseña admin de desarrollo: `.local/dev-admin-credentials.txt` (modo 600, git-ignored)
- Scripts de Node que usan `src/server/*` deben ejecutarse con `--conditions=react-server` (paquete `server-only`).
  No importar `next/navigation`/`next/headers` desde módulos usados por scripts: usar `recipient-state.ts`/`request.ts`.

## Pendientes
- Producción: `docs/PRODUCTION-CHECKLIST.md`. Limitaciones: `docs/LIMITATIONS.md`.
- Mejoras posibles: roles admin de solo lectura / doble aprobación; adjuntos propios en respuestas Q&A; contenido de admin traducido al inglés;
  render de Markdown de textos legales manteniendo identidad texto mostrado = texto guardado; rate limit de Better Auth en BD; trabajador en contenedor.
- **Subir a GitHub privado** (mluque83): pendiente de que el usuario cree el repositorio y conceda acceso a la app de Claude.

## Importación BV2026 (2026-11-12)
37 documentos (10 CV, 7 societarios/financiación/sellos, 20 PI) importados a revisión en la BD de desarrollo con `npm run import:mapped -- .local/import-maps/bv2026.json`.
Todos en `in_review`, antivirus `not_configured` (cuarentena). Nada publicado. 15 elementos de la lista de pendientes creados/actualizados con los huecos detectados.
El detalle de hallazgos NO se guarda en git (confidencial).

## Cómo verificar
`scripts/test-all.sh` (Vitest → build → servidor :3100 + worker sobre `dataroom_test` → Playwright).
Opcionales: `moto_server -p 5555` + `S3_TEST_ENDPOINT=http://127.0.0.1:5555`; clamd con firma EICAR de prueba (ver `.local/clamav-test/clamd.conf`) + `CLAMD_TEST_PORT=3311`.
Trampas conocidas: `vitest` reinicia `dataroom_test` (reiniciar después el worker de pruebas); un `next start` previo puede seguir ocupando el puerto.

## Registro
- 2026-11-11: inspección (directorio vacío), elección de stack, esquema + 3 migraciones, servicios backend, seed base y demo (conversión verificada en sandbox).
- 2026-11-11: UI admin/destinatario, rutas de contenido, previsualización, analítica, Q&A, expurgación, retención, importación, copias; pruebas 1-18; documentación.
  Defectos hallados y corregidos: CSP sin nonce en páginas prerenderizadas (prod), doble apertura en dev, token de invitación perdido en dev, solapamiento de la marca, formato Intl.
