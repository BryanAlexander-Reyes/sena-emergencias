/**
 * Endpoint del backend autorizado de comandos MQTT.
 *
 * Se deriva del receptor para no introducir un segundo sistema de transporte.
 * El cliente Ionic nunca recibe credenciales MQTT: solo envía el JWT al backend.
 */

import { TELEMETRY_BASE_URL } from './telemetry.config';

export function construirEndpointComandosAlarma(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/alarm/command`;
}

export const ALARM_COMMAND_ENDPOINT = construirEndpointComandosAlarma(TELEMETRY_BASE_URL);
