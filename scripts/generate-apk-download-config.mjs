/**
 * Genera la URL HTTPS de la APK Android oficial para el botón de descarga web.
 *
 * Solo lee `APK_DOWNLOAD_URL` del entorno o de `.env`. Sin URL publicada el
 * botón queda deshabilitado con "Próximamente disponible". Nunca se debe
 * configurar aquí una APK debug: solo la versión oficial publicada por HTTPS.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = resolve(ROOT, '.env');
export const OUTPUT_FILE = resolve(ROOT, 'src/environments/apk-download.config.generated.ts');
export const APK_URL_KEY = 'APK_DOWNLOAD_URL';
export const DEFAULT_APK_DOWNLOAD_URL = '';

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

/** Lee únicamente `APK_DOWNLOAD_URL` de un contenido `.env`. */
export function parseApkEnvFile(contents) {
  for (const line of String(contents ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match && match[1] === APK_URL_KEY) {
      return normalizeEnvValue(match[2]);
    }
  }

  return '';
}

export function readApkEnvFile(path = ENV_FILE) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Las variables del proceso (CI / publicación) tienen prioridad sobre `.env`. */
export function resolveApkDownloadUrl({ env = process.env, envFileContents = readApkEnvFile() } = {}) {
  const fromEnv = env[APK_URL_KEY];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;

  return parseApkEnvFile(envFileContents);
}

/**
 * Valida la URL de la APK. Solo HTTPS (una descarga HTTP sería insegura),
 * sin credenciales incrustadas y sin fragmento. Se admite ruta y query porque
 * una APK real publicada puede vivir en una ruta o URL firmada.
 * Vacío es válido: significa que todavía no hay APK oficial publicada.
 */
export function normalizeApkDownloadUrl(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return DEFAULT_APK_DOWNLOAD_URL;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${APK_URL_KEY}: URL no válida.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${APK_URL_KEY}: solo se admite HTTPS para la APK oficial.`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`${APK_URL_KEY}: no se admiten credenciales en la URL.`);
  }

  if (parsed.hash !== '') {
    throw new Error(`${APK_URL_KEY}: no se admite fragmento en la URL.`);
  }

  return parsed.href;
}

export function renderApkDownloadConfig(url) {
  const literal = String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return [
    '// Archivo generado automáticamente desde APK_DOWNLOAD_URL. No editar ni versionar.',
    `export const APK_DOWNLOAD_URL = '${literal}';`,
    '',
  ].join('\n');
}

export function generateApkDownloadConfig(options) {
  const url = normalizeApkDownloadUrl(resolveApkDownloadUrl(options));
  return { url, output: renderApkDownloadConfig(url) };
}

function main() {
  const { url, output } = generateApkDownloadConfig();
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, output, 'utf8');

  if (url) {
    console.log(`[apk] Descarga oficial configurada en ${url}`);
  } else {
    console.log('[apk] Sin APK oficial publicada: el botón mostrará "Próximamente disponible".');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
