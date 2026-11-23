import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';

import { DemoSessionService } from '../../core/auth/demo-session.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../core/auth/testing/verified-session-test.util';
import { ALARM_INCIDENTES, type AlarmaIncidente } from '../../core/data/alarm-incident-contract';
import { countActiveAlerts, getActiveCriticalAlert } from '../../core/data/demo-alerts';
import { DEMO_ZONES } from '../../core/data/demo-monitoring';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAlarmStateService } from '../../core/services/demo-alarm-state.service';
import { ManualAlarmSyncService } from '../../core/services/manual-alarm-sync.service';
import {
  AlarmCommandPendingError,
  ManualAlarmService,
  type ManualAlarmOperationResult,
  type ManualAlarmRecord,
} from '../../core/services/manual-alarm.service';

import { InicioPage } from './inicio.page';

const ALARMA_PRUEBA: ManualAlarmRecord = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tipo: 'alarma_manual',
  titulo: '⚠️ PRECAUCIÓN',
  mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
  severidad: 'critical',
  fecha_activacion: '2026-11-23T12:00:00.000Z',
  estado: 'activa',
  evento: null,
  origen: 'cliente',
  eventoReportado: false,
};

const COMANDO_PUBLICADO = {
  fase: 'publicado',
  mensaje: 'Comando entregado al transporte MQTT. Sin confirmación física del ESP32.',
} as const;

class FakeManualAlarmService {
  readonly activaciones: { clave: string; evento?: AlarmaIncidente }[] = [];
  private activa: ManualAlarmRecord | null = null;
  errorAlActivar: Error | null = null;

  async getActiveAlarms(): Promise<ManualAlarmRecord[]> {
    return this.activa === null ? [] : [this.activa];
  }

  async activate(clave: string, evento?: AlarmaIncidente): Promise<ManualAlarmOperationResult> {
    this.activaciones.push({ clave, evento });
    const alarma: ManualAlarmRecord = {
      ...ALARMA_PRUEBA,
      id: `alarma-${this.activaciones.length}`,
      evento: evento ?? null,
      eventoReportado: evento !== undefined,
    };
    if (this.errorAlActivar !== null) throw this.errorAlActivar;
    this.activa = alarma;
    return { ...alarma, comandoMqtt: COMANDO_PUBLICADO };
  }

  async finalize(id: string): Promise<ManualAlarmOperationResult> {
    this.activa = null;
    return { ...ALARMA_PRUEBA, id, estado: 'finalizada', comandoMqtt: COMANDO_PUBLICADO };
  }

  reiniciar(): void {
    this.activa = null;
    this.errorAlActivar = null;
  }
}

