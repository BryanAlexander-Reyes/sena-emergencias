import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizarUrlSupabase } from './supabase-url.mjs';

test('normaliza rutas REST/Functions sin cambiar proyecto', () => {
  for (const path of ['', '/', '/rest/v1', '/functions/v1/?query=unused#fragment']) {
    assert.equal(normalizarUrlSupabase(`https://proyecto.supabase.co${path}`), 'https://proyecto.supabase.co');
  }
});
test('falla cerrado ante URL inválida, credenciales o HTTP público', () => {
  for (const url of ['', 'invalid', 'https://user:pass@proyecto.supabase.co', 'http://proyecto.supabase.co']) {
    assert.equal(normalizarUrlSupabase(url), '');
  }
  assert.equal(normalizarUrlSupabase('http://localhost:54321/rest/v1'), 'http://localhost:54321');
});
