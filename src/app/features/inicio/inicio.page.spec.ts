import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';

import { DemoSessionService } from '../../core/auth/demo-session.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../core/auth/testing/verified-session-test.util';
import { countActiveAlerts, getActiveCriticalAlert } from '../../core/data/demo-alerts';
import { DEMO_ZONES } from '../../core/data/demo-monitoring';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAlarmStateService } from '../../core/services/demo-alarm-state.service';

import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  let component: InicioPage;
  let fixture: ComponentFixture<InicioPage>;
  let verified: VerifiedTestIdentities;

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(InicioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
    expect(note.textContent).toContain('Solo Administradores e Instructores pueden controlar la alarma.');

    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.instructor);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.alarm-control__button')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.alarm-control__note')).toBeNull();
  });

  it('refleja reactivamente los cambios de alarma en Inicio', () => {
    const session = TestBed.inject(DemoSessionService);
    const alarm = TestBed.inject(DemoAlarmStateService);
    session.publishVerifiedIdentity(verified.administrador);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alarm-control__notice')?.getAttribute('data-scenario')).toBe('B');

    alarm.turnOn();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.alarm-control__status') as HTMLElement).textContent).toContain(
      'Alarma activada',
    );
    expect(fixture.nativeElement.querySelector('.alarm-control__notice')?.getAttribute('data-scenario')).toBe('D');
    expect((fixture.nativeElement.querySelector('.alarm-control__button') as HTMLElement).textContent).toContain(
      'Apagar alarma',
    );
  });

  it('muestra el diálogo de encendido con los textos y botones esperados', async () => {
    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
    const { createSpy, buttons } = mockConfirmation();

    await component.confirmTurnOn();

    const options = createSpy.mock.calls.at(0)?.at(0);
    expect(options?.header).toBe('Encender alarma');
    expect(options?.message).toBe('¿Deseas activar la alarma de demostración?');
    expect(buttons().map((button) => button.text)).toEqual(['Cancelar', 'Encender alarma']);
  });

  it('cancelar el diálogo no cambia el estado', async () => {
    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
    const alarm = TestBed.inject(DemoAlarmStateService);
    mockConfirmation();

    await component.confirmTurnOn();

    expect(alarm.isOn()).toBe(false);
  });

  it('ejecuta el encendido y el apagado al confirmar', async () => {
    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
    const alarm = TestBed.inject(DemoAlarmStateService);
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    buttons().at(1)?.handler?.();
    expect(alarm.isOn()).toBe(true);

    // Se reinicia el spy para la segunda confirmación.
    vi.restoreAllMocks();
    const { buttons: offButtons } = mockConfirmation();
    await component.confirmTurnOff();
    offButtons().at(1)?.handler?.();
    expect(alarm.isOn()).toBe(false);
  });

  it('revalúa el permiso si cambia el perfil durante la confirmación', async () => {
    const session = TestBed.inject(DemoSessionService);
    const alarm = TestBed.inject(DemoAlarmStateService);
    session.publishVerifiedIdentity(verified.administrador);
    const { buttons } = mockConfirmation();

    await component.confirmTurnOn();
    session.selectProfile('aprendiz');
    buttons().at(1)?.handler?.();

    expect(alarm.isOn()).toBe(false);
  });

  it('ignora pulsaciones rápidas mientras hay una confirmación abierta', async () => {
    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
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
