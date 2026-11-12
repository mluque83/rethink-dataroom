# Data room — Rethink Medical S.L.

Data room privado para inversores, asesores y socios estratégicos: acceso individual por invitación y código de un solo uso, aceptación obligatoria de condiciones y NDA con evidencia, permisos por destinatario (denegación por defecto), visor con **marca de agua incrustada en servidor**, seguimiento de actividad con métricas definidas, Q&A privado, versiones, expurgación verificada, auditoría y copias verificables.

> **Estado: versión local revisable. NO publicada y sin invitaciones reales.** Textos legales en **borrador pendiente de revisión jurídica**. Ver [limitaciones](docs/LIMITATIONS.md) y [pendientes para producción](docs/PRODUCTION-CHECKLIST.md).

## Documentación
- [Arquitectura, modelo de datos, matriz de autorización y estados](docs/ARCHITECTURE.md)
- [Guía breve para administradores](docs/ADMIN-GUIDE.md)
- [Copias de seguridad y restauración](docs/BACKUP-RESTORE.md)
- [Despliegue en producción (dataroom.rethinkmedical.es)](docs/DEPLOYMENT.md)
- [Pruebas ejecutadas y resultados](docs/TESTING.md)
- [Limitaciones conocidas](docs/LIMITATIONS.md) · [Pendientes para producción](docs/PRODUCTION-CHECKLIST.md)
- [Seguimiento del trabajo (decisiones, avances, pendientes)](PROGRESS.md)
- Textos legales editables: `content/legal/*.md`
- Identidad: `public/brand/` (logotipo oficial extraído del Brandbook 2022), tokens en `src/app/globals.css`

## Requisitos
Node 22, PostgreSQL 16 (binarios), LibreOffice, poppler-utils, qpdf, libimage-exiftool-perl, tesseract-ocr (+spa, eng), bubblewrap. Opcional: clamav-daemon (con firmas oficiales), servidor S3 compatible.

```bash
sudo apt-get install -y libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress poppler-utils qpdf \
  libimage-exiftool-perl tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng bubblewrap clamav-daemon
```

## Puesta en marcha local
```bash
npm install
scripts/setup-local.sh            # PostgreSQL privado en ./.local + .env.local/.env.test.local con secretos aleatorios (modo 600)
npm run db:migrate
npm run db:seed                   # categorías, lista de pendientes, perfiles, borradores legales (sin datos de negocio)
npm run admin:create -- --email admin@ejemplo.local --name "Administrador"
#   contraseña de desarrollo en .local/dev-admin-credentials.txt (modo 600; nunca se imprime)
npm run db:seed:demo              # OPCIONAL: datos DEMO identificados (example.test) y activa los borradores legales
npm run dev                       # http://localhost:3000  (admin: /admin)
npm run worker                    # en otra terminal: procesado aislado de documentos
```
En desarrollo los correos (códigos e invitaciones) no salen de la máquina: se ven en **Admin → Buzón de desarrollo**.

## Scripts
| Script | Uso |
|---|---|
| `npm run dev` / `build` / `start` | Aplicación web |
| `npm run worker` | Trabajador de antivirus/conversión/renderizado |
| `npm run db:migrate` / `db:seed` / `db:seed:demo` | Migraciones, estructura base, datos demo |
| `npm run admin:create -- --email … [--password-stdin]` | Alta de administrador (TOTP obligatorio al entrar) |
| `npm run import:folder -- <dir> [--import]` | Inventario/importación de documentación existente a revisión |
| `npm run retention:apply [-- --dry-run]` | Política de conservación |
| `npm run backup` / `scripts/restore-test.sh <dir>` | Copia y restauración verificada |
| `npm test` · `npm run test:e2e` · `scripts/test-all.sh` | Pruebas (sobre `dataroom_test`, nunca sobre desarrollo) |
| `npm run typecheck` · `npm run lint` | Calidad |

## Configuración
Todas las variables están documentadas en [`.env.example`](.env.example) (sin secretos). Con `APP_ENV=production` la aplicación **se niega a arrancar** con almacenamiento local, correo de desarrollo, HTTP sin TLS, sandbox desactivado o sin cifrado en reposo en S3, y desactiva la liberación de archivos sin antivirus.

## Datos de demostración
Solo con `db:seed:demo`, nunca en producción. Marcados `is_demo` y etiquetados «DEMO» en la interfaz; destinatarios `@example.test`; documentos sintéticos que declaran no contener información de Rethink Medical. No se han creado documentos empresariales ficticios.
