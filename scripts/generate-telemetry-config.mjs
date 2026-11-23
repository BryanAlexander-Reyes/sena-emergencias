/**
 * Genera la URL pública del receptor de telemetría para web y APK.
 *
 * Solo lee `TELEMETRY_BASE_URL` del entorno o de `.env`. Nunca lee ni escribe
 * credenciales MQTT: esas viven exclusivamente en el proceso del receptor.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = resolve(ROOT, '.env');
export const OUTPUT_FILE = resolve(ROOT, 'src/environments/telemetry.config.generated.ts');
export const TELEMETRY_URL_KEY = 'TELEMETRY_BASE_URL';
export const DEFAULT_TELEMETRY_BASE_URL = 'http://localhost:3000';

/** Normaliza un valor de .env sin exponer otras variables. */
export function normalizeEnvValue(rawValue) {
  const trimmed = String(rawValue ?? '')
    .trim()
    .replace(/\s+#.*$/, '')
    .trim();

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/** Lee únicamente `TELEMETRY_BASE_URL` de un contenido `.env`. */
export function parseTelemetryEnvFile(contents) {
  for (const line of String(contents ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match && match[1] === TELEMETRY_URL_KEY) {
      return normalizeEnvValue(match[2]);
    }
  }

  return '';
}

export function readTelemetryEnvFile(path = ENV_FILE) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Las variables del proceso (CI / Vercel / compilación APK) tienen prioridad sobre `.env`. */
export function resolveTelemetryBaseUrl({ env = process.env, envFileContents = readTelemetryEnvFile() } = {}) {
  const fromEnv = env[TELEMETRY_URL_KEY];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;

  return parseTelemetryEnvFile(envFileContents);
}

/**
 * Valida y normaliza la URL base. Se rechazan credenciales incrustadas,
 * rutas adicionales, query y fragmento; la barra final se elimina porque el
 * servicio añade `/api/telemetry/stream`.
 */
export function normalizeTelemetryBaseUrl(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return DEFAULT_TELEMETRY_BASE_URL;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${TELEMETRY_URL_KEY}: URL no válida.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${TELEMETRY_URL_KEY}: solo se admite http o https.`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`${TELEMETRY_URL_KEY}: no se admiten credenciales en la URL.`);
  }

  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error(`${TELEMETRY_URL_KEY}: solo se admite el origen (esquema + host + puerto).`);
  }

  return parsed.origin;
}

export function renderTelemetryConfig(baseUrl) {
  const literal = String(baseUrl).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return [
    '// Archivo generado automáticamente desde TELEMETRY_BASE_URL. No editar ni versionar.',
    `export const TELEMETRY_BASE_URL = '${literal}';`,
    '',
  ].join('\n');
}

export function generateTelemetryConfig(options) {
  const baseUrl = normalizeTelemetryBaseUrl(resolveTelemetryBaseUrl(options));
  return { baseUrl, output: renderTelemetryConfig(baseUrl) };
}

function main() {
  const { baseUrl, output } = generateTelemetryConfig();
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, output, 'utf8');
  console.log(`[telemetry] Receptor configurado en ${baseUrl}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
