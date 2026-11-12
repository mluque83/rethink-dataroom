# Copias de seguridad y restauración

## Qué se copia
1. **Base de datos** (`pg_dump` formato custom): datos, permisos, auditoría, evidencias de aceptación, configuración.
2. **Almacenamiento** (originales, representaciones, derivados) con manifiesto SHA-256 por objeto.
3. `SHA256SUMS` de los ficheros de la copia.

Los secretos (`.env*`, claves) **no** se incluyen: se custodian en el gestor de secretos.

## Hacer una copia
```bash
ENV_FILE=.env.local scripts/backup.sh backups/2026-11-11     # directorio con modo 700/600
```
En producción, cifre inmediatamente el resultado (p. ej. `age`/`gpg` con clave custodiada aparte) y guárdelo fuera del entorno principal, con acceso restringido y retención definida. Programe la copia (cron/systemd) y además active los mecanismos nativos del proveedor (PITR de PostgreSQL gestionado, versionado y replicación del bucket).

## Probar una restauración (sin tocar el origen)
```bash
scripts/restore-test.sh backups/2026-11-11
```
1. Comprueba `SHA256SUMS`.
2. Crea la BD aislada `dataroom_restore_check` y ejecuta `pg_restore`.
3. Restaura los objetos en `.local/restore-check-storage` verificando cada SHA-256.
4. `scripts/verify-restore.ts` compara recuentos de tablas con el origen, verifica que **cada fichero** referenciado existe con su hash y que la **cadena de aceptaciones** sigue siendo válida. Imprime `RESTORE VERIFIED` o `RESTORE FAILED`.

Probado automáticamente en `tests/integration/zz-backup.test.ts` (requisito 18).

## Restauración real (procedimiento)
1. Detener web y trabajador. 2. Crear BD vacía y `pg_restore --no-owner`. 3. Importar objetos al bucket de destino (`scripts/storage-copy.ts import <dir>` con la configuración de destino). 4. Ejecutar `scripts/verify-restore.ts` contra el destino. 5. Rotar `BETTER_AUTH_SECRET` si se sospecha compromiso (invalida sesiones). 6. Arrancar y revisar el panel (alertas de cadena/almacenamiento).