describe('InicioPage', () => {
  let component: InicioPage;
  let fixture: ComponentFixture<InicioPage>;
  let verified: VerifiedTestIdentities;
  let manualAlarm: FakeManualAlarmService;

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    manualAlarm = new FakeManualAlarmService();
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideRouter([]), { provide: ManualAlarmService, useValue: manualAlarm }],
    }).compileComponents();

    fixture = TestBed.createComponent(InicioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no muestra avisos de configuración remota en modo DEMO', () => {
    expect(fixture.nativeElement.querySelector('.zone-status')).toBeNull();
  });

  it('should render the dashboard header and system status', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('SENA CROWD');
    expect(content).toContain('INTELLIGENCE');
    expect(content).toContain('MODO DEMOSTRACIÓN');
    expect(content).toContain('Panel de monitoreo');
    expect(content).toContain('Estado general del sistema');
    expect(content).not.toContain('Operativo');
    expect(content).toContain('DATOS SIMULADOS');
  });

  it('presenta el estado real usando solo la alerta crítica ya disponible', () => {
    const content = fixture.nativeElement.textContent as string;
    const status = fixture.nativeElement.querySelector('.dash-status') as HTMLElement;
    const label = fixture.nativeElement.querySelector('.dash-status__label') as HTMLElement;

    expect(label.textContent).toContain('Alerta crítica activa');
    expect(status.classList).toContain('dash-status--attention');
    expect(content).toContain('Alerta activa');
    expect(content).toContain('Pasillo principal');
  });

  it('should render four coherent metric cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('app-metric-card') as NodeListOf<HTMLElement>;
    const texts = Array.from(cards).map((card) => card.textContent?.replace(/\s+/g, ' ').trim());

    expect(cards.length).toBe(4);
    expect(texts[0]).toContain('Personas estimadas');
    expect(texts[0]).toContain('107');
    expect(texts[1]).toContain('Zonas monitoreadas');
    expect(texts[1]).toContain('4');
    expect(texts[2]).toContain('Alertas activas');
    expect(texts[2]).toContain('1');
    expect(texts[3]).toContain('Zona segura');
    expect(texts[3]).toContain('12');
  });

  it('should compute the total from the shared demo zones', () => {
    const sum = component.zones().reduce((total, zone) => total + zone.people, 0);

    expect(component.zones()).toBe(DEMO_ZONES);
    expect(sum).toBe(107);
    expect(component.totalPeople()).toBe(sum);
    expect(component.monitoredZones()).toBe(4);
    expect(component.activeAlerts()).toBe(1);
    expect(component.safeZonePeople()).toBe(12);
  });

  it('should derive the active alert from the shared alert state', () => {
    const alertsState = TestBed.inject(AlertsStateService);

    expect(component.activeAlert()).toBe(getActiveCriticalAlert());
    expect(component.activeAlert()).toBe(alertsState.activeCriticalAlert());
    expect(component.activeAlerts()).toBe(countActiveAlerts());
    expect(component.activeAlerts()).toBe(alertsState.activeAlerts());
    expect(component.activeAlerts()).toBe(1);
    expect(component.criticalZone()).toBe(DEMO_ZONES.find((zone) => zone.id === component.activeAlert()?.zoneId));
    expect(component.criticalZone()?.name).toBe('Pasillo principal');
    expect(component.activeAlert()?.zoneName).toBe('Pasillo principal');
  });

  const publicarOperador = (rol: 'administrador' | 'instructor'): void => {
    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified[rol]);
    fixture.detectChanges();
  };

  const seleccionarEvento = (evento: unknown): void => {
    const select = fixture.nativeElement.querySelector('#alarm-evento');
    expect(select).not.toBeNull();
    select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: evento } }));
    fixture.detectChanges();
  };

  const mockConfirmation = () => {
    const alertController = TestBed.inject(AlertController);
    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue(undefined),
    };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    return {
      createSpy,
      buttons: () =>
        (createSpy.mock.calls.at(0)?.at(0)?.buttons ?? []) as {
          text?: string;
          role?: string;
          handler?: () => void;
        }[],
    };
  };

  it('muestra el estado de la alarma pero no controles para perfiles de consulta', () => {
    const status = fixture.nativeElement.querySelector('.alarm-control__status') as HTMLElement;
    const note = fixture.nativeElement.querySelector('.alarm-control__note') as HTMLElement;

    expect(status.textContent).toContain('Alarma apagada');
    expect(fixture.nativeElement.querySelectorAll('.alarm-control__button')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('#alarm-evento')).toBeNull();
    expect(note.textContent).toContain('Solo Administradores e Instructores pueden controlar la alarma.');

    publicarOperador('instructor');

    expect(fixture.nativeElement.querySelectorAll('.alarm-control__button')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('#alarm-evento')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.alarm-control__note')).toBeNull();
  });

  it('refleja reactivamente los cambios de alarma en Inicio', () => {
    publicarOperador('administrador');
    const alarm = TestBed.inject(DemoAlarmStateService);

    expect(fixture.nativeElement.querySelector('.alarm-control__notice')?.getAttribute('data-scenario')).toBe('B');
    expect(fixture.nativeElement.querySelector('#alarm-evento')).not.toBeNull();

    alarm.turnOn();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.alarm-control__status') as HTMLElement).textContent).toContain(
      'Alarma activada',
    );
    expect(fixture.nativeElement.querySelector('.alarm-control__notice')?.getAttribute('data-scenario')).toBe('D');
    expect((fixture.nativeElement.querySelector('.alarm-control__button') as HTMLElement).textContent).toContain(
      'Apagar alarma',
    );
    expect(fixture.nativeElement.querySelector('#alarm-evento')).toBeNull();
  });

  it('muestra el selector con los cinco eventos para ambos operadores y ninguno para aprendiz', () => {
    expect(fixture.nativeElement.querySelector('#alarm-evento')).toBeNull();

    publicarOperador('administrador');
    const opciones = Array.from(
      fixture.nativeElement.querySelectorAll('#alarm-evento ion-select-option') as NodeListOf<HTMLElement>,
    ).map((opcion) => opcion.textContent?.trim());
    expect(opciones).toEqual([...ALARM_INCIDENTES]);

    publicarOperador('instructor');
    expect(fixture.nativeElement.querySelectorAll('#alarm-evento ion-select-option')).toHaveLength(5);

    TestBed.inject(DemoSessionService).selectProfile('aprendiz');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#alarm-evento')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.alarm-control__button')).toHaveLength(0);
  });

  it('exige selección explícita antes de abrir la confirmación de encendido', async () => {
    publicarOperador('administrador');
    const { createSpy } = mockConfirmation();

    await component.confirmTurnOn();

    expect(createSpy.mock.calls.at(0)?.at(0)?.header).toBe('Selecciona el tipo de alarma');
    expect(manualAlarm.activaciones).toHaveLength(0);
  });

  it('muestra el diálogo de encendido con los textos y botones esperados', async () => {
    publicarOperador('administrador');
    seleccionarEvento('incendio');
    const { createSpy, buttons } = mockConfirmation();

    await component.confirmTurnOn();

    const options = createSpy.mock.calls.at(0)?.at(0);
    expect(options?.header).toBe('Encender alarma');
    expect(options?.message).toBe('¿Deseas activar la alarma de demostración?');
    expect(buttons().map((button) => button.text)).toEqual(['Cancelar', 'Encender alarma']);
  });

  it('cancelar el diálogo no cambia el estado', async () => {
    publicarOperador('administrador');
    seleccionarEvento('incendio');
    const alarm = TestBed.inject(DemoAlarmStateService);
    mockConfirmation();

    await component.confirmTurnOn();

    expect(alarm.isOn()).toBe(false);
    expect(manualAlarm.activaciones).toHaveLength(0);
  });

  it('ejecuta el encendido y el apagado al confirmar con el evento elegido', async () => {
    publicarOperador('administrador');
    seleccionarEvento('incendio');
    const alarm = TestBed.inject(DemoAlarmStateService);
    const activateSpy = vi.spyOn(manualAlarm, 'activate');
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    buttons().at(1)?.handler?.();
    await vi.waitFor(() => expect(alarm.isOn()).toBe(true));

    expect(activateSpy).toHaveBeenCalledWith(expect.any(String), 'incendio');
    expect(component.eventoAlarma()).toBeNull();

    vi.restoreAllMocks();
    const { buttons: offButtons } = mockConfirmation();
    await component.confirmTurnOff();
    offButtons().at(1)?.handler?.();
    await vi.waitFor(() => expect(alarm.isOn()).toBe(false));
  });

  it('muestra que el comando MQTT publicado no confirma el buzzer físico', async () => {
    publicarOperador('administrador');
    seleccionarEvento('simulacro');
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    buttons().at(1)?.handler?.();
    await vi.waitFor(() => expect(component.comandoMqtt()?.fase).toBe('publicado'));
    fixture.detectChanges();

    const nota = fixture.nativeElement.querySelector('.alarm-control__mqtt') as HTMLElement;
    expect(nota.getAttribute('data-fase')).toBe('publicado');
    expect(nota.textContent).toContain('Sin confirmación física');
  });

  it('muestra estado pendiente sin afirmar que sonó el buzzer', async () => {
    publicarOperador('administrador');
    seleccionarEvento('simulacro');
    manualAlarm.errorAlActivar = new AlarmCommandPendingError('MQTT_NO_CONECTADO', ALARMA_PRUEBA);
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    buttons().at(1)?.handler?.();
    await vi.waitFor(() => expect(component.comandoMqtt()?.fase).toBe('pendiente'));
    fixture.detectChanges();

    const nota = fixture.nativeElement.querySelector('.alarm-control__mqtt') as HTMLElement;
    expect(nota.getAttribute('data-fase')).toBe('pendiente');
    expect(nota.textContent).toContain('no se publicó');
  });

  it('activa los cinco eventos para administrador e instructor', async () => {
    for (const rol of ['administrador', 'instructor'] as const) {
      for (const evento of ALARM_INCIDENTES) {
        manualAlarm.reiniciar();
        await TestBed.inject(ManualAlarmSyncService).refresh();
        component.activeManualAlarmId.set(null);
        publicarOperador(rol);
        component.seleccionarEventoAlarma(evento);
        const activateSpy = vi.spyOn(manualAlarm, 'activate');
        const { buttons } = mockConfirmation();

        await component.confirmTurnOn();
        buttons().at(1)?.handler?.();
        await vi.waitFor(() => expect(activateSpy).toHaveBeenCalled());

        expect(activateSpy).toHaveBeenCalledWith(expect.any(String), evento);
        expect(manualAlarm.activaciones.at(-1)?.evento).toBe(evento);
        expect(component.eventoAlarma()).toBeNull();

        TestBed.inject(DemoAlarmStateService).turnOff();
        fixture.detectChanges();
        vi.restoreAllMocks();
      }
    }

    expect(manualAlarm.activaciones).toHaveLength(10);
  });

  it('revalúa el permiso si cambia el perfil durante la confirmación', async () => {
    publicarOperador('administrador');
    seleccionarEvento('sismo');
    const session = TestBed.inject(DemoSessionService);
    const alarm = TestBed.inject(DemoAlarmStateService);
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    session.selectProfile('aprendiz');
    buttons().at(1)?.handler?.();
    await Promise.resolve();

    expect(alarm.isOn()).toBe(false);
    expect(manualAlarm.activaciones).toHaveLength(0);
    expect(component.eventoAlarma()).toBeNull();
  });

  it('ignora pulsaciones rápidas mientras hay una confirmación abierta', async () => {
    publicarOperador('administrador');
    seleccionarEvento('emergencia');
    const alertController = TestBed.inject(AlertController);
    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue(undefined),
    };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    await Promise.all([component.confirmTurnOn(), component.confirmTurnOn()]);

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('should render the monitoring summary', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('Resumen de monitoreo');
    expect(content).toContain('Ocupación crítica');
    expect(content).toContain('Pasillo principal');
    expect(content).toContain('Ocupación estimada del 84%.');
    expect(content).toContain('Información de demostración');
    expect(content).toContain('Ver zonas');
  });
});
