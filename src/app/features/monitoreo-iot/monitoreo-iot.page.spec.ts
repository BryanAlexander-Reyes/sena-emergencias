import { computed, signal, type WritableSignal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { emptySnapshot, latestUpdateAt, type TelemetryStreamPayload } from '../../core/data/telemetry-core';
import { fixtureStreamPayload } from '../../core/data/telemetry-fixtures';
import { TelemetryService, type TelemetryConnectionStatus } from '../../core/services/telemetry.service';

import { MonitoreoIotPage } from './monitoreo-iot.page';

interface FakeTelemetry {
  starts: number;
  stops: number;
  reconnects: number;
  refreshes: number;
  readonly stream: WritableSignal<TelemetryStreamPayload | null>;
}

function fakeTelemetry(demo: boolean): FakeTelemetry {
  const stream = signal(fixtureStreamPayload(undefined, demo));
  const status = signal<TelemetryConnectionStatus>('connected');
  const error = signal<string | null>(null);
  const ahora = signal(Date.now());
  const fake: FakeTelemetry = {
    starts: 0,
    stops: 0,
    reconnects: 0,
    refreshes: 0,
    stream,
  };

  return Object.assign(fake, {
    snapshot: computed(() => stream()?.snapshot ?? emptySnapshot()),
    connectionStatus: status.asReadonly(),
    error: error.asReadonly(),
    isDemo: computed(() => stream()?.demo === true),
    isStale: computed(() => false),
    lastUpdate: computed(() => latestUpdateAt(stream()?.snapshot ?? emptySnapshot())),
    now: ahora.asReadonly(),
    start: () => {
      fake.starts += 1;
    },
    stop: () => {
      fake.stops += 1;
    },
    reconnect: () => {
      fake.reconnects += 1;
    },
    refreshFreshness: () => {
      fake.refreshes += 1;
    },
  });
}

describe('MonitoreoIotPage (Fase MQTT.2)', () => {
  let fixture: ComponentFixture<MonitoreoIotPage>;
  let telemetry: FakeTelemetry;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  function configure(demo: boolean): void {
    telemetry = fakeTelemetry(demo);

    TestBed.configureTestingModule({
      imports: [MonitoreoIotPage],
      providers: [provideRouter([]), { provide: TelemetryService, useValue: telemetry }],
    });

    fixture = TestBed.createComponent(MonitoreoIotPage);
    fixture.detectChanges();
  }

  it('debe crear la pantalla y mostrar dos secciones diferenciadas', () => {
    configure(true);

    const boards = Array.from(fixture.nativeElement.querySelectorAll('.iot-board')) as HTMLElement[];

    expect(boards).toHaveLength(2);
    expect(boards[0].getAttribute('data-placa')).toBe('placa1');
    expect(boards[1].getAttribute('data-placa')).toBe('placa2');
    expect(pageText()).toContain('ESP32 1 — Placa 1');
    expect(pageText()).toContain('ESP32 2 — Placa 2');
    expect(pageText()).toContain('Riesgo bajo · Sala riesgo_bajo');
    expect(pageText()).toContain('Riesgo alto · Sala riesgo_alto');
    expect(pageText()).toContain('Conectado al receptor');
  });

  it('debe identificar los datos de prueba de forma permanente', () => {
    configure(true);

    expect(pageText()).toContain('DATOS DE PRUEBA — NO LECTURAS FÍSICAS');
    expect(fixture.nativeElement.querySelector('.iot-demo')?.getAttribute('role')).toBe('alert');
  });

  it('no debe mostrar el aviso de pruebas cuando el stream no es demo', () => {
    configure(false);

    expect(fixture.nativeElement.querySelector('.iot-demo')).toBeNull();
  });

  it('debe mostrar sensores reales por placa sin métricas inexistentes de humedad ni buzzer', () => {
    configure(true);
    const text = pageText();

    expect(text).toContain('Temperatura DHT11');
    expect(text).toContain('Humedad DHT11');
    expect(text).toContain('Acelerómetro MPU');
    expect(text).toContain('Distancia ultrasónica');
    expect(text).toContain('Sensor IR de entrada');
    expect(text).toContain('Sensor IR de salida');
    expect(text).toContain('Detección incendio activa');
    expect(text).not.toContain('ESP2 no publica humedad en MQTT.');
    expect(text).not.toContain('Estado físico no disponible');
    expect(text).not.toContain('El firmware no publica este dato MQTT.');
    expect(text).not.toContain('no se publican comandos');
  });

  it('debe mostrar eventos recientes de cada placa', () => {
    configure(true);

    const eventos = Array.from(fixture.nativeElement.querySelectorAll('.iot-evento')) as HTMLElement[];

    expect(eventos).toHaveLength(2);
    expect(eventos[0].textContent).toContain('incendio');
    expect(eventos[1].textContent).toContain('incendio');
    expect(pageText()).toContain('El campo estado describe la detección; no confirma una alarma oficial.');
  });

  it('debe abrir y cerrar la suscripción con el ciclo de vida de la página', () => {
    configure(true);

    expect(telemetry.starts).toBe(1);
    expect(telemetry.stops).toBe(0);

    fixture.destroy();
    expect(telemetry.stops).toBe(1);
  });

  it('debe reconectar solo desde el botón explícito', () => {
    configure(true);
    const boton = fixture.nativeElement.querySelector('.iot-status__button') as HTMLButtonElement;

    boton.click();
    fixture.detectChanges();

    expect(telemetry.reconnects).toBe(1);
    expect(telemetry.refreshes).toBe(1);
  });
});
