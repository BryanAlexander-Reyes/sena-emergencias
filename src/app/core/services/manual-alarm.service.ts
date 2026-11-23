import { inject, Injectable, InjectionToken } from '@angular/core';

import { crearComandoActivacion, crearComandoDesactivacion, type AlarmCommandDraft } from '../data/alarm-command-core';
import {
  ALARM_COMMAND_GATEWAY,
  type AlarmCommandGateway,
  type AlarmCommandPublishMetadata,
  type AlarmCommandPublishResult,
} from '../data/alarm-command.gateway';
import {
  esAlarmaIncidente,
  esAlarmaOrigen,
  MENSAJE_ALARMA_MANUAL,
  normalizarIncidenteAlarma,
  SEVERIDAD_ALARMA_MANUAL,
  TITULO_ALARMA_MANUAL,
  type AlarmaIncidente,
  type AlarmaOrigen,
  type IncidenteAlarma,
} from '../data/alarm-incident-contract';
import { SupabaseService } from '../supabase.service';

export type ManualAlarmRecord = IncidenteAlarma;
/** El MVP sencillo usa la Edge Function que registra y solicita FCM. */
export const ALARM_ACTIVATION_MODE = new InjectionToken<'edge' | 'gateway'>('ALARM_ACTIVATION_MODE', {
  providedIn: 'root', factory: () => 'edge',
});

export interface ManualAlarmCommandInfo {
  readonly fase: 'publicado' | 'omitido';
  readonly mensaje: string;
}

export type ManualAlarmOperationResult = ManualAlarmRecord & {
  readonly comandoMqtt: ManualAlarmCommandInfo;
};

/** La persistencia o el finalizador sucedieron, pero el comando no se publicó. */
export class AlarmCommandPendingError extends Error {
  readonly alarma: ManualAlarmRecord;
  readonly detalle: string;

  constructor(detalle: string, alarma: ManualAlarmRecord) {
    super('MQTT_PUBLISH_PENDIENTE');
    this.name = 'AlarmCommandPendingError';
    this.detalle = detalle;
    this.alarma = alarma;
  }
}

