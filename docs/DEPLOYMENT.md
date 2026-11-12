# Despliegue en producción — dataroom.rethinkmedical.es

Proveedor propuesto: **Scaleway (UE, región París `fr-par`)**. El diseño sirve igual para otro proveedor europeo con servidor Ubuntu 24.04, PostgreSQL gestionado, almacenamiento S3 y SMTP.

```
Internet ─HTTPS─► Caddy (TLS automático) ─► Next.js (127.0.0.1:3000) ─┬─► PostgreSQL gestionado (cifrado en reposo, TLS)
                                            Trabajador + ClamAV ──────┼─► Object Storage privado (cifrado SSE)
                                                                       └─► Correo transaccional (SMTP TLS)
```

> No invitar a inversores reales hasta completar la revisión jurídica del NDA y la lista de `PRODUCTION-CHECKLIST.md`.

## 1. Recursos en el proveedor (consola web)
1. **Proyecto** «rethink-dataroom-prod» (separado de cualquier entorno de pruebas).
2. **Base de datos gestionada PostgreSQL 16**, región `fr-par`:
   - activar **cifrado en reposo** (no se puede desactivar después);
   - activar copias automáticas;
   - red privada o lista de IP permitidas = solo la IP del servidor;
   - crear usuario `dataroom` (sin privilegios de superusuario) y base `dataroom`.
3. **Object Storage**: bucket privado `rethink-dataroom-prod` en `fr-par`, sin acceso público, con versionado y cifrado del lado servidor. Crear una clave API **limitada a ese bucket**.
4. **Servidor (Instance)** Ubuntu 24.04, 4 vCPU / 8 GB RAM (LibreOffice + OCR), disco cifrado si el tipo lo permite, acceso solo por clave SSH y grupo de seguridad con 22 (restringido a vuestra IP), 80 y 443.
5. **Correo transaccional (TEM)**: dar de alta el dominio **`dataroom.rethinkmedical.es`** (no el raíz) y crear credenciales SMTP.

## 2. DNS de rethinkmedical.es (gestionado en Piensa Solutions)
**No se modifica ningún registro existente** (correo de Google Workspace, SPF raíz, DKIM existentes, web en la raíz, subdominio `notify`).
Todo el data room — web y correo — usa el subdominio `dataroom`, para que el MX que exige el proveedor de correo
no interfiera con el correo corporativo. Remitente: `no-reply@dataroom.rethinkmedical.es`.

| Nombre | Tipo | Valor | Cuándo |
|---|---|---|---|
| `dataroom` | A (y AAAA si hay IPv6) | IP pública del servidor | al crear el servidor |
| `dataroom` | TXT | `v=spf1 include:_spf.tem.scaleway.com -all` | al dar de alta el dominio en TEM |
| `<id>._domainkey.dataroom` | TXT | valor DKIM generado por Scaleway | al dar de alta el dominio en TEM |
| `dataroom` | MX | el que indique la consola de Scaleway | al dar de alta el dominio en TEM |
| `_dmarc.dataroom` | TXT | `v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:<buzón de informes>` | tras validar SPF/DKIM |

Recomendación aparte (fuera del data room): si el dominio raíz no tiene DMARC, empezar con `v=DMARC1; p=none; rua=mailto:…` para observar
qué servicios envían en vuestro nombre (Google, el servicio con DKIM `1735027938237`, Lovable) antes de endurecer la política.

## 3. Instalación en el servidor (≈ 20 min)
```bash
ssh admin@<ip>
sudo install -d -m 750 /etc/dataroom
sudo nano /etc/dataroom/env        # copiar deploy/env.production.example y completar; secretos con: openssl rand -base64 48
# repositorio privado: añadir una deploy key de SOLO LECTURA en GitHub y usar la URL SSH, o un token de lectura
sudo DOMAIN=dataroom.rethinkmedical.es REPO=git@github.com:mluque83/rethink-dataroom.git \
     bash provision-ubuntu-24.04.sh
```
El script instala dependencias, firmas oficiales de ClamAV, compila, migra, crea la estructura base, comprueba el aislamiento (bubblewrap), registra los servicios (`dataroom-web`, `dataroom-worker`, conservación diaria y copia cifrada nocturna), configura HTTPS con Caddy y el cortafuegos. **No** carga datos de demostración.

Primer administrador (la contraseña se teclea, no se guarda en el historial):
```bash
sudo -u dataroom bash -c 'cd /opt/dataroom/app && read -rs PW && echo -n "$PW" | ENV_FILE=/etc/dataroom/env node --conditions=react-server --import tsx scripts/create-admin.ts --email <correo> --name "<nombre>" --password-stdin'
```

## 4. Verificación tras el despliegue
- [ ] `https://dataroom.rethinkmedical.es/access` carga con certificado válido; `http://` redirige a `https://`.
- [ ] Admin → Configuración: almacenamiento con cifrado por defecto y bloqueo de acceso público; antivirus `clean`; correo SMTP.
- [ ] Cargar un PDF de prueba: antivirus `Limpio`, conversión correcta. Cargar el fichero EICAR de prueba: debe quedar bloqueado.
- [ ] Invitación a una cuenta interna: llega el correo, el código funciona, el NDA aparece, el visor muestra la marca.
- [ ] `systemctl list-timers | grep dataroom` muestra la conservación y la copia; ejecutar una copia y una **restauración de prueba** (`docs/BACKUP-RESTORE.md`).
- [ ] Cabeceras: `curl -sI https://dataroom.rethinkmedical.es/access` incluye HSTS, CSP y `cache-control: no-store`.

## 5. Actualizaciones
```bash
sudo -u dataroom git -C /opt/dataroom/app pull --ff-only
sudo -u dataroom bash -c 'cd /opt/dataroom/app && npm ci && set -a && . /etc/dataroom/env && set +a && npx next build && ENV_FILE=/etc/dataroom/env npx tsx scripts/migrate.ts'
sudo systemctl restart dataroom-web dataroom-worker
```
Hacer copia antes de cada actualización con migraciones.

## 6. Notas
- El proxy (Caddy) no confía en `X-Forwarded-For` enviado por clientes; la aplicación ve la IP real.
- Los registros de acceso de Caddy eliminan cookies, cabeceras de autorización e identificadores de documento de la URL.
- Si el almacenamiento rechaza la cabecera de cifrado `AES256`, usar `S3_SSE=bucket-default` con cifrado por defecto activado en el bucket (el panel lo comprueba y avisa si no está activo).
- Las claves privadas de las copias cifradas (`age`) se custodian fuera del servidor.
- **No probado en un entorno real de Scaleway** desde este entorno de desarrollo: el script y la configuración se han validado sintácticamente y la aplicación en modo producción, pero el primer despliegue debe seguir la verificación del punto 4.
