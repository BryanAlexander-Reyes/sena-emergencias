import { TestBed } from '@angular/core/testing';

import type { AlarmCommandDraft } from '../data/alarm-command-core';
import {
  ALARM_COMMAND_GATEWAY,
  type AlarmCommandGateway,
  type AlarmCommandPublishResult,
} from '../data/alarm-command.gateway';

import { AlarmCommandService } from './alarm-command.service';

class FakeGateway implements AlarmCommandGateway {
  readonly drafts: AlarmCommandDraft[] = [];
  resultado: AlarmCommandPublishResult = { fase: 'publicado', publicadoEn: '2026-11-23T12:00:00.000Z' };
  fallarCon: Error | null = null;
  lanzar = false;

  async publicar(draft: AlarmCommandDraft): Promise<AlarmCommandPublishResult> {
    this.drafts.push(draft);
    if (this.lanzar) throw this.fallarCon ?? new Error('FALLO_TRANSPORTE');
    return this.fallarCon ? { fase: 'error', error: this.fallarCon.message } : this.resultado;
  }
}

describe('AlarmCommandService (MQTT.3)', () => {
  let service: AlarmCommandService;
  let gateway: FakeGateway;

  beforeEach(() => {
    gateway = new FakeGateway();
    TestBed.configureTestingModule({
      providers: [{ provide: ALARM_COMMAND_GATEWAY, useValue: gateway }],
    });
    service = TestBed.inject(AlarmCommandService);
  });

  it('publica activación de los cinco incidentes con rol autorizado', async () => {
    for (const incidente of ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'] as const) {
      const estado = await service.activar(incidente, 'administrador', `act-${incidente}`);

      expect(estado.fase).toBe('publicado');
      expect(estado.draft.payload).toEqual({ action: true, evento: incidente });
      expect(estado.confirmacionFisica).toBe('no_disponible');
    }
    expect(gateway.drafts).toHaveLength(5);
    expect(service.historial()).toHaveLength(5);
  });

  it('aplica la matriz MQTT.4: administrador e instructor pueden los cinco eventos', async () => {
    for (const rol of ['administrador', 'instructor'] as const) {
      for (const incidente of ['incendio', 'sismo', 'impacto', 'emergencia', 'simulacro'] as const) {
        const estado = await service.activar(incidente, rol, `rol-${rol}-${incidente}`);
        expect(estado.fase).toBe('publicado');
        expect(estado.draft.payload).toEqual({ action: true, evento: incidente });
      }
    }

    const aprendiz = await service.activar('emergencia', 'aprendiz', 'rol-aprendiz');
    expect(aprendiz.fase).toBe('error');
    expect(aprendiz.error).toBe('ROL_NO_AUTORIZADO');
    expect(gateway.drafts).toHaveLength(10);
  });

  it('aprendiz no puede finalizar ni cerrar simulacro', async () => {
    const apagado = await service.desactivar('aprendiz', { idempotencyKey: 'aprendiz-off' });
    expect(apagado.fase).toBe('error');
    expect(apagado.error).toBe('ROL_NO_AUTORIZADO');

    const simulacro = await service.cerrarSimulacro('aprendiz', true, 'aprendiz-simulacro');
    expect(simulacro.fase).toBe('error');
    expect(simulacro.error).toBe('ROL_NO_AUTORIZADO');
    expect(gateway.drafts).toHaveLength(0);
  });

  it('construye apagado general y cierre de simulacro', async () => {
    const apagado = await service.desactivar('administrador', { idempotencyKey: 'off-1' });
    expect(apagado.draft.payload).toEqual({ action: false, alcance: 'todas' });

    const simulacro = await service.cerrarSimulacro('instructor', true, 'off-2');
    expect(simulacro.draft.payload).toEqual({
      action: false,
      alcance: 'simulacro',
      motivo: 'falsa_alarma',
    });
  });

  it('deduplica por idempotencyKey sin volver a publicar', async () => {
    const primero = await service.activar('incendio', 'administrador', 'clave-unica');
    const segundo = await service.activar('incendio', 'administrador', 'clave-unica');

    expect(segundo).toBe(primero);
    expect(gateway.drafts).toHaveLength(1);
    expect(service.historial()).toHaveLength(1);
  });

  it('registra error sin confirmación física cuando falla el transporte o el gateway lanza', async () => {
    gateway.resultado = { fase: 'error', error: 'HTTP_503' };
    const errorGateway = await service.activar('sismo', 'administrador', 'fallo-1');
    expect(errorGateway.fase).toBe('error');
    expect(errorGateway.error).toBe('HTTP_503');
    expect(errorGateway.confirmacionFisica).toBe('no_disponible');

    gateway.lanzar = true;
    const errorTransporte = await service.activar('sismo', 'administrador', 'fallo-2');
    expect(errorTransporte.fase).toBe('error');
    expect(errorTransporte.error).toContain('FALLO_TRANSPORTE');
  });

  it('expone una vista que nunca afirma estado Supabase ni estado físico', async () => {
    const estado = await service.activar('impacto', 'administrador', 'vista-1');
    const vista = service.vista('vista-1', '2026-11-23T12:00:01.000Z');

    expect(vista).toEqual({
      tipoAlarma: 'impacto',
      origen: 'cliente',
      estadoSupabase: 'no_consultado',
      estadoComandoMqtt: 'publicado',
      conectividadEsp2: 'sin_dato',
      estadoFisico: 'no_disponible',
      ultimaActualizacion: '2026-11-23T12:00:01.000Z',
    });
    expect(estado.publicadoEn).toBe('2026-11-23T12:00:00.000Z');
    expect(service.vista('no-existe')).toBeNull();
  });

  it('rechaza una combinación inválida de comando antes de publicar', async () => {
    const estado = await service.desactivar('administrador', {
      idempotencyKey: 'invalido-1',
      motivo: 'falsa_alarma',
    });

    expect(estado.fase).toBe('error');
    expect(estado.error).toBe('MOTIVO_NO_VALIDO');
    expect(gateway.drafts).toHaveLength(0);
  });
});
