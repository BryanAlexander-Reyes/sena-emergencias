import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env');
const OUTPUT_DIR = resolve(ROOT, 'src/environments');
export const OUTPUT_FILE = resolve(OUTPUT_DIR, 'supabase-public.config.generated.ts');

const URL_KEY = 'SUPABASE_URL';
const PUBLISHABLE_KEY_KEY = 'SUPABASE_PUBLISHABLE_KEY';
export const PLACEHOLDERS = Object.freeze({
  supabaseUrl: 'https://REEMPLAZAR.supabase.co',
  supabasePublishableKey: 'sb_publishable_REEMPLAZAR_AQUI',
});

/** Normaliza un valor de .env sin exponerlo en mensajes. */
export function normalizeEnvValue(rawValue) {
  const trimmed = String(rawValue ?? '')
    .trim()
    .replace(/\s+#.*$/, '')
    .trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/** Lee solo las dos variables públicas de un contenido .env. */
export function parseEnvFile(contents) {
  const values = new Map();

  for (const line of String(contents ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match && (match[1] === URL_KEY || match[1] === PUBLISHABLE_KEY_KEY)) {
      values.set(match[1], normalizeEnvValue(match[2]));
    }
  }

  return values;
}

export function readEnvFile(path = ENV_FILE) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Resuelve la configuración: las variables del proceso (Vercel / CI / Android)
 * tienen prioridad sobre `.env` (desarrollo local). Nunca se leen secretos.
 */
export function resolvePublicValues({ env = process.env, envFileContents = readEnvFile() } = {}) {
  const fileValues = parseEnvFile(envFileContents);

  return {
    supabaseUrl: env[URL_KEY] ?? fileValues.get(URL_KEY) ?? '',
    supabasePublishableKey: env[PUBLISHABLE_KEY_KEY] ?? fileValues.get(PUBLISHABLE_KEY_KEY) ?? '',
  };
}

export function toProjectBaseUrl(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (
      parsed.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return null;
    }

    // Se normaliza a la URL base del proyecto; se descartan ruta/query/fragmento.
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isValidPublishableKey(value) {
  const trimmed = String(value ?? '').trim();

  return Boolean(trimmed) && /^sb_publishable_[A-Za-z0-9_.-]+$/.test(trimmed);
}

/**
 * Valida sin imprimir valores. Los mensajes solo nombran la variable y el
 * problema, nunca su contenido.
 */
export function validatePublicConfig(values = {}) {
  const url = String(values.supabaseUrl ?? '').trim();
  const key = String(values.supabasePublishableKey ?? '').trim();
  const errors = [];

  if (!url) {
    errors.push(`${URL_KEY}: variable ausente.`);
  } else if (url === PLACEHOLDERS.supabaseUrl || /REEMPLAZAR/i.test(url)) {
    errors.push(`${URL_KEY}: el marcador REEMPLAZAR no es una configuración válida.`);
  } else if (toProjectBaseUrl(url) === null) {
    errors.push(`${URL_KEY}: debe ser HTTPS de un proyecto *.supabase.co, sin credenciales en la URL.`);
  }

  if (!key) {
    errors.push(`${PUBLISHABLE_KEY_KEY}: variable ausente.`);
  } else if (key === PLACEHOLDERS.supabasePublishableKey || /REEMPLAZAR/i.test(key)) {
    errors.push(`${PUBLISHABLE_KEY_KEY}: el marcador REEMPLAZAR no es una configuración válida.`);
  } else if (/service_role/i.test(key) || /^eyJ/.test(key)) {
    errors.push(`${PUBLISHABLE_KEY_KEY}: no se aceptan credenciales privadas.`);
  } else if (!isValidPublishableKey(key)) {
    errors.push(`${PUBLISHABLE_KEY_KEY}: formato inválido; se espera sb_publishable_...`);
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    config: {
      supabaseUrl: valid ? toProjectBaseUrl(url) : PLACEHOLDERS.supabaseUrl,
      supabasePublishableKey: valid ? key : PLACEHOLDERS.supabasePublishableKey,
    },
  };
}

function toTsLiteral(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function renderPublicConfig(config) {
  return [
    '// Archivo generado automáticamente desde variables públicas de entorno. No editar ni versionar.',
    'export const supabasePublicConfig = {',
    `  supabaseUrl: ${toTsLiteral(config.supabaseUrl)},`,
    `  supabasePublishableKey: ${toTsLiteral(config.supabasePublishableKey)},`,
    '};',
    '',
  ].join('\n');
}

export function generatePublicConfig(options) {
  const result = validatePublicConfig(resolvePublicValues(options));

  return { ...result, output: renderPublicConfig(result.config) };
}

function main() {
  const requireValid = process.argv.includes('--require-valid');
  const { valid, errors, output } = generatePublicConfig();

  if (requireValid && !valid) {
    for (const error of errors) {
      console.error(`[supabase-public-config] ${error}`);
    }
    console.error('[supabase-public-config] Build detenido: configuración pública ausente o inválida.');
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, output, 'utf8');

  console.log(
    valid
      ? requireValid
        ? '[supabase-public-config] Configuración pública válida generada para el build.'
        : '[supabase-public-config] Configuración pública válida generada para desarrollo.'
      : '[supabase-public-config] Marcadores generados; configuración pública ausente o inválida.',
  );
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  main();
}
