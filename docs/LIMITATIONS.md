# Limitaciones conocidas (lectura obligatoria)

## Lo que los controles NO garantizan
- **Verificar el correo** demuestra control del buzón, no identidad física, ni impide que alguien comparta sus credenciales o su pantalla.
- **La marca de agua** disuade y aporta indicios de atribución. No impide fotografiar, recortar, transcribir ni eliminar la marca, y por sí sola no prueba quién filtró un documento.
- **Revocar** bloquea nuevos accesos; no borra lo ya visto ni lo ya descargado.
- **Métricas**: abrir ≠ leer; página servida ≠ página mirada o comprendida; descarga ≠ conocimiento del uso posterior; el tiempo activo es una estimación basada en señales del navegador que pueden perderse o manipularse. No existe detección de capturas de pantalla (no hay señal técnica fiable) y no se generan eventos de ese tipo. No se calculan «probabilidades de invertir».
- **Hash encadenado** de aceptaciones: indicio de manipulación frente a cambios ordinarios; un superusuario de base de datos podría reescribir la cadena completa. Mitigación: exportación periódica y custodia externa / sellado de tiempo.
- **Aceptación electrónica**: el registro conserva evidencia; no garantiza exigibilidad jurídica ni cumplimiento normativo. Los textos son **borradores pendientes de revisión jurídica**.
- **Implementar controles técnicos no equivale a cumplir** RGPD, ISO 27001 ni ninguna otra norma.

## Limitaciones técnicas de esta versión
- **Antivirus**: firmas oficiales de ClamAV no disponibles en este entorno. Sin escáner configurado las cargas quedan en cuarentena; en desarrollo se pueden liberar manualmente (auditado). En producción esa opción está desactivada.
- **Almacenamiento local** solo para desarrollo (cifrado en reposo depende del disco). El driver S3 está implementado y probado contra un servidor compatible (moto), no contra un proveedor real.
- **Correo**: proveedor de desarrollo sin envíos reales; SMTP implementado pero no ejecutado.
- **Expurgación**: no hay editor de expurgación integrado (decisión deliberada). Se verifican copias preparadas externamente. La verificación busca cadenas exactas (normalizando mayúsculas, acentos y espacios); no detecta paráfrasis, información inferible, datos en imágenes que el OCR no lea, ni contenido dentro de objetos incrustados (se marcan como «no comprobado» y bloquean el resultado «pass»). Requiere atestación manual.
- **Fidelidad de conversión**: comparación automática de palabras + revisión visual del administrador. LibreOffice puede diferir de Microsoft Office en maquetación, fuentes, gráficos y hojas anchas; las hojas ocultas no se representan (se avisa).
- **Visor rasterizado**: sin selección de texto ni búsqueda dentro del documento; las copias descargadas con marca también son imágenes (no seleccionables, más pesadas). La búsqueda es por título y metadatos.
- **Textos legales** se muestran como texto plano (Markdown sin formatear) para que lo mostrado sea idéntico a lo guardado.
- **Sandbox**: bubblewrap + prlimit en el mismo host. Para mayor aislamiento usar contenedores/VM dedicadas para el trabajador. El procesado de imágenes con `sharp` ocurre en el proceso trabajador (fuera de bubblewrap), con límite de píxeles.
- **Limitación de solicitudes** de Better Auth en memoria (una instancia); la limitación propia de OTP/invitaciones sí está en PostgreSQL.
- **i18n**: interfaz del destinatario completa en español e inglés; la administración tiene navegación bilingüe pero contenido mayoritariamente en español.
- **Un único rol de administrador** (sin roles de solo lectura ni flujo de aprobación a cuatro ojos).
- **Q&A**: los adjuntos son documentos del data room (sujetos a permisos); no hay carga de adjuntos dentro de la respuesta.
- **Identidad visual**: aplicada según el Brandbook (sept. 2022). El logotipo se extrajo del PDF (raster 300 ppi con alfa; no había vector): conviene sustituirlo por el original vectorial (SVG/AI). Por accesibilidad (WCAG AA) el naranja #ea9600 no se usa como color de texto (2,37:1 sobre blanco); los títulos usan Bebas Neue en tinta oscura.
- **Marca de agua**: la banda inferior de atribución tapa el pie original de cada página (p. ej. numeración «3/6»).
- **CSP** permite `style-src 'unsafe-inline'` (estilos en línea de React); los scripts sí exigen nonce.
- La regla «deny siempre gana» implica que un deny de grupo no puede anularse con un allow individual.
