import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ALARM_COMMAND_TOPIC } from '../data/alarm-command-core';
import type { MqttEventoMensaje } from '../data/mqtt-contracts';
import type { TelemetryStreamPayload } from '../data/telemetry-core';

import { HardwareAlarmEventService } from './hardware-alarm-event.service';
import { TelemetryService } from './telemetry.service';

class FakeTelemetryService {
  readonly stream = signal<TelemetryStreamPayload | null>(null);
  startCount = 0;
  stopCount = 0;

  start(): void {
    this.startCount += 1;
  }

  stop(): void {
    this.stopCount += 1;
  }
}

function eventoEsp1(incidente: MqttEventoMensaje['evento'], eventoId: string, estado = true): MqttEventoMensaje {
  const evidencia =
    incidente === 'incendio'
      ? {
          origen: 'temperatura_alta' as const,
          temperatura_c: 42,
          umbral_c: 40,
          rearme_inferior_a_c: 37,
        }
      : incidente === 'sismo' || incidente === 'impacto'
        ? {
            pico_m_s2: 4.2,
            rms_m_s2: 1.3,
            actividad_porcentaje: 55,
            factor_cresta: 3.1,
            ventana_valida: true,
          }
        : { origen: 'touch_o_control_local' as const };

  return {
    version: 1,
    placa: 'placa1',
    sala: 'riesgo_bajo',
    sesion: 'sesion-prueba',
    secuencia: 1,
    tipo: 'evento',
    tiempo_activo_ms: 1000,
    fecha: null,
    evento_id: eventoId,
    evento: incidente,
    estado,
    evidencia,
  };
}

describe('HardwareAlarmEventService (MQTT.3)', () => {
  let service: HardwareAlarmEventService;
  let telemetry: FakeTelemetryService;

  beforeEach(() => {
    telemetry = new FakeTelemetryService();
    TestBed.configureTestingModule({
      providers: [{ provide: TelemetryService, useValue: telemetry }],
    });
    service = TestBed.inject(HardwareAlarmEventService);
  });

  it('parte sin decisiones y reenvía start/stop al stream MQTT.2', () => {
    expect(service.decisiones()).toEqual([]);
    expect(service.ultimaDecision()).toBeNull();

    service.start();
    service.stop();
    expect(telemetry.startCount).toBe(1);
    expect(telemetry.stopCount).toBe(1);
  });

  it('convierte cada evento ESP1 en incidente hardware con idempotencia por evento_id', () => {
    for (const incidente of ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'] as const) {
      const decision = service.procesarMensaje(eventoEsp1(incidente, `hw-${incidente}`), '2026-11-23T12:00:00.000Z');

      expect(decision.tipo).toBe('CREAR_INCIDENTE_HARDWARE');
      if (decision.tipo === 'CREAR_INCIDENTE_HARDWARE') {
        expect(decision.origen).toBe('hardware');
        expect(decision.idempotencia).toBe(`hw-${incidente}`);
      }
    }
    expect(service.decisiones()).toHaveLength(5);
    expect(service.ultimaDecision()?.tipo).toBe('CREAR_INCIDENTE_HARDWARE');
  });

  it('ignora eventos repetidos por evento_id', () => {
    const evento = eventoEsp1('emergencia', 'hw-duplicado');
    expect(service.procesarMensaje(evento, '2026-11-23T12:00:00.000Z').tipo).toBe('CREAR_INCIDENTE_HARDWARE');

    const duplicado = service.procesarMensaje(evento, '2026-11-23T12:00:01.000Z');
    expect(duplicado.tipo).toBe('IGNORAR_DUPLICADO');
    expect(service.decisiones()).toHaveLength(2);
  });

  it('ignora mensajes que no cumplen el contrato de ESP1', () => {
    const invalido = service.procesarMensaje(
      { ...eventoEsp1('sismo', 'hw-invalido'), placa: 'placa2' },
      '2026-11-23T12:00:00.000Z',
    );
    expect(invalido.tipo).toBe('IGNORAR_INVALIDO');
  });

  it('no cierra simulacro solo con estado:false; exige evidencia del comando ESP1', () => {
    service.procesarMensaje(eventoEsp1('simulacro', 'hw-sim'), '2026-11-23T12:00:00.000Z');

    const fin = service.procesarMensaje(eventoEsp1('simulacro', 'hw-sim', false), '2026-11-23T12:00:02.000Z');
    expect(fin.tipo).toBe('IGNORAR_DUPLICADO');

    const cierre = service.registrarCierreSimulacro({
      eventoId: 'hw-sim',
      topic: ALARM_COMMAND_TOPIC,
      comando: { action: false, alcance: 'simulacro', motivo: 'falsa_alarma' },
      recibidoEn: '2026-11-23T12:00:03.000Z',
      placa: 'placa1',
    });
    expect(cierre.tipo).toBe('SINCRONIZAR_CIERRE_SIMULACRO');
  });

  it('rechaza evidencia de cierre sin activación de simulacro previa', () => {
    const rechazado = service.registrarCierreSimulacro({
      eventoId: 'hw-sin-activacion',
      topic: ALARM_COMMAND_TOPIC,
      comando: { action: false, alcance: 'simulacro' },
      recibidoEn: '2026-11-23T12:00:00.000Z',
      placa: 'placa1',
    });
    expect(rechazado.tipo).toBe('EVIDENCIA_RECHAZADA');
    if (rechazado.tipo === 'EVIDENCIA_RECHAZADA') {
      expect(rechazado.code).toBe('EVIDENCIA_SIN_ACTIVACION');
    }
  });

  it('reacciona al stream MQTT.2 compartido sin abrir otra suscripción', () => {
    const evento = eventoEsp1('incendio', 'hw-stream');
    telemetry.stream.set({
      snapshot: {
        placa1: {
          conexion: null,
          metricas: null,
          ultimoEvento: evento,
          updatedAt: '2026-11-23T12:00:00.000Z',
        },
        placa2: { conexion: null, metricas: null, ultimoEvento: null, updatedAt: null },
        bridge: { connected: true, lastError: null, updatedAt: '2026-11-23T12:00:00.000Z' },
      },
      demo: false,
      receivedAt: '2026-11-23T12:00:00.000Z',
    });

    TestBed.flushEffects();

    expect(service.decisiones()).toHaveLength(1);
    expect(service.decisiones()[0]?.tipo).toBe('CREAR_INCIDENTE_HARDWARE');
  });
});
