import { TestBed } from '@angular/core/testing';

import { fixtureStreamPayload } from '../data/telemetry-fixtures';

import { TelemetryService } from './telemetry.service';

type SnapshotListener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly listeners = new Map<string, SnapshotListener[]>();
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: SnapshotListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emitSnapshot(data: string): void {
    for (const listener of this.listeners.get('snapshot') ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }

  close(): void {
    this.closed = true;
  }
}

describe('TelemetryService (Fase MQTT.2)', () => {
  const originalEventSource = globalThis.EventSource;
  let service: TelemetryService;

  const latest = (): FakeEventSource => FakeEventSource.instances[FakeEventSource.instances.length - 1];

  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource as unknown as typeof EventSource;
    TestBed.configureTestingModule({});
    service = TestBed.inject(TelemetryService);
  });

  afterEach(() => {
    service.stop();
    (globalThis as { EventSource?: unknown }).EventSource = originalEventSource;
  });

  it('debe partir de un estado vacío, sin valores simulados', () => {
    expect(service.snapshot().placa1.metricas).toBeNull();
    expect(service.snapshot().placa2.metricas).toBeNull();
    expect(service.stream()).toBeNull();
    expect(service.isDemo()).toBe(false);
    expect(service.isStale()).toBe(false);
  });

  it('debe compartir un único EventSource entre consumidores', () => {
    service.start();
    service.start();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toMatch(/\/api\/telemetry\/stream$/);
    expect(service.connectionStatus()).toBe('connecting');

    service.stop();
    expect(latest().closed).toBe(false);
    service.stop();
    expect(latest().closed).toBe(true);
    expect(service.connectionStatus()).toBe('idle');
  });

  it('debe aplicar snapshots válidos y exponer la marca demo', () => {
    service.start();
    latest().onopen?.();
    latest().emitSnapshot(JSON.stringify(fixtureStreamPayload()));

    expect(service.connectionStatus()).toBe('connected');
    expect(service.isDemo()).toBe(true);
    expect(service.snapshot().placa1.metricas?.placa).toBe('placa1');
    expect(service.snapshot().placa2.metricas?.placa).toBe('placa2');
    expect(service.lastUpdate()).not.toBeNull();
  });

  it('debe conservar el último estado ante JSON inválido o snapshots incompletos', () => {
    service.start();
    const valido = fixtureStreamPayload();
    latest().emitSnapshot(JSON.stringify(valido));
    latest().emitSnapshot('{ json roto');
    expect(service.error()).toContain('JSON inválido');

    latest().emitSnapshot(JSON.stringify({ snapshot: {}, demo: false, receivedAt: 'hoy' }));
    expect(service.error()).toContain('incompleto');

    expect(service.snapshot().placa1.metricas).toEqual(valido.snapshot.placa1.metricas);
  });

  it('debe marcar como obsoleta una telemetría antigua', () => {
    service.start();
    latest().emitSnapshot(JSON.stringify(fixtureStreamPayload('2020-01-01T00:00:00Z')));

    expect(service.isStale()).toBe(true);
  });

  it('debe informar de desconexiones sin borrar los datos conocidos', () => {
    service.start();
    latest().emitSnapshot(JSON.stringify(fixtureStreamPayload()));
    latest().onerror?.();

    expect(service.connectionStatus()).toBe('disconnected');
    expect(service.error()).toContain('Reintentando');
    expect(service.snapshot().placa1.metricas).not.toBeNull();
  });

  it('debe permitir reconectar sin crear dos conexiones activas', () => {
    service.start();
    const primera = latest();
    service.reconnect();

    expect(primera.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latest().closed).toBe(false);
  });
});
