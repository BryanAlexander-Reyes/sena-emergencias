/** Difusión SSE del snapshot a todos los clientes conectados (web y APK). */

export class SseHub {
  #clientes = new Set();
  #headers;

  constructor(headers = {}) {
    this.#headers = headers;
  }

  get size() {
    return this.#clientes.size;
  }

  add(response, initialPayload = null) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...this.#headers,
    });
    response.write('retry: 3000\n\n');
    if (initialPayload) this.send(response, initialPayload);

    const cliente = { response };
    this.#clientes.add(cliente);

    const remover = () => this.#clientes.delete(cliente);
    response.on('close', remover);
    response.on('error', remover);

    return remover;
  }

  send(response, payload) {
    if (!response.destroyed) {
      response.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  }

  broadcast(payload) {
    const trama = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const cliente of this.#clientes) {
      if (!cliente.response.destroyed) cliente.response.write(trama);
    }
  }

  heartbeat() {
    for (const cliente of this.#clientes) {
      if (!cliente.response.destroyed) cliente.response.write(': keepalive\n\n');
    }
  }

  closeAll() {
    for (const cliente of this.#clientes) cliente.response.end();
    this.#clientes.clear();
  }
}
