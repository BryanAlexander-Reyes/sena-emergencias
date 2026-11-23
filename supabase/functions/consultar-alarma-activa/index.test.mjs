import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function handler({ configured = true, data = [], error = null } = {}) {
  let serve;
  const filters = [];
  const query = {
    select: () => query,
    eq: (key, value) => { filters.push([key, value]); return query; },
    order: () => query,
    limit: async () => ({ data, error }),
  };
  vm.runInNewContext(code, {
    Response, Set,
    Deno: { env: { get: name => configured && name !== 'CORS_ALLOWED_ORIGINS' ? 'configured' : '' }, serve: value => { serve = value; } },
    createClient: () => ({ from: name => { assert.equal(name, 'eventos_alarma_manual'); return query; } }),
  });
  return { serve, filters };
}
test('consulta pública limitada a alarmas manuales activas y sin datos privados', async () => {
  const { serve, filters } = handler({ data: [{ id: 'a', estado: 'activa', activado_por: 'private', clave_idempotencia: 'private' }] });
  const response = await serve(new Request('https://test/'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'SUCCESS');
  assert.equal(body.hay_alarma_activa, true);
  assert.equal(body.alarmas[0].evento, null);
  assert.equal('activado_por' in body.alarmas[0], false);
  assert.equal('clave_idempotencia' in body.alarmas[0], false);
  assert.deepEqual(filters, [['tipo', 'alarma_manual'], ['estado', 'activa']]);
});
test('rechaza orígenes no autorizados', async () => {
  const { serve } = handler();
  assert.equal((await serve(new Request('https://test/', { headers: { Origin: 'https://untrusted.test' } }))).status, 403);
});
test('responde al preflight Android y no permite escrituras', async () => {
  const { serve } = handler();
  assert.equal((await serve(new Request('https://test/', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } }))).status, 204);
  assert.equal((await serve(new Request('https://test/', { method: 'POST' }))).status, 405);
});
test('no simula ausencia de alarmas cuando faltan configuración o datos', async () => {
  for (const options of [{ configured: false }, { data: null, error: { code: 'failure' } }, { data: Array(1000).fill({}) }]) {
    assert.equal((await handler(options).serve(new Request('https://test/'))).status, 503);
  }
});
