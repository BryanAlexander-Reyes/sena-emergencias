import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { AlarmCommandDraft } from '../data/alarm-command-core';
import {
  ALARM_COMMAND_GATEWAY,
  type AlarmCommandGateway,
  type AlarmCommandPublishMetadata,
  type AlarmCommandPublishResult,
} from '../data/alarm-command.gateway';
import { ALARM_INCIDENTES } from '../data/alarm-incident-contract';
import { SupabaseService } from '../supabase.service';

import { ALARM_ACTIVATION_MODE, AlarmCommandPendingError, ManualAlarmService, type ManualAlarmRecord } from './manual-alarm.service';

const CLAVE = '11111111-1111-4111-8111-111111111111';

const ALARMA_BASE: ManualAlarmRecord = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tipo: 'alarma_manual',
  titulo: '⚠️ PRECAUCIÓN',
  mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
  severidad: 'critical',
  fecha_activacion: '2026-11-23T12:00:00.000Z',
  estado: 'activa',
  evento: null,
  origen: 'cliente',
  eventoReportado: false,
};

class FakeSupabaseService {
  readonly invocaciones: { nombre: string; opciones: { body?: unknown; method?: string } }[] = [];
  respuesta: unknown = { status: 'ACTIVATED', alarma: { ...ALARMA_BASE } };
  error: Error | null = null;
  conSesion = true;

  readonly client = {
    auth: {
      getSession: async () => ({
        data: { session: this.conSesion ? { access_token: 'token-simulado' } : null },
        error: null,
      }),
    },
    functions: {
      invoke: async (nombre: string, opciones: { body?: unknown; method?: string }) => {
        this.invocaciones.push({ nombre, opciones });
        if (this.error) return { data: null, error: this.error };
        return { data: this.respuesta, error: null };
      },
    },
  } as unknown as SupabaseClient;
}

class FakeCommandGateway implements AlarmCommandGateway {
  readonly llamadas: { draft: AlarmCommandDraft; metadata?: AlarmCommandPublishMetadata }[] = [];
  resultado: AlarmCommandPublishResult = { fase: 'publicado' };

  async publicar(draft: AlarmCommandDraft, metadata?: AlarmCommandPublishMetadata): Promise<AlarmCommandPublishResult> {
    this.llamadas.push({ draft, metadata });
    return this.resultado;
  }
}

