/**
 * URL base del receptor de telemetría MQTT (Fase MQTT.2).
 *
 * Durante `ng serve`, `ng build` y `ng test` este archivo se sustituye por
 * `telemetry.config.generated.ts`, generado desde la variable pública
 * `TELEMETRY_BASE_URL`. El valor versionado solo sirve para desarrollo local
 * en el mismo equipo donde corre el receptor.
 *
 * Para la APK, definir `TELEMETRY_BASE_URL=https://...` antes de compilar:
 * `localhost` apunta al propio dispositivo Android y no al receptor.
 */
export const TELEMETRY_BASE_URL = 'http://localhost:3000';
