import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeEnvValue } from './generate-supabase-public-config.mjs';

// Literales exactos de @supabase/auth-js: codificación Base64URL y PKCE.
// No se ignoran contraseñas por longitud ni se aceptan coincidencias genéricas.
const ALPHABETS = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',
];
export function scanText(text, secrets) {
  const results = [];
  for (const [variable, value] of Object.entries(secrets)) {
    if (!value) continue;
    let offset = text.indexOf(value);
    while (offset !== -1) {
      const standard = ALPHABETS.some(alphabet => ['"', "'", '`'].some(quote => {
        const literal = quote + alphabet + quote;
        let at = text.indexOf(literal);
        while (at !== -1) {
          if (offset >= at + 1 && offset + value.length <= at + 1 + alphabet.length) return true;
          at = text.indexOf(literal, at + literal.length);
        }
        return false;
      }));
      results.push({ variable, offset, classification: standard ? 'STANDARD_ALPHABET' : 'PRIVATE_VALUE_MATCH' });
      offset = text.indexOf(value, offset + value.length);
    }
  }
  return results;
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function main() {
  const secrets = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z_]+)\s*=(.*)$/.exec(line);
    if (match && /PASSWORD|PASSPHRASE|SERVICE_ROLE|SECRET|PRIVATE_KEY/.test(match[1])) {
      secrets[match[1]] = normalizeEnvValue(process.env[match[1]] ?? match[2]);
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (/PASSWORD|PASSPHRASE|SERVICE_ROLE|SECRET|PRIVATE_KEY/.test(key)) secrets[key] = value ?? '';
  }
  let failures = 0;
  const paths = files(process.argv[2] ?? 'www');
  for (const file of paths) {
    for (const finding of scanText(readFileSync(file, 'utf8'), secrets)) {
      console.log(JSON.stringify({ file, ...finding }));
      if (finding.classification === 'PRIVATE_VALUE_MATCH') failures++;
    }
  }
  console.log(JSON.stringify({ files: paths.length, privateMatches: failures, scope: 'configured environment values, not a complete secret audit' }));
  if (failures) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
