# Guía breve para administradores

> Todo se hace desde el navegador en `/admin`, sin tocar código. Fechas mostradas en la zona horaria configurada (indicada en pantalla); los eventos se guardan en UTC.

## Primer acceso
1. Inicie sesión en `/admin/login` con correo y contraseña.
2. Active el segundo factor (obligatorio): confirme la contraseña, escanee el QR con una app autenticadora, introduzca el código. Guarde los códigos de recuperación.

## Preparar documentación
1. **Biblioteca → Nuevo documento** (o **Carga por lotes**). Formatos: PDF, DOCX, XLSX, PPTX, PNG, JPG. Cada carga queda **privada** en revisión.
2. Espere al procesado (antivirus, conversión aislada, páginas). En el documento verá:
   - **Antivirus**: si no está configurado, la versión queda en cuarentena (en desarrollo puede liberarla manualmente; queda auditado).
   - **Fidelidad**: si hay avisos (texto no encontrado, hojas ocultas, comentarios, control de cambios, objetos incrustados), revise las páginas y pulse «Confirmo fidelidad tras revisión visual».
   - **Conversión fallida**: la versión no puede publicarse. Corrija el archivo y cargue una versión nueva.
3. **Aprobar** y después **Publicar**. Antes de publicar se muestra quién lo verá con las reglas actuales; puede conceder además acceso a destinatarios o grupos concretos. Debe confirmar la audiencia.
4. Una **nueva versión** nunca sustituye a la publicada hasta que la apruebe y publique. La anterior pasa a «sustituida» (solo visible con permiso explícito de versión).
5. Complete metadatos (fecha, responsable, confidencialidad, vigencia, próxima revisión, fuente, producto/mercado, etiquetas). Marque **«Contiene datos identificativos de pacientes»** si procede: el documento no podrá publicarse.
6. **Pendientes**: marque cada elemento esperado como recibido, pendiente o «no aplica» (con justificación). Exporte la lista en CSV.

## Copias expurgadas
Prepare la copia **fuera** del sistema con una herramienta de expurgación real (eliminar el contenido, no tapar con rectángulos; aplanar; quitar metadatos, comentarios, capas y adjuntos). En el documento original: **Copias expurgadas → Cargar copia expurgada**. En la copia: introduzca los textos que no deben aparecer y pulse **Verificar** (texto, OCR, metadatos, anotaciones, adjuntos, revisiones, partes ocultas de Office). Si pasa, **atestigüe** la revisión visual. Solo entonces podrá publicarse. Los términos no se guardan.

## Destinatarios
1. **Destinatarios → Nuevo**: correo autorizado, nombre, organización, NDA aplicable, idioma, caducidad, re-verificación, interruptores (Q&A, descargas con marca, originales — desaconsejado), grupos y un **perfil** (plantilla que se copia en reglas individuales).
2. En la ficha: ajuste **permisos individuales** (permitir/denegar por sección, carpeta, documento o versión). Recuerde: **cualquier denegación prevalece**; las descargas requieren regla **y** interruptor.
3. Revise **Permisos efectivos** y **Ver como este destinatario** (con banner; no genera actividad).
4. Revise el **resumen previo** (contenido, restricciones, descargas, NDA, caducidad, ejemplo de marca), marque la confirmación y **Generar y enviar invitación** (o solo generar el enlace para enviarlo usted; se muestra una vez). Una nueva invitación anula las anteriores.
5. **Revocar** bloquea el acceso y cierra sesiones. No borra lo ya descargado o visto.

## Condiciones y NDA
Los textos iniciales son **borradores pendientes de revisión jurídica**. Para cambiarlos cree una versión nueva, márquela como revisada por la asesoría y actívela. Si es un cambio material deje marcado «exigir nueva aceptación»: todos deberán aceptarla antes de seguir. Las versiones y aceptaciones previas se conservan. Exporte el expediente de aceptación de un destinatario desde su ficha (JSON).

## Actividad
**Actividad**: por persona, empresa, documento y periodo; exportable. Lea **Definición de métricas**: abrir no es leer; las páginas servidas no prueban lectura; el tiempo activo es una estimación del navegador; descargar no informa del uso posterior. Las previsualizaciones y los escáneres de enlaces no cuentan.

## Q&A
Las preguntas son privadas. Asigne responsable y estado, añada notas internas (nunca visibles), redacte la respuesta (borrador) y **publíquela** explícitamente. Compartir una pregunta con un grupo es una acción explícita.

## Configuración
Opacidad de la marca, seguimiento (activar/desactivar métricas opcionales, umbrales), notificaciones (sin contenido confidencial), validez de invitaciones, conservación (simular/aplicar). El estado del sistema muestra almacenamiento, antivirus, correo y sandbox.
