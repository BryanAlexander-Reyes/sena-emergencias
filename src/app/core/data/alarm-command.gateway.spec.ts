import { crearComandoActivacion, crearComandoDesactivacion } from './alarm-command-core';
import { HttpAlarmCommandGateway, crearCuerpoPublicacion, esEndpointPermitido } from './alarm-command.gateway';

describe('alarm command gateway — MQTT.3B', () => {
  it('adjunta el ID existente sin pedir un segundo incidente', () => {
    const body = crearCuerpoPublicacion(crearComandoActivacion('simulacro', 'on:test'), {
      activacion: { alarma_id: 'existing-alarm-id' },
    });
    expect(body.activacion).toEqual({ alarma_id: 'existing-alarm-id' });
    expect(body.incidente).toBeUndefined();
  });
  it('agrega evento/origen al cuerpo sin alterar el comando MQTT', () => {
    const activacion = crearComandoActivacion('incendio', 'act-1', '2026-11-23T12:00:00.000Z');
    expect(crearCuerpoPublicacion(activacion)).toEqual({
      idempotency_key: 'act-1',
      topic: 'sena/casanare/placa2/comandos/alarma',
      qos: 0,
      retain: false,
      comando: { action: true, evento: 'incendio' },
      origen: 'cliente',
      evento: 'incendio',
    });

    const desactivacion = crearComandoDesactivacion({ idempotencyKey: 'off-1' });
    const cuerpo = crearCuerpoPublicacion(desactivacion);
    expect(cuerpo.origen).toBe('cliente');
    expect(cuerpo).not.toHaveProperty('evento');
    expect(cuerpo.comando).toEqual({ action: false, alcance: 'todas' });
  });

  it('adjunta incidente y finalización como metadatos aditivos al comando', () => {
    const activacion = crearComandoActivacion('simulacro', 'act-3');
    const cuerpo = crearCuerpoPublicacion(activacion, {
      incidente: { clave_idempotencia: 'inc-3', evento: 'simulacro', origen: 'cliente' },
    });

    expect(cuerpo.incidente).toEqual({
      clave_idempotencia: 'inc-3',
      evento: 'simulacro',
      origen: 'cliente',
    });
    expect(cuerpo.comando).toEqual({ action: true, evento: 'simulacro' });
    expect(cuerpo).not.toHaveProperty('finalizacion');

    const apagado = crearComandoDesactivacion({ idempotencyKey: 'off-3', alcance: 'simulacro' });
    const cuerpoApagado = crearCuerpoPublicacion(apagado, { finalizacion: { alarma_id: 'alarma-3' } });

    expect(cuerpoApagado.finalizacion).toEqual({ alarma_id: 'alarma-3' });
    expect(cuerpoApagado).not.toHaveProperty('incidente');
    expect(cuerpoApagado.comando).toEqual({ action: false, alcance: 'simulacro' });
  });

  it('envía los metadatos al backend autorizado', async () => {
    const bodies: unknown[] = [];
    const fetchSimulado = (async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const gateway = new HttpAlarmCommandGateway({
      endpoint: 'http://localhost:3000/api/alarm/command',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: fetchSimulado,
    });

    await gateway.publicar(crearComandoActivacion('simulacro', 'act-4'), {
      finalizacion: { alarma_id: 'alarma-4' },
    });

    expect(bodies).toEqual([
      expect.objectContaining({
        idempotency_key: 'act-4',
        finalizacion: { alarma_id: 'alarma-4' },
        origen: 'cliente',
      }),
    ]);
  });

  it('enlaza el fetch global para evitar Illegal invocation en Android WebView', async () => {
    const fetchOriginal = globalThis.fetch;
    const receivers: unknown[] = [];
    globalThis.fetch = function (this: unknown) {
      receivers.push(this);
      return Promise.resolve(new Response(null, { status: 200 }));
    } as unknown as typeof fetch;
    try {
      const gateway = new HttpAlarmCommandGateway({
        endpoint: 'http://localhost:3000/api/alarm/command',
        obtainJwt: async () => 'jwt-de-sesion-real',
      });

      const resultado = await gateway.publicar(crearComandoActivacion('simulacro', 'act-bind'));

      expect(resultado.fase).toBe('publicado');
      expect(receivers.length).toBe(1);
      expect(receivers[0]).toBe(globalThis);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('solo admite HTTPS en producción y HTTP para el receptor local', () => {
    expect(esEndpointPermitido('https://backend.ejemplo.com/comandos')).toBe(true);
    expect(esEndpointPermitido('http://localhost:3000/comandos')).toBe(true);
    expect(esEndpointPermitido('http://127.0.0.1:3000/comandos')).toBe(true);
    expect(esEndpointPermitido('http://backend.ejemplo.com/comandos')).toBe(false);
    expect(esEndpointPermitido('ftp://backend.ejemplo.com')).toBe(false);
    expect(esEndpointPermitido('no es una url')).toBe(false);
  });

  it('envía JWT real y el cuerpo ampliado mediante fetch simulado', async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchSimulado = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const gateway = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: fetchSimulado,
    });

    const resultado = await gateway.publicar(crearComandoActivacion('simulacro', 'act-2'));

    expect(resultado.fase).toBe('publicado');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe('https://backend.ejemplo.com/comandos');
    expect(llamadas[0]?.init.method).toBe('POST');
    const headers = llamadas[0]?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-de-sesion-real');
    expect(JSON.parse(String(llamadas[0]?.init.body))).toMatchObject({
      origen: 'cliente',
      evento: 'simulacro',
    });
  });

  it('no envía nada sin JWT ni con un endpoint remoto inseguro', async () => {
    let llamadas = 0;
    const fetchSimulado = (async () => {
      llamadas += 1;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const sinToken = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => null,
      fetchImpl: fetchSimulado,
    });
    expect(await sinToken.publicar(crearComandoActivacion('sismo', 'sin-token'))).toEqual({
      fase: 'error',
      error: 'UNAUTHENTICATED',
    });

    const inseguro = new HttpAlarmCommandGateway({
      endpoint: 'http://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: fetchSimulado,
    });
    expect(await inseguro.publicar(crearComandoActivacion('sismo', 'inseguro'))).toEqual({
      fase: 'error',
      error: 'ENDPOINT_NO_SEGURO',
    });
    expect(llamadas).toBe(0);
  });

  it('acepta el receptor HTTP en la LAN privada y rechaza HTTP público o con credenciales', async () => {
    const fetchSimulado = (async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    const lan = new HttpAlarmCommandGateway({
      endpoint: 'http://192.168.40.12:3000/api/alarm/command',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: fetchSimulado,
    });
    expect(await lan.publicar(crearComandoActivacion('simulacro', 'lan-privada'))).toMatchObject({
      fase: 'publicado',
    });

    for (const endpoint of [
      'http://8.8.8.8:3000/api/alarm/command',
      'http://172.32.0.5:3000/api/alarm/command',
      'http://usuario:clave@192.168.40.12:3000/api/alarm/command',
    ]) {
      const rechazado = new HttpAlarmCommandGateway({
        endpoint,
        obtainJwt: async () => 'jwt-de-sesion-real',
        fetchImpl: fetchSimulado,
      });
      expect(await rechazado.publicar(crearComandoActivacion('simulacro', 'rechazado'))).toEqual({
        fase: 'error',
        error: 'ENDPOINT_NO_SEGURO',
      });
    }
  });

  it('informa errores HTTP y de transporte sin afirmar publicación', async () => {
    const gatewayHttp = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: (async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
    });
    expect(await gatewayHttp.publicar(crearComandoActivacion('impacto', 'http-401'))).toEqual({
      fase: 'error',
      error: 'HTTP_401',
    });

    const gatewayRed = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: (async () => {
        throw new Error('NETWORK_DOWN');
      }) as unknown as typeof fetch,
    });
    expect(await gatewayRed.publicar(crearComandoActivacion('impacto', 'sin-red'))).toEqual({
      fase: 'error',
      error: 'NETWORK_DOWN',
    });
  });

  it('propaga el código canónico del backend cuando viene en el cuerpo', async () => {
    const gateway = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: 'FORBIDDEN' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    });

    expect(await gateway.publicar(crearComandoActivacion('incendio', 'codigo-canonical'))).toEqual({
      fase: 'error',
      error: 'FORBIDDEN',
    });
  });

  it('devuelve la alarma persistida por la RPC en una publicación correcta', async () => {
    const alarma = { id: 'alarma-real', evento: 'simulacro' };
    const gateway = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ status: 'PUBLISHED', fase: 'publicado', alarma }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    });

    const resultado = await gateway.publicar(crearComandoActivacion('simulacro', 'con-alarma'));

    expect(resultado.fase).toBe('publicado');
    expect(resultado.alarma).toEqual(alarma);
  });

  it('devuelve la alarma persistida aunque el publish haya fallado', async () => {
    const alarma = { id: 'alarma-pendiente', evento: 'sismo' };
    const gateway = new HttpAlarmCommandGateway({
      endpoint: 'https://backend.ejemplo.com/comandos',
      obtainJwt: async () => 'jwt-de-sesion-real',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: 'MQTT_NO_DISPONIBLE', alarma }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    });

    expect(await gateway.publicar(crearComandoActivacion('sismo', 'publish-fallido'))).toEqual({
      fase: 'error',
      error: 'MQTT_NO_DISPONIBLE',
      alarma,
    });
  });
});
