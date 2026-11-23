import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comandoParaAlarmasActivas } from './alarm-sound-policy.mjs';
test('no apaga el buzzer mientras queda otra emergencia y prioriza incendio', () => {
  assert.deepEqual(comandoParaAlarmasActivas([{ id: 'b', evento: 'sismo' }, { id: 'a', evento: 'incendio' }]), { action: true, evento: 'incendio' });
  assert.deepEqual(comandoParaAlarmasActivas([{ id: 'b', evento: 'sismo' }]), { action: true, evento: 'sismo' });
});
test('solo propone apagar todas cuando no quedan incidentes', () => {
  assert.deepEqual(comandoParaAlarmasActivas([]), { action: false, alcance: 'todas' });
});
