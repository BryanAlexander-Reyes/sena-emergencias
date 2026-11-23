import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanText } from './scan-private-config.mjs';

test('clasifica solo alfabetos estándar completos, no una credencial literal', () => {
  const synthetic = 'bcdefg';
  const result = scanText('const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";const secret="bcdefg";', { MQTT_PASSWORD: synthetic });
  assert.deepEqual(result.map(item => item.classification), ['STANDARD_ALPHABET', 'PRIVATE_VALUE_MATCH']);
  assert.equal(JSON.stringify(result).includes(synthetic), false);
});
test('detecta credenciales aunque sean cortas o aparezcan varias veces', () => {
  assert.equal(scanText('"abc";"abc"', { SECRET: 'abc' }).filter(item => item.classification === 'PRIVATE_VALUE_MATCH').length, 2);
  assert.deepEqual(scanText('public configuration', { PASSWORD: '' }), []);
});
