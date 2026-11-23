import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_APK_DOWNLOAD_URL,
  generateApkDownloadConfig,
  normalizeApkDownloadUrl,
  parseApkEnvFile,
  resolveApkDownloadUrl,
} from './generate-apk-download-config.mjs';

test('sin URL publicada el valor queda vacío (botón deshabilitado)', () => {
  assert.equal(normalizeApkDownloadUrl(''), DEFAULT_APK_DOWNLOAD_URL);
  assert.equal(DEFAULT_APK_DOWNLOAD_URL, '');
});

test('acepta la APK oficial por HTTPS con ruta y query de URL firmada', () => {
  assert.equal(
    normalizeApkDownloadUrl('https://descargas.ejemplo.com/app/sena.apk'),
    'https://descargas.ejemplo.com/app/sena.apk',
  );
  assert.equal(
    normalizeApkDownloadUrl('https://cdn.ejemplo.com/sena.apk?token=abc'),
    'https://cdn.ejemplo.com/sena.apk?token=abc',
  );
});

test('rechaza HTTP, credenciales incrustadas y fragmentos', () => {
  assert.throws(() => normalizeApkDownloadUrl('http://descargas.ejemplo.com/sena.apk'), /HTTPS/);
  assert.throws(() => normalizeApkDownloadUrl('https://user:pass@descargas.ejemplo.com/sena.apk'), /credenciales/);
  assert.throws(() => normalizeApkDownloadUrl('https://descargas.ejemplo.com/sena.apk#x'), /fragmento/);
  assert.throws(() => normalizeApkDownloadUrl('no-es-una-url'), /URL no válida/);
});

test('lee solo APK_DOWNLOAD_URL del .env y respeta el entorno del proceso', () => {
  const contents = [
    'MQTT_PASSWORD=secreto-que-no-debe-aparecer',
    "APK_DOWNLOAD_URL='https://descargas.ejemplo.com/sena.apk'",
  ].join('\n');

  assert.equal(parseApkEnvFile(contents), 'https://descargas.ejemplo.com/sena.apk');
  assert.equal(resolveApkDownloadUrl({ env: {}, envFileContents: contents }), 'https://descargas.ejemplo.com/sena.apk');
  assert.equal(
    resolveApkDownloadUrl({
      env: { APK_DOWNLOAD_URL: 'https://produccion.ejemplo.com/oficial.apk' },
      envFileContents: contents,
    }),
    'https://produccion.ejemplo.com/oficial.apk',
  );
});

test('el archivo generado no contiene secretos del .env', () => {
  const resultado = generateApkDownloadConfig({
    env: {},
    envFileContents: 'MQTT_PASSWORD=secreto\nAPK_DOWNLOAD_URL=https://descargas.ejemplo.com/sena.apk',
  });

  assert.equal(resultado.url, 'https://descargas.ejemplo.com/sena.apk');
  assert.match(resultado.output, /export const APK_DOWNLOAD_URL = 'https:\/\/descargas\.ejemplo\.com\/sena\.apk';/);
  assert.doesNotMatch(resultado.output, /secreto/);
});

test('sin APK el archivo generado exporta cadena vacía', () => {
  const resultado = generateApkDownloadConfig({ env: {}, envFileContents: 'MQTT_PASSWORD=secreto' });

  assert.equal(resultado.url, '');
  assert.match(resultado.output, /export const APK_DOWNLOAD_URL = '';/);
});