describe('ManualAlarmService — MQTT.5A', () => {
  let service: ManualAlarmService;
  let supabase: FakeSupabaseService;
  let gateway: FakeCommandGateway;

  beforeEach(() => {
    supabase = new FakeSupabaseService();
    gateway = new FakeCommandGateway();
    gateway.resultado = { fase: 'publicado', alarma: { ...ALARMA_BASE } };
    TestBed.configureTestingModule({
      providers: [
        { provide: ALARM_ACTIVATION_MODE, useValue: 'gateway' },
        { provide: SupabaseService, useValue: supabase },
        { provide: ALARM_COMMAND_GATEWAY, useValue: gateway },
      ],
    });
    service = TestBed.inject(ManualAlarmService);
  });

  it('conserva la firma legacy: activate(clave) envía solo clave_idempotencia', async () => {
    const alarma = await service.activate(CLAVE);

    expect(supabase.invocaciones[0]).toEqual({
      nombre: 'activar-alarma-manual',
      opciones: { body: { clave_idempotencia: CLAVE } },
    });
    expect(alarma.tipo).toBe('alarma_manual');
    expect(alarma.evento).toBeNull();
    expect(alarma.origen).toBe('cliente');
    expect(alarma.eventoReportado).toBe(false);
  });

  it('el MVP normal activa mediante la Edge Function aunque MQTT esté desconectado', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: SupabaseService, useValue: supabase },
      { provide: ALARM_COMMAND_GATEWAY, useValue: gateway },
    ] });
    const restored = TestBed.inject(ManualAlarmService);
    gateway.resultado = { fase: 'error', error: 'MQTT_NO_CONECTADO' };
    const result = await restored.activate(CLAVE, 'simulacro').catch((error: unknown) => error);
    expect(supabase.invocaciones[0]).toEqual({ nombre: 'activar-alarma-manual', opciones: {
      body: { clave_idempotencia: CLAVE, evento: 'simulacro', origen: 'cliente' },
    } });
    expect(gateway.llamadas).toHaveLength(1);
    expect(gateway.llamadas[0].metadata).toEqual({ activacion: { alarma_id: ALARMA_BASE.id } });
    expect(result).toBeInstanceOf(AlarmCommandPendingError);
    expect((result as AlarmCommandPendingError).alarma.id).toBe(ALARMA_BASE.id);
    expect((result as AlarmCommandPendingError).alarma.evento).toBeNull();
    gateway.resultado = { fase: 'publicado' };
    const retry = await restored.activate(CLAVE, 'simulacro');
    expect(retry.comandoMqtt.fase).toBe('publicado');
    expect(gateway.llamadas[1].draft.idempotencyKey).toBe(gateway.llamadas[0].draft.idempotencyKey);
  });

  it('envía evento y origen explícitos para los cinco eventos', async () => {
    for (const evento of ALARM_INCIDENTES) {
      gateway.llamadas.length = 0;
      gateway.resultado = {
        fase: 'publicado',
        alarma: { ...ALARMA_BASE, evento, origen: 'cliente', eventoReportado: true },
      };

      const alarma = await service.activate(CLAVE, evento);

      expect(supabase.invocaciones).toHaveLength(0);
      expect(gateway.llamadas[0].metadata?.incidente).toMatchObject({
        clave_idempotencia: CLAVE,
        evento,
        origen: 'cliente',
      });
      expect(alarma.tipo).toBe('alarma_manual');
      expect(alarma.evento).toBe(evento);
      expect(alarma.eventoReportado).toBe(true);
    }
    expect(ALARM_INCIDENTES).toHaveLength(5);
  });

  it('rechaza eventos fuera del dominio antes de invocar al backend', async () => {
    await expect(service.activate(CLAVE, 'volcan' as never)).rejects.toThrow('EVENTO_NO_VALIDO');
    expect(supabase.invocaciones).toHaveLength(0);
  });

  it('normaliza históricos sin evento a evento:null sin inventarlo', async () => {
    supabase.respuesta = {
      status: 'SUCCESS',
      hay_alarma_activa: true,
      alarmas: [
        { ...ALARMA_BASE, evento: undefined, origen: undefined, eventoReportado: undefined },
        { ...ALARMA_BASE, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', evento: 'sismo', origen: 'cliente' },
        null,
      ],
    };

    const alarmas = await service.getActiveAlarms();

    expect(alarmas).toHaveLength(2);
    expect(alarmas[0].evento).toBeNull();
    expect(alarmas[0].origen).toBe('cliente');
    expect(alarmas[0].eventoReportado).toBe(false);
    expect(alarmas[1].evento).toBe('sismo');
    expect(alarmas.every((alarma) => alarma.tipo === 'alarma_manual')).toBe(true);
  });

  it('propaga el código canónico EVENTO_NO_SELECCIONADO del backend', async () => {
    gateway.resultado = { fase: 'error', error: 'EVENTO_NO_SELECCIONADO' };

    await expect(service.activate(CLAVE, 'incendio')).rejects.toThrow('EVENTO_NO_SELECCIONADO');
  });

  it('usa la alarma persistida por la RPC como única fuente de la activación', async () => {
    gateway.resultado = {
      fase: 'publicado',
      alarma: { ...ALARMA_BASE, id: '55555555-5555-4555-8555-555555555555', evento: 'sismo', eventoReportado: true },
    };

    const alarma = await service.activate(CLAVE, 'sismo');

    expect(supabase.invocaciones).toHaveLength(0);
    expect(alarma.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(alarma.evento).toBe('sismo');
  });

  it('publica el comando con el incidente adjunto sin invocar la Edge Function legacy', async () => {
    const alarma = await service.activate(CLAVE, 'simulacro');

    expect(supabase.invocaciones).toHaveLength(0);
    expect(gateway.llamadas).toHaveLength(1);
    expect(gateway.llamadas[0].draft.payload).toEqual({ action: true, evento: 'simulacro' });
    expect(gateway.llamadas[0].metadata?.incidente).toMatchObject({
      clave_idempotencia: CLAVE,
      evento: 'simulacro',
      origen: 'cliente',
    });
    expect(alarma.comandoMqtt.fase).toBe('publicado');
    expect(alarma.comandoMqtt.mensaje).toContain('Sin confirmación física');
  });

  it('no afirma éxito si la RPC rechaza la persistencia', async () => {
    gateway.resultado = { fase: 'error', error: 'EVENTO_NO_SELECCIONADO' };

    await expect(service.activate(CLAVE, 'simulacro')).rejects.toThrow('EVENTO_NO_SELECCIONADO');
    expect(gateway.llamadas).toHaveLength(1);
  });

  it('no publica comando en la activación legacy sin evento', async () => {
    const alarma = await service.activate(CLAVE);

    expect(gateway.llamadas).toHaveLength(0);
    expect(alarma.comandoMqtt.fase).toBe('omitido');
  });

  it('marca como pendiente los fallos de transporte con la alarma ya persistida', async () => {
    gateway.resultado = {
      fase: 'error',
      error: 'MQTT_NO_CONECTADO',
      alarma: { ...ALARMA_BASE, evento: 'simulacro', eventoReportado: true },
    };

    const error = await service.activate(CLAVE, 'simulacro').catch((fallo: unknown) => fallo);

    expect(error).toBeInstanceOf(AlarmCommandPendingError);
    expect((error as AlarmCommandPendingError).alarma.id).toBe(ALARMA_BASE.id);
    expect(gateway.llamadas).toHaveLength(1);
  });

  it('no disfraza errores de autorización como comandos pendientes', async () => {
    gateway.resultado = { fase: 'error', error: 'ROL_NO_AUTORIZADO' };

    await expect(service.activate(CLAVE, 'simulacro')).rejects.toThrow('ROL_NO_AUTORIZADO');
    await expect(service.activate(CLAVE, 'simulacro')).rejects.not.toBeInstanceOf(AlarmCommandPendingError);
  });

  it('finaliza con apagado de simulacro y registra el id de la alarma', async () => {
    supabase.respuesta = {
      status: 'FINALIZED',
      alarma: { ...ALARMA_BASE, estado: 'finalizada', evento: 'simulacro', eventoReportado: true },
    };

    const alarma = await service.finalize(ALARMA_BASE.id, 'simulacro');

    expect(gateway.llamadas[0].draft.payload).toEqual({ action: false, alcance: 'simulacro' });
    expect(gateway.llamadas[0].metadata?.finalizacion).toEqual({ alarma_id: ALARMA_BASE.id });
    expect(alarma.estado).toBe('finalizada');
    expect(alarma.comandoMqtt.fase).toBe('publicado');
  });
});
