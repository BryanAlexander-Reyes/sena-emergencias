/** Carga variables locales de .env sin imprimir valores. No overwrites real env. */

import { existsSync, readFileSync } from 'node:fs';

export function cargarEntornoLocal(ruta = '.env', env = process.env) {
  if (!existsSync(ruta)) return env;

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!coincidencia) continue;

    const nombre = coincidencia[1];
    if (nombre in env) continue;

    let valor = coincidencia[2];
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    env[nombre] = valor;
  }

  return env;
}
