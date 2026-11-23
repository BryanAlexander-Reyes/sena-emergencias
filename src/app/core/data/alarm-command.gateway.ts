/** Contrato del publicador de comandos. Sin credenciales, sin MQTT en el cliente. */

import { InjectionToken } from '@angular/core';

import type { AlarmCommandDraft, AlarmCommandFase } from './alarm-command-core';
import { esCodigoErrorAlarma, type AlarmaIncidente, type AlarmaOrigen } from './alarm-incident-contract';

export interface AlarmCommandPublishResult {
  readonly fase: Extract<AlarmCommandFase, 'publicado' | 'error'>;
  readonly publicadoEn?: string;
  readonly error?: string;
  /** Alarma persistida por la RPC del backend, incluso si el publish falló. */
  readonly alarma?: unknown;
}

interface CuerpoRespuestaComando {
  readonly error?: unknown;
  readonly alarma?: unknown;
}

async function leerCuerpoSeguro(respuesta: Response): Promise<CuerpoRespuestaComando | null> {
  try {
    const cuerpo: unknown = await respuesta.json();
    if (typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo)) {
      return cuerpo as CuerpoRespuestaComando;
    }
  } catch {
    // Respuesta sin cuerpo JSON: se conserva solo el estado HTTP.
  }
  return null;
}

/** Datos del incidente persistido y de la finalización, aditivos al comando MQTT. */
export interface AlarmCommandPublishMetadata {
  /** Encender una alarma ya registrada por la Edge Function, sin crear otra. */
  readonly activacion?: { readonly alarma_id: string };
  readonly incidente?: {
    readonly clave_idempotencia: string;
    readonly evento: AlarmaIncidente | null;
    readonly origen: AlarmaOrigen;
    readonly titulo?: string;
    readonly mensaje?: string;
    readonly severidad?: string;
  };
  readonly finalizacion?: {
    readonly alarma_id: string;
  };
}

/**
 * Cuerpo enviado al backend autorizado. `evento`/`origen` son aditivos: el
 * transporte MQTT sigue recibiendo solo `action/evento/alcance/motivo`.
 */
export interface AlarmCommandPublishRequest {
  readonly idempotency_key: string;
  readonly topic: string;
  readonly qos: 0;
  readonly retain: false;
  readonly comando: AlarmCommandDraft['payload'];
  readonly origen: AlarmaOrigen;
  readonly evento?: AlarmaIncidente;
  readonly incidente?: AlarmCommandPublishMetadata['incidente'];
  readonly activacion?: AlarmCommandPublishMetadata['activacion'];
  readonly finalizacion?: AlarmCommandPublishMetadata['finalizacion'];
}

export function crearCuerpoPublicacion(
  draft: AlarmCommandDraft,
  metadata: AlarmCommandPublishMetadata = {},
): AlarmCommandPublishRequest {
  return {
    idempotency_key: draft.idempotencyKey,
    topic: draft.topic,
    qos: draft.qos,
    retain: draft.retain,
    comando: draft.payload,
    origen: 'cliente',
    ...(draft.incidente === null ? {} : { evento: draft.incidente }),
    ...(metadata.incidente === undefined ? {} : { incidente: metadata.incidente }),
    ...(metadata.activacion === undefined ? {} : { activacion: metadata.activacion }),
    ...(metadata.finalizacion === undefined ? {} : { finalizacion: metadata.finalizacion }),
  };
}

/** IPv4 privada RFC1918: solo redes LAN de desarrollo, nunca Internet público. */
function esIpv4Privada(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octetos = hostname.split('.').map(Number);
  if (octetos.some((octeto) => octeto > 255)) return false;
  const [a, b] = octetos;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Producción siempre HTTPS. `http` se admite únicamente para el receptor de
 * desarrollo: loopback del mismo equipo o una IPv4 privada de la LAN (prueba
 * con teléfono físico). Nunca se acepta HTTP público ni credenciales en la URL.
 */
export function esEndpointPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.username !== '' || url.password !== '') return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || esIpv4Privada(url.hostname);
  } catch {
    return false;
  }
}

export interface AlarmCommandGateway {
  publicar(draft: AlarmCommandDraft, metadata?: AlarmCommandPublishMetadata): Promise<AlarmCommandPublishResult>;
}

export const ALARM_COMMAND_GATEWAY = new InjectionToken<AlarmCommandGateway>('ALARM_COMMAND_GATEWAY');

/**
 * Adaptador seguro por defecto: no abre sockets ni envía nada.
 * La integración real debe ser un backend autorizado que reciba el JWT del
 * usuario y use credenciales MQTT de publicación restringidas.
 */
export class NoopAlarmCommandGateway implements AlarmCommandGateway {
  async publicar(): Promise<AlarmCommandPublishResult> {
    return {
      fase: 'error',
      error: 'PUBLICADOR_NO_CONFIGURADO: se requiere backend autorizado y ACL de publicación EMQX.',
    };
  }
}

/** Adaptador HTTP preparado; no se usa hasta que exista la Edge Function autorizada. */
export interface HttpAlarmCommandGatewayOptions {
  readonly endpoint: string | null;
  readonly obtainJwt: () => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
}

export class HttpAlarmCommandGateway implements AlarmCommandGateway {
  private readonly endpoint: string | null;
  private readonly obtainJwt: () => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpAlarmCommandGatewayOptions) {
    this.endpoint = options.endpoint;
    this.obtainJwt = options.obtainJwt;
    // `fetch` exige el receiver global: guardarlo suelto y llamarlo como
    // this.fetchImpl(...) produce "Illegal invocation" en WebView/Android.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async publicar(
    draft: AlarmCommandDraft,
    metadata: AlarmCommandPublishMetadata = {},
  ): Promise<AlarmCommandPublishResult> {
    if (this.endpoint === null || this.endpoint.trim().length === 0) {
      return { fase: 'error', error: 'ENDPOINT_NO_CONFIGURADO' };
    }
    if (!esEndpointPermitido(this.endpoint)) {
      return { fase: 'error', error: 'ENDPOINT_NO_SEGURO' };
    }

    const token = await this.obtainJwt();
    if (token === null || token.length === 0) {
      return { fase: 'error', error: 'UNAUTHENTICATED' };
    }

    try {
      const respuesta = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(crearCuerpoPublicacion(draft, metadata)),
      });

      const cuerpo = await leerCuerpoSeguro(respuesta);
      const alarma = cuerpo?.alarma === undefined || cuerpo.alarma === null ? {} : { alarma: cuerpo.alarma };

      if (!respuesta.ok) {
        // C2: se prefiere el código canónico del cuerpo; HTTP_xxx es solo respaldo.
        const error = esCodigoErrorAlarma(cuerpo?.error) ? (cuerpo.error as string) : `HTTP_${respuesta.status}`;
        return { fase: 'error', error, ...alarma };
      }

      return { fase: 'publicado', publicadoEn: new Date().toISOString(), ...alarma };
    } catch (error) {
      return { fase: 'error', error: error instanceof Error ? error.message : 'NETWORK_DOWN' };
    }
  }
}
