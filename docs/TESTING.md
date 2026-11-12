# Pruebas ejecutadas y resultados

Fecha de ejecución: 2026-11-11 (entorno local de este repositorio). Comando completo: `scripts/test-all.sh`.

| Suite | Resultado |
|---|---|
| Vitest (unitarias + integración, BD `dataroom_test` real, LibreOffice/poppler/Tesseract reales en sandbox) | **52 / 52 superadas** |
| — incluye driver S3 contra servidor S3 compatible (moto) | superada (requiere `S3_TEST_ENDPOINT`; se omite si no está) |
| — incluye cliente clamd contra clamd real con firma de prueba EICAR | superada (requiere `CLAMD_TEST_PORT`; se omite si no está) |
| Playwright contra **build de producción** (`next start`, CSP estricta) | **5 / 5 superadas** |
| TypeScript (`tsc --noEmit`) y ESLint | sin errores |

Las salidas completas de la última ejecución están en `.local/vitest-results.txt` y `.local/e2e-results.txt`; las capturas del recorrido en `test-results/screens/`.

## Correspondencia con los 18 requisitos

| # | Requisito | Dónde se prueba |
|---|---|---|
| 1 | Sin sesión no hay acceso a archivos | `e2e/security.spec.ts` «REQ1» (10 rutas de contenido/exportación → 404; páginas privadas → redirección; almacenamiento y `.env` no accesibles por web) |
| 2 | Un enlace reenviado no evita verificar el correo | `integration/access.test.ts` «REQ2»; `e2e/walkthrough` (correo distinto → ningún correo enviado, código rechazado) |
| 3 | Códigos: caducidad, uso único, límite de intentos | `access.test.ts` «REQ3» (hash en BD, rotación invalida el anterior, 5 intentos, uso único, caducidad) + limitación por dirección |
| 4 | Sin acceso confidencial antes de aceptar el NDA | `legal.test.ts` «REQ4»; `e2e/walkthrough` (con sesión válida pero sin aceptación → 404 en página de documento) |
| 5 | Se conserva la versión exacta aceptada | `legal.test.ts` «REQ5» ×3 (texto y hash exactos, IP, hora servidor, representación; UPDATE/DELETE bloqueados incluso en modo retención; cambio material exige re-aceptación y conserva la anterior; cadena verificada) |
| 6 | Cambiar identificadores no da acceso ajeno | `permissions.test.ts` «REQ6» (otro documento, versión de otro documento, par intercambiado, malformado, inexistente) |
| 7 | Restricciones individuales prevalecen sobre el grupo | `permissions.test.ts` «REQ7» (deny de consulta y deny solo de descarga; un allow individual no anula un deny) |
| 8 | Documentos ocultos no filtran metadatos | `permissions.test.ts` «REQ8» (listado, error idéntico a inexistente en Q&A, título no expuesto en preguntas vinculadas) |
| 9 | Nuevas versiones privadas hasta aprobarse | `permissions.test.ts` «REQ9» + puerta en BD (SQL directo bloqueado, re-publicar sustituida bloqueado, datos de pacientes bloqueados) |
| 10 | Marcas corresponden al destinatario | `delivery.test.ts` «REQ10» (OCR de los píxeles incrustados: contiene el identificador propio, no el ajeno) |
| 11 | Cachés no mezclan usuarios | `delivery.test.ts` «REQ11» (hashes distintos por destinatario, una entrada por destinatario, prefijo de almacenamiento por destinatario, previsualización separada) |
| 12 | La consulta no entrega originales | `delivery.test.ts` «REQ12» (PNG, sin bytes del original; descarga con marca sin capa de texto original) + `e2e` (original → 404 sin permiso) |
| 13 | Copias expurgadas sin datos eliminados | `redaction.test.ts` (rectángulo negro sobre texto detectado, metadatos, OCR, comentarios de Office; copia limpia pasa pero exige atestación para publicar; términos no almacenados) |
| 14 | Tiempo activo pausa inactividad y evita duplicados | `activity.test.ts` (función pura + BD: inactividad, pestaña oculta, reintentos idempotentes, dos pestañas sin doble cómputo, tope tras desconexión, latido ajeno rechazado) |
| 15 | Bots y previsualizaciones no inflan visitas | `activity.test.ts` «REQ15»; `e2e/walkthrough` (vista como destinatario → 0 eventos) |
| 16 | La revocación bloquea nuevos accesos | `access.test.ts` «REQ16» (sesiones cerradas, sin nuevos códigos, invitación revocada); `e2e` (tras revocar, `/room` → acceso y contenido → 404) |
| 17 | Notas internas y preguntas de otros grupos privadas | `qa.test.ts` «REQ17» (notas nunca visibles, borradores invisibles hasta publicar, compartir con grupo solo por acción explícita, otro grupo no ve nada) |
| 18 | Restaurar copia en entorno de prueba | `zz-backup.test.ts` «REQ18» (copia → restauración en BD/almacenamiento aislados → recuentos, SHA-256 de cada fichero y cadena de aceptaciones verificados) |

Otras pruebas: validación de cargas (extensión, tipo real, macros, tamaño), nombres saneados, redirecciones abiertas, claves de almacenamiento, inyección CSV, escape de SVG de la marca, cabeceras de seguridad, CSRF, endpoints OTP de la librería no expuestos, fallo de conversión bloquea la publicación, recorrido completo con capturas en escritorio, zoom, pantalla completa y móvil.

## Defectos encontrados y corregidos durante las pruebas
- **CSP bloqueaba todo el JavaScript en producción** (páginas prerenderizadas sin nonce); solo se manifestaba con el build de producción. Corregido forzando renderizado por petición (`connection()` en el layout raíz).
- **Doble registro de apertura** de documento por la doble ejecución de efectos en desarrollo. Corregido memorizando la petición.
- **Token de invitación perdido** al ejecutarse dos veces el efecto que lo lee y lo borra de la URL. Corregido.
- **Solapamiento de líneas de la marca** con nombres/correos largos. Espaciado ahora derivado de la longitud del texto.
- Formato de fecha inválido en el correo de invitación (`Intl` con opciones incompatibles). Corregido.

## No probado / probado parcialmente
- Antivirus con **firmas oficiales** (no descargables en este entorno): solo se probó el protocolo con una firma EICAR de prueba.
- Envío **SMTP real** (por diseño no se envía nada; el transporte SMTP está implementado pero no ejecutado).
- Rendimiento con documentos grandes (cientos de páginas) y concurrencia alta.
- Fidelidad de conversión con documentos reales de Rethink Medical (no se aportaron documentos).
- Navegadores distintos de Chromium; lectores de pantalla.
