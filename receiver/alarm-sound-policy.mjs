// Prioridad estable: tipo, fecha e ID; no depende del orden de la consulta.
const PRIORIDAD = ['incendio', 'sismo', 'impacto', 'emergencia', 'simulacro'];
export function comandoParaAlarmasActivas(alarms) {
  const sorted = [...alarms].sort((a, b) => {
    const rank = item => PRIORIDAD.indexOf(PRIORIDAD.includes(item.evento) ? item.evento : 'emergencia');
    return rank(a) - rank(b) || String(a.fecha_activacion).localeCompare(String(b.fecha_activacion)) || a.id.localeCompare(b.id);
  });
  return sorted.length ? { action: true, evento: PRIORIDAD.includes(sorted[0].evento) ? sorted[0].evento : 'emergencia' }
    : { action: false, alcance: 'todas' };
}
