import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TELEMETRY_BASE_URL,
  generateTelemetryConfig,
  normalizeTelemetryBaseUrl,
  parseTelemetryEnvFile,
  resolveTelemetryBaseUrl,
} from './generate-telemetry-config.mjs';

test('la URL por defecto apunta al receptor local', () => {
  assert.equal(normalizeTelemetryBaseUrl(''), DEFAULT_TELEMETRY_BASE_URL);
});

test('normaliza HTTPS pública con barra final', () => {
  assert.equal(normalizeTelemetryBaseUrl('https://telemetria.ejemplo.com/'), 'https://telemetria.ejemplo.com');
});

test('acepta HTTP solo para desarrollo local', () => {
  assert.equal(normalizeTelemetryBaseUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
});

test('rechaza credenciales incrustadas', () => {
  assert.throws(() => normalizeTelemetryBaseUrl('https://user:pass@telemetria.ejemplo.com'), /credenciales/);
});

test('rechaza rutas, query y fragmentos', () => {
  assert.throws(() => normalizeTelemetryBaseUrl('https://telemetria.ejemplo.com/api'), /origen/);
  assert.throws(() => normalizeTelemetryBaseUrl('https://telemetria.ejemplo.com/?x=1'), /origen/);
  assert.throws(() => normalizeTelemetryBaseUrl('https://telemetria.ejemplo.com/#x'), /origen/);
});

test('lee solo TELEMETRY_BASE_URL del .env y respeta el entorno del proceso', () => {
  const contents = [
    'MQTT_PASSWORD=secreto-que-no-debe-aparecer',
    "TELEMETRY_BASE_URL='https://telemetria.ejemplo.com/'",
  ].join('\n');

  assert.equal(parseTelemetryEnvFile(contents), 'https://telemetria.ejemplo.com/');
  assert.equal(resolveTelemetryBaseUrl({ env: {}, envFileContents: contents }), 'https://telemetria.ejemplo.com/');
  assert.equal(
    resolveTelemetryBaseUrl({
      env: { TELEMETRY_BASE_URL: 'https://produccion.ejemplo.com' },
      envFileContents: contents,
    }),
    'https://produccion.ejemplo.com',
  );
});

test('el archivo generado no contiene secretos del .env', () => {
  const resultado = generateTelemetryConfig({
    env: {},
    envFileContents: 'MQTT_PASSWORD=secreto\nTELEMETRY_BASE_URL=https://telemetria.ejemplo.com',
  });

  assert.equal(resultado.baseUrl, 'https://telemetria.ejemplo.com');
  assert.match(resultado.output, /export const TELEMETRY_BASE_URL = 'https:\/\/telemetria\.ejemplo\.com';/);
  assert.doesNotMatch(resultado.output, /secreto/);
});
