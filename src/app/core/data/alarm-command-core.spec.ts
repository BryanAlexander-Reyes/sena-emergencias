import {
  ALARM_COMMAND_TOPIC,
  ALARM_INCIDENTES,
  ESP2_ALARM_PATTERNS,
  crearComandoActivacion,
  crearComandoCierreSimulacro,
  crearComandoDesactivacion,
  estadoPublicado,
  validarComandoAlarma,
  vistaComandoAlarma,
} from './alarm-command-core';
import { MQTT_QOS, MQTT_TOPICS } from './mqtt-contracts';

describe('alarm command core — MQTT.3', () => {
  it('usa el topic original y los cinco incidentes del firmware', () => {
    expect(ALARM_COMMAND_TOPIC).toBe(MQTT_TOPICS.ESP2_COMANDOS_ALARMA);
    expect(MQTT_QOS.PUBLICACION_DEFAULT).toBe(0);
    expect(ALARM_INCIDENTES).toEqual(['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia']);
  });

  it.each(ALARM_INCIDENTES)('construye la activación de %s con su patrón real', (incidente) => {
    const draft = crearComandoActivacion(incidente, `id-${incidente}`);

    expect(draft.topic).toBe('sena/casanare/placa2/comandos/alarma');
    expect(draft.qos).toBe(0);
    expect(draft.retain).toBe(false);
    expect(draft.payload).toEqual({ action: true, evento: incidente });

    const esperado: Record<string, readonly [number, number]> = {
      incendio: [150, 150],
      sismo: [400, 400],
      impacto: [100, 100],
      simulacro: [700, 700],
      emergencia: [250, 250],
    };
    const patron = ESP2_ALARM_PATTERNS[incidente];
    expect(patron.buzzerGpio).toBe(16);
    expect(patron.ledsVerdes).toEqual([18, 19, 23]);
    expect([patron.encendidoMs, patron.apagadoMs]).toEqual(esperado[incidente]);
  });

  it('construye apagado general y cierre de simulacro', () => {
    expect(crearComandoDesactivacion({ idempotencyKey: 'a' }).payload).toEqual({
      action: false,
      alcance: 'todas',
    });
    expect(crearComandoCierreSimulacro('b').payload).toEqual({
      action: false,
      alcance: 'simulacro',
      motivo: 'falsa_alarma',
    });
    expect(crearComandoCierreSimulacro('c', false).payload).toEqual({
      action: false,
      alcance: 'simulacro',
    });
  });

  it('rechaza combinaciones que el firmware ESP2 rechazaría', () => {
    expect(() => crearComandoDesactivacion({ idempotencyKey: 'x', motivo: 'falsa_alarma' })).toThrow();
    expect(() => crearComandoActivacion('volcan' as 'incendio', 'x')).toThrow();
    expect(validarComandoAlarma({ action: true }).valido).toBe(false);
    expect(validarComandoAlarma({ action: false, alcance: 'otro' }).valido).toBe(false);
    expect(validarComandoAlarma({ action: false, motivo: 'falsa_alarma' }).valido).toBe(false);
    expect(validarComandoAlarma({ action: false, alcance: 'simulacro', motivo: 'falsa_alarma' }).valido).toBe(true);
  });

  it('nunca declara confirmación física aunque el comando se haya publicado', () => {
    const draft = crearComandoActivacion('emergencia', 'vista-1');
    const estado = estadoPublicado(draft, '2026-11-23T12:00:00.000Z');
    const vista = vistaComandoAlarma(estado, '2026-11-23T12:00:01.000Z');

    expect(vista).toEqual({
      tipoAlarma: 'emergencia',
      origen: 'cliente',
      estadoSupabase: 'no_consultado',
      estadoComandoMqtt: 'publicado',
      conectividadEsp2: 'sin_dato',
      estadoFisico: 'no_disponible',
      ultimaActualizacion: '2026-11-23T12:00:01.000Z',
    });
  });
});
