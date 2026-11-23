/** Requiere firmware con watermark durable y ACK; no adapta al protocolo viejo.
 * La DB solo bloquea durante la transacción SQL. Ningún bloqueo rodea MQTT.
 * Último estado gana; no garantiza latencia cero entre commit y sonido.
 */
export function crearDispatcherVersionado({ latest, send, versionedDeviceConfirmed = false }) {
  let running = null;
  let acknowledged = -1n;
  const drain = () => {
    if (running) return running;
    running = (async () => {
      if (!versionedDeviceConfirmed) throw new Error('VERSIONED_DEVICE_NOT_CONFIRMED');
      for (;;) {
        const command = await latest();
        if (!command || !/^\d+$/.test(String(command.version))) throw new Error('SOUND_STATE_UNAVAILABLE');
        const version = BigInt(command.version);
        if (version <= acknowledged) return;
        const ack = await send({ ...command.payload, sound_version: String(version) });
        if (!ack || String(ack.sound_version) !== String(version) || ack.executed !== true) throw new Error('SOUND_ACK_MISSING');
        acknowledged = version;
      }
    })().finally(() => { running = null; });
    return running;
  };
  return { drain };
}
