export default function Metrics() {
  const rows: [string, string, string][] = [
    ["Invitación pendiente / aceptada", "Estado de la última invitación (creada, enviada, verificada, caducada, revocada, sustituida). «Verificada» = el destinatario superó el código de su correo.", "Servidor"],
    ["NDA aceptado y fecha", "Registro de aceptación inmutable con hora del servidor (UTC).", "Servidor"],
    ["Sesión autenticada", "Verificación correcta de un código de un solo uso. Abrir el enlace de invitación NO cuenta (los escáneres de correo lo abren).", "Servidor"],
    ["Primera / última visita", "Primera / última sesión autenticada.", "Servidor"],
    ["Documento abierto (apertura)", "El visor solicitó y el servidor autorizó una versión. No demuestra lectura.", "Servidor"],
    ["Páginas servidas", "Páginas distintas cuya imagen personalizada entregó el servidor a un visor. No demuestra que se miraran ni que se comprendieran. Sin precarga.", "Servidor"],
    ["Descargas", "Archivos entregados (copia con marca u original). No se sabe qué se hace después.", "Servidor"],
    ["Tiempo activo estimado", "Suma de intervalos acreditados entre latidos del visor (cada 15 s por defecto) solo si la pestaña estaba visible y hubo interacción en el umbral de inactividad; tope por intervalo; un mismo segundo no se acredita dos veces entre pestañas o documentos; reintentos idempotentes. Señal del navegador: puede perderse o manipularse.", "Navegador (estimación)"],
  ];
  return (
    <div className="space-y-4"><h1>Definición de métricas</h1>
      <div className="card table-wrap"><table className="tbl"><thead><tr><th>Métrica</th><th>Definición</th><th>Fuente</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td className="font-semibold">{r[0]}</td><td className="text-sm">{r[1]}</td><td>{r[2]}</td></tr>)}</tbody></table></div>
      <div className="card text-sm space-y-2"><h2>Exclusiones y límites</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Las previsualizaciones administrativas («ver como») no generan ningún evento del destinatario.</li>
          <li>Las aperturas del enlace de invitación (incluidos escáneres y bots) no se cuentan como visitas; solo constan en el registro de seguridad.</li>
          <li>No hay puntuaciones de «probabilidad de invertir» ni inferencias de interés.</li>
          <li>No existe detección de capturas de pantalla: no hay señal técnica fiable para ello y no se generan eventos de ese tipo.</li>
          <li>Sin cookies analíticas, grabación de sesión, registro de pulsaciones ni huella digital del navegador.</li>
        </ul></div>
    </div>
  );
}
