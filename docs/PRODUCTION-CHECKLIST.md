# Requisitos pendientes para producción

No se ha publicado nada ni enviado invitaciones reales. Antes de producción:

## Decisiones y textos (Rethink Medical / asesoría)
- [ ] Revisión jurídica de NDA, condiciones y aviso de privacidad (completar todos los **[POR CONFIRMAR]**: NIF, domicilio, contactos, plazo de confidencialidad, ley y jurisdicción, proveedores, transferencias, plazos de conservación).
- [ ] Decidir si se exige firma electrónica cualificada/avanzada adicional para ciertos destinatarios.
- [ ] Revisar perfiles de acceso propuestos y las categorías/elementos esperados.
- [ ] Facilitar logotipo y colores oficiales.
- [ ] Definir responsables internos, plazos de respuesta Q&A y política de revocación.
- [ ] Registro de actividades de tratamiento / evaluación de impacto si procede (DPO).

## Infraestructura
- [ ] Hosting en la UE con TLS (HTTPS obligatorio; la app lo exige con `APP_ENV=production`), proxy inverso que fije `X-Forwarded-For` de forma fiable.
- [ ] PostgreSQL gestionado con cifrado en reposo, TLS (`sslmode=verify-full`), copias automáticas y PITR; usuario de aplicación sin privilegios de superusuario.
- [ ] Bucket S3 compatible **privado**: Block Public Access, cifrado por defecto (SSE-S3/KMS), versionado, sin políticas públicas, credenciales de mínimo privilegio (solo el bucket).
- [ ] ClamAV (`clamd`) con `freshclam` y firmas oficiales actualizadas; `SCANNER=clamav`; monitorizar fallos (fallan cerrado).
- [ ] Trabajador en contenedor/VM aislado (sin red de salida, usuario no privilegiado, bubblewrap habilitado, LibreOffice/poppler/qpdf/exiftool/tesseract parcheados).
- [ ] Proveedor de correo (SMTP con TLS, SPF/DKIM/DMARC del dominio) y `EMAIL_PROVIDER=smtp`.
- [ ] Gestor de secretos para `BETTER_AUTH_SECRET`, `LOG_HMAC_KEY`, credenciales de BD/S3/SMTP; rotación documentada.
- [ ] Limitación de solicitudes distribuida si hay varias instancias (almacenamiento de rate limit de Better Auth en BD/Redis).
- [ ] Copias: programar `scripts/backup.sh`, cifrar (age/gpg), custodia externa, **prueba de restauración periódica** con `scripts/restore-test.sh`.
- [ ] Programar `npm run retention:apply` (p. ej. diario) tras fijar plazos.
- [ ] Monitorización y alertas (errores, conversiones fallidas, antivirus, cadena de aceptaciones, espacio).
- [ ] Separación estricta de entornos (proyecto/cuenta/BD/bucket distintos para desarrollo y producción).

## Seguridad
- [ ] Prueba de penetración / revisión de seguridad independiente.
- [ ] Crear administradores reales con `--password-stdin` y TOTP; eliminar cuentas de prueba; revisar que no exista `dev_outbox` con datos.
- [ ] Revisar umbrales de OTP, sesión (12 h por defecto), validez de invitaciones (14 días).
- [ ] Revisar cabeceras con el dominio real (HSTS preload si procede).
- [ ] Plan de respuesta a incidentes (incluida filtración de documento: uso de la marca como indicio, no como prueba).

## Contenido
- [ ] Importar la documentación real (`npm run import:folder -- <dir>` → informe → `--import`), revisar clasificación, duplicados, versiones y fechas.
- [ ] Revisar visualmente la fidelidad de cada conversión y marcar datos de pacientes.
- [ ] Preparar copias expurgadas externas cuando proceda y verificarlas.
- [ ] Distinguir en los metadatos: hechos documentados / previsiones / pendiente de verificar; solicitudes vs autorizaciones concedidas; contratos previstos vs firmados; pipeline vs ventas.
- [ ] Eliminar los datos de demostración (`is_demo = true`) del entorno de producción (no se cargan si no se ejecuta `db:seed:demo`, que además se niega en producción).
