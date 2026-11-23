import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generatePublicConfig, PLACEHOLDERS, resolvePublicValues, validatePublicConfig } from './generate-supabase-public-config.mjs';

const VALID_URL = 'https://proyecto-qa.supabase.co';
const VALID_KEY = 'sb_publishable_TEST_VALIDA_123';

describe('generador de configuración pública de Supabase', () => {
  it('acepta configuración válida y prioriza las variables del proceso sobre .env', () => {
    const values = resolvePublicValues({
      env: { SUPABASE_URL: `${VALID_URL}/`, SUPABASE_PUBLISHABLE_KEY: VALID_KEY },
      envFileContents:
        'SUPABASE_URL=https://valor-del-archivo.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_DE_ARCHIVO',
    });
    const result = generatePublicConfig({
      env: { SUPABASE_URL: `${VALID_URL}/`, SUPABASE_PUBLISHABLE_KEY: VALID_KEY },
      envFileContents: '',
    });

    assert.deepEqual(values, { supabaseUrl: `${VALID_URL}/`, supabasePublishableKey: VALID_KEY });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.config, { supabaseUrl: VALID_URL, supabasePublishableKey: VALID_KEY });
    assert.match(result.output, new RegExp(`supabaseUrl: '${VALID_URL.replaceAll('.', '\\.')}'`));
    assert.match(result.output, new RegExp(`supabasePublishableKey: '${VALID_KEY}'`));
  });

  it('genera marcadores y falla la validación cuando no hay configuración', () => {
    const result = generatePublicConfig({ env: {}, envFileContents: '' });

    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /SUPABASE_URL: variable ausente/);
    assert.match(result.errors[1], /SUPABASE_PUBLISHABLE_KEY: variable ausente/);
    assert.deepEqual(result.config, PLACEHOLDERS);
    assert.match(result.output, /https:\/\/REEMPLAZAR\.supabase\.co/);
    assert.match(result.output, /sb_publishable_REEMPLAZAR_AQUI/);
  });

  it('rechaza marcadores REEMPLAZAR aunque el resto del formato sea correcto', () => {
    const result = validatePublicConfig({
      supabaseUrl: PLACEHOLDERS.supabaseUrl,
      supabasePublishableKey: PLACEHOLDERS.supabasePublishableKey,
    });

    assert.equal(result.valid, false);
    assert.match(result.errors[0], /marcador REEMPLAZAR/);
    assert.match(result.errors[1], /marcador REEMPLAZAR/);
  });

  it('normaliza una URL con ruta o parámetros a la URL base del proyecto', () => {
    const result = validatePublicConfig({
      supabaseUrl: 'https://proyecto-qa.supabase.co/rest/v1?x=1',
      supabasePublishableKey: VALID_KEY,
    });

    assert.equal(result.valid, true);
    assert.equal(result.config.supabaseUrl, VALID_URL);
  });

  for (const url of [
    'http://proyecto.supabase.co',
    'https://usuario@proyecto.supabase.co',
    'https://proyecto.ejemplo.com',
  ]) {
    it(`rechaza URL inválida sin revelarla en el error: ${url}`, () => {
      const result = validatePublicConfig({ supabaseUrl: url, supabasePublishableKey: VALID_KEY });

      assert.equal(result.valid, false);
      assert.match(result.errors[0], /SUPABASE_URL: debe ser HTTPS/);
      assert.equal(result.errors.some((error) => error.includes(url)), false);
    });
  }

  for (const key of [
    'sb_publishable_REEMPLAZAR_AQUI',
    'sb_secret_privada',
    'eyJhbGciOiJIUzI1NiJ9.payload.firma',
    'sb_publishable_',
    'service_role_key',
    '',
  ]) {
    it(`rechaza clave inválida: ${key || '<vacía>'}`, () => {
      const result = validatePublicConfig({ supabaseUrl: VALID_URL, supabasePublishableKey: key });

      assert.equal(result.valid, false);
      assert.equal(result.errors.some((error) => /SUPABASE_PUBLISHABLE_KEY:/.test(error)), true);
    });
  }

  it('no escribe una clave inválida en el archivo generado', () => {
    const invalidKey = 'sb_secret_privada_123';
    const result = generatePublicConfig({
      env: { SUPABASE_URL: VALID_URL, SUPABASE_PUBLISHABLE_KEY: invalidKey },
      envFileContents: '',
    });

    assert.equal(result.valid, false);
    assert.equal(result.output.includes(invalidKey), false);
    assert.match(result.output, /sb_publishable_REEMPLAZAR_AQUI/);
  });

  it('nunca incluye secretos del entorno en el archivo generado', () => {
    const result = generatePublicConfig({
      env: {
        SUPABASE_URL: VALID_URL,
        SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
        SUPABASE_SERVICE_ROLE_KEY: 'secreto_que_no_debe_aparecer',
      },
      envFileContents: '',
    });

    assert.equal(result.valid, true);
    assert.equal(result.output.includes('secreto_que_no_debe_aparecer'), false);
    assert.equal(result.output.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    assert.equal(result.output.includes('service_role'), false);
  });
});
