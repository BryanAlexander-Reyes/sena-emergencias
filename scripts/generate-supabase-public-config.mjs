import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env');
const OUTPUT_DIR = resolve(ROOT, 'src/environments');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'supabase-public.config.generated.ts');

const URL_KEY = 'SUPABASE_URL';
const PUBLISHABLE_KEY_KEY = 'SUPABASE_PUBLISHABLE_KEY';
const PLACEHOLDER_URL = 'https://REEMPLAZAR.supabase.co';
const PLACEHOLDER_KEY = 'sb_publishable_REEMPLAZAR_AQUI';

function normalizeEnvValue(rawValue) {
  const trimmed = rawValue.trim().replace(/\s+#.*$/, '').trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readPublicValues() {
  let contents;

  try {
    contents = readFileSync(ENV_FILE, 'utf8');
  } catch {
    return null;
  }

  const values = new Map();

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match) {
      values.set(match[1], normalizeEnvValue(match[2]));
    }
  }

  return values;
}

function toProjectBaseUrl(value) {
  if (!value || value === PLACEHOLDER_URL) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return null;
    }

    // Descarta cualquier ruta/query/fragmento: solo se usa la URL base del proyecto.
    return parsed.origin;
  } catch {
    return null;
  }
}

function isValidPublishableKey(value) {
  return Boolean(value) && value !== PLACEHOLDER_KEY && /^sb_publishable_[A-Za-z0-9_.-]+$/.test(value);
}

function toTsLiteral(value) {
  // Las validaciones anteriores descartan comillas y barras invertidas.
  return `'${value}'`;
}

const values = readPublicValues();
const projectBaseUrl = toProjectBaseUrl(values?.get(URL_KEY) ?? '');
const publishableKey = values?.get(PUBLISHABLE_KEY_KEY) ?? '';
const hasValidPublicConfig = projectBaseUrl !== null && isValidPublishableKey(publishableKey);

const output = [
  '// Archivo generado automáticamente desde .env. No editar ni versionar.',
  'export const supabasePublicConfig = {',
  `  supabaseUrl: ${toTsLiteral(projectBaseUrl ?? PLACEHOLDER_URL)},`,
  `  supabasePublishableKey: ${toTsLiteral(hasValidPublicConfig ? publishableKey : PLACEHOLDER_KEY)},`,
  '};',
  '',
].join('\n');

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_FILE, output, 'utf8');

console.log(
  hasValidPublicConfig
    ? '[supabase-public-config] Configuración pública válida generada para desarrollo.'
    : '[supabase-public-config] Marcadores generados; configuración pública ausente o inválida.',
);
