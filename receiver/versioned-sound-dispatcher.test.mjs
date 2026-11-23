import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearDispatcherVersionado } from './versioned-sound-dispatcher.mjs';
test('dos solicitudes concurrentes se ordenan y los duplicados no se reproducen', async () => {
  let state = { version: '1', payload: { action: true, evento: 'incendio' } };
  const sent = [];
  const dispatcher = crearDispatcherVersionado({ versionedDeviceConfirmed: true, latest: async () => state,
    send: async payload => {
      sent.push(payload);
      if (payload.sound_version === '1') state = { version: '2', payload: { action: true, evento: 'sismo' } };
      return { sound_version: payload.sound_version, executed: true };
    } });
  await Promise.all([dispatcher.drain(), dispatcher.drain()]);
  await dispatcher.drain();
  assert.deepEqual(sent.map(item => item.sound_version), ['1', '2']);
  assert.ok(sent.every(item => item.action));
});
test('fallos de estado, desconexión o ACK faltante nunca se confirman', async () => {
  for (const failure of ['state', 'mqtt', 'ack']) {
    const dispatcher = crearDispatcherVersionado({ versionedDeviceConfirmed: true,
      latest: async () => { if (failure === 'state') throw Error('DB'); return { version: '1', payload: { action: false } }; },
      send: async () => { if (failure === 'mqtt') throw Error('MQTT'); return null; } });
    await assert.rejects(dispatcher.drain());
  }
});
test('no envía versiones a firmware antiguo sin confirmación explícita', async () => {
  let sent = false;
  const dispatcher = crearDispatcherVersionado({ latest: async () => null, send: async () => { sent = true; } });
  await assert.rejects(dispatcher.drain(), /VERSIONED_DEVICE_NOT_CONFIRMED/);
  assert.equal(sent, false);
});