function nuevaClaveComando(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `mqtt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function comandoOmitido(): ManualAlarmCommandInfo {
  return { fase: 'omitido', mensaje: 'Estado registrado en Supabase. Esta operación no confirmó ningún comando al ESP32.' };
}

function comandoPublicado(): ManualAlarmCommandInfo {
  return { fase: 'publicado', mensaje: 'Comando entregado al transporte MQTT. Sin confirmación física del ESP32.' };
}

/** Errores de transporte: el registro puede existir, pero el comando no se confirmó. */
const CODIGOS_PUBLICACION_PENDIENTE = new Set([
  'MQTT_NO_CONECTADO',
  'MQTT_NO_DISPONIBLE',
  'MQTT_PUBLISH_PENDIENTE',
  'FALLO_TRANSPORTE',
  'SIN_TRANSPORTE',
  'NETWORK_DOWN',
  'HTTP_503',
]);

interface ActivateAlarmResponse {
  status: 'ACTIVATED';
  alarma: unknown;
}

interface ConsultarAlarmasResponse {
  status: 'SUCCESS';
  hay_alarma_activa: boolean;
  alarmas: unknown[];
}

interface FinalizeAlarmResponse {
  status: 'FINALIZED';
  alarma: ManualAlarmRecord;
}

@Injectable({
  providedIn: 'root',
})
export class ManualAlarmService {
  private readonly supabase = inject(SupabaseService);
  private readonly commandGateway = inject(ALARM_COMMAND_GATEWAY, { optional: true });
  private readonly activationMode = inject(ALARM_ACTIVATION_MODE);

  async activate(
    idempotencyKey: string,
    evento?: AlarmaIncidente,
    origen: AlarmaOrigen = 'cliente',
  ): Promise<ManualAlarmOperationResult> {
    if (evento !== undefined) {
      if (!esAlarmaIncidente(evento)) {
        throw new Error('EVENTO_NO_VALIDO');
      }
      if (!esAlarmaOrigen(origen)) {
        throw new Error('ORIGEN_NO_VALIDO');
      }
    }

    const client = this.supabase.client;

    if (!client) {
      throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError || !sessionData.session) {
      throw new Error('UNAUTHENTICATED');
    }

    // Compatibilidad: la activación legacy sin evento sigue la escribiendo la
    // Edge Function histórica y no publica ningún comando MQTT.
    if (evento === undefined || this.activationMode === 'edge') {
      const { data, error } = await client.functions.invoke<ActivateAlarmResponse>('activar-alarma-manual', {
        body: { clave_idempotencia: idempotencyKey, ...(evento === undefined ? {} : { evento, origen }) },
      });

      if (error) {
        throw error;
      }

      const alarma = data?.status === 'ACTIVATED' ? normalizarIncidenteAlarma(data.alarma) : null;
      if (!alarma) {
        throw new Error('INVALID_ALARM_RESPONSE');
      }

      if (evento === undefined) return { ...alarma, comandoMqtt: comandoOmitido() };
      const resultado = await this.publicarComando(
        crearComandoActivacion(evento, `on:${alarma.id}`),
        { activacion: { alarma_id: alarma.id } },
        alarma,
        'activación',
      );
      return { ...alarma, comandoMqtt: resultado === null ? comandoOmitido() : comandoPublicado() };
    }

    const draft = crearComandoActivacion(evento, nuevaClaveComando());
    const metadata: AlarmCommandPublishMetadata = {
      incidente: {
        clave_idempotencia: idempotencyKey,
        evento,
        origen,
        titulo: TITULO_ALARMA_MANUAL,
        mensaje: MENSAJE_ALARMA_MANUAL,
        severidad: SEVERIDAD_ALARMA_MANUAL,
      },
    };

    // La RPC del backend es la única escritora de esta ruta: persiste la
    // alarma y su outbox en una transacción antes de publicar el comando.
    const resultado = await this.publicarComando(draft, metadata, null, 'activación');
    const alarma = resultado?.alarma === undefined ? null : normalizarIncidenteAlarma(resultado.alarma);
    if (alarma === null) {
      throw new Error('INVALID_ALARM_RESPONSE');
    }

    return { ...alarma, comandoMqtt: comandoPublicado() };
  }

  async getActiveAlarms(): Promise<ManualAlarmRecord[]> {
    const client = this.supabase.client;

    if (!client) {
      throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    const { data, error } = await client.functions.invoke<ConsultarAlarmasResponse>('consultar-alarma-activa', {
      method: 'GET',
    });

    if (error) {
      throw error;
    }

    if (!data || data.status !== 'SUCCESS' || !Array.isArray(data.alarmas)) {
      throw new Error('INVALID_ALARM_RESPONSE');
    }

    return data.alarmas
      .map((crudo: unknown) => normalizarIncidenteAlarma(crudo))
      .filter((alarma): alarma is ManualAlarmRecord => alarma !== null);
  }

  async finalize(alarmId: string, evento?: AlarmaIncidente | null): Promise<ManualAlarmOperationResult> {
    const client = this.supabase.client;

    if (!client) {
      throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(alarmId)) {
      throw new Error('INVALID_ALARM_ID');
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError || !sessionData.session) {
      throw new Error('UNAUTHENTICATED');
    }

    const { data, error } = await client.functions.invoke<FinalizeAlarmResponse>('finalizar-alarma-manual', {
      body: {
        alarma_id: alarmId,
      },
    });

    if (error) {
      throw error;
    }

    if (
      !data ||
      data.status !== 'FINALIZED' ||
      !data.alarma ||
      data.alarma.id !== alarmId ||
      data.alarma.estado !== 'finalizada'
    ) {
      throw new Error('INVALID_ALARM_RESPONSE');
    }

    const alarma = normalizarIncidenteAlarma(data.alarma);
    if (!alarma) {
      throw new Error('INVALID_ALARM_RESPONSE');
    }

    const alcance = evento === 'simulacro' ? 'simulacro' : 'todas';
    const draft = crearComandoDesactivacion({ idempotencyKey: alarmId, alcance });
    const metadata: AlarmCommandPublishMetadata = { finalizacion: { alarma_id: alarmId } };

    const resultado = await this.publicarComando(draft, metadata, alarma, 'finalización');
    return { ...alarma, comandoMqtt: resultado === null ? comandoOmitido() : comandoPublicado() };
  }

  private async publicarComando(
    draft: AlarmCommandDraft,
    metadata: AlarmCommandPublishMetadata,
    alarmaConocida: ManualAlarmRecord | null,
    accion: 'activación' | 'finalización',
  ): Promise<AlarmCommandPublishResult | null> {
    const gateway: AlarmCommandGateway | null = this.commandGateway ?? null;
    if (gateway === null) {
      return null;
    }

    const resultado = await gateway.publicar(draft, metadata);
    if (resultado.fase === 'error') {
      const detalle = resultado.error ?? 'FALLO_TRANSPORTE';
      const alarmaPersistida =
        resultado.alarma === undefined
          ? alarmaConocida
          : (normalizarIncidenteAlarma(resultado.alarma) ?? alarmaConocida);
      if (CODIGOS_PUBLICACION_PENDIENTE.has(detalle) && alarmaPersistida !== null) {
        throw new AlarmCommandPendingError(
          `La ${accion} quedó registrada, pero el comando MQTT no se publicó: ${detalle}`,
          alarmaPersistida,
        );
      }
      throw new Error(detalle);
    }
    return resultado;
  }
}
