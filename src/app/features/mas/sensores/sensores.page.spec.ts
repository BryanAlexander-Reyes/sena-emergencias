import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';

import { DemoSessionService } from '../../../core/auth/demo-session.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../../core/auth/testing/verified-session-test.util';
import { AlertsStateService } from '../../../core/services/alerts-state.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';
import { SimulatedSensorsService } from '../../../core/services/simulated-sensors.service';

import { SensoresPage } from './sensores.page';

describe('SensoresPage (Fase 3.6)', () => {
  let component: SensoresPage;
  let fixture: ComponentFixture<SensoresPage>;
  let verified: VerifiedTestIdentities;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    await TestBed.configureTestingModule({
      imports: [SensoresPage],
      providers: [provideRouter([])],
    }).compileComponents();

    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
    fixture = TestBed.createComponent(SensoresPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render simulation environment, summary and device inventory', () => {
    const content = pageText();
    const cards = Array.from(fixture.nativeElement.querySelectorAll('.sensor-card')) as HTMLElement[];

    expect(content).toContain('ENTORNO DE SIMULACIÓN — SIN HARDWARE CONECTADO');
    expect(content).toContain('Sin hardware conectado');
    expect(content).toContain('Dispositivos simulados');
    expect(content).toContain('Simulaciones activas');
    expect(content).toContain('Simulaciones pausadas');
    expect(content).toContain('Fallos ficticios');
    expect(component.totalDevices()).toBe(3);
    expect(cards.length).toBe(3);
    expect(content).toContain('ESP32');
    expect(content).toContain('Sensor infrarrojo (IR)');
    expect(content).toContain('Sensor ultrasónico');
    expect(content).not.toContain('Sensor PIR 360°');
    expect(content).not.toContain('Matriz LED 8×8');
    expect(content).not.toContain('Servomotor');
  });

  it('conserva el contrato completo del servicio aunque la interfaz filtre tipos sin hardware', () => {
    const sensors = TestBed.inject(SimulatedSensorsService);

    expect(sensors.totalDevices()).toBe(6);
    expect(sensors.sensors().map((sensor) => sensor.type)).toEqual(
      expect.arrayContaining(['esp32', 'ir', 'ultrasonic', 'pir', 'led-matrix', 'servo']),
    );
  });

  it('should keep the accessible simulation summary and expandable cards', () => {
    const environment = fixture.nativeElement.querySelector('.sensor-env') as HTMLElement;
    const summary = fixture.nativeElement.querySelector('.sensor-summary') as HTMLElement;
    const list = fixture.nativeElement.querySelector('.sensor-list') as HTMLElement;
    const toggle = fixture.nativeElement.querySelector('.sensor-card__toggle') as HTMLButtonElement;

    expect(environment?.getAttribute('aria-label')).toBe('Aviso de simulación');
    expect(summary?.getAttribute('aria-label')).toBe('Resumen del simulador');
    expect(summary?.querySelectorAll('.sensor-summary__card')).toHaveLength(4);
    expect(list?.getAttribute('aria-label')).toBe('Dispositivos simulados');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('should show zone association and physical disconnection explicitly', () => {
    const content = pageText();

    expect(content).toContain('Zona: Pasillo principal');
    expect(content).toContain('Zona: Cafetería');
    expect(content).toContain('Zona: Biblioteca');
    expect(content).not.toContain('Zona: Punto de encuentro');
    expect(content).toContain('Hardware real: Sin conexión física');
  });

  it('should keep occupancy, alerts and statistics independent from sensor changes', () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);
    const sensors = TestBed.inject(SimulatedSensorsService);

    const peopleBefore = monitoring.totalPeople();
    const activeBefore = alerts.activeAlerts();

    expect(sensors.toggleIrDetection('ir-cafeteria')).toBe(true);
    expect(sensors.setUltrasonicDistance('ultrasonic-biblioteca', 80)).toBe(true);
    expect(sensors.setServoAngle('servo-cafeteria', 45)).toBe(false); // fault -> blocked
    expect(sensors.setSimulationState('servo-cafeteria', 'active')).toBe(true);
    expect(sensors.setServoAngle('servo-cafeteria', 45)).toBe(true);
    expect(sensors.cycleLedPattern('led-pasillo')).toBe(true);
    fixture.detectChanges();

    expect(monitoring.totalPeople()).toBe(peopleBefore);
    expect(alerts.activeAlerts()).toBe(activeBefore);
  });

  it('should reset a device and all devices to initial values', () => {
    const sensors = TestBed.inject(SimulatedSensorsService);

    sensors.setSimulationState('esp32-pasillo', 'paused');
    expect(sensors.resetDevice('esp32-pasillo')).toBe(true);
    expect(sensors.sensors().find((s) => s.id === 'esp32-pasillo')?.simulationState).toBe('active');

    sensors.toggleIrDetection('ir-cafeteria');
    expect(sensors.resetAll()).toBe(true);
    expect(sensors.sensors().find((s) => s.id === 'ir-cafeteria')?.reading).toBe(false);
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });

  it('muestra los controles y el reset con perfil administrador', () => {
    expect(component.canControlSensors()).toBe(true);
    expect(component.canResetSensors()).toBe(true);
    expect(fixture.nativeElement.querySelector('.sensor-actions')).toBeTruthy();
    expect(pageText()).not.toContain('no modificar sus simulaciones');
  });

  it('oculta el reset y bloquea todos los handlers para perfil de solo consulta', () => {
    const sensors = TestBed.inject(SimulatedSensorsService);
    const snapshot = JSON.stringify(sensors.sensors());

    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.instructor);
    fixture.detectChanges();

    expect(component.canControlSensors()).toBe(false);
    expect(component.canResetSensors()).toBe(false);
    expect(fixture.nativeElement.querySelector('.sensor-actions')).toBeNull();
    expect(pageText()).toContain('no modificar sus simulaciones');

    component.setState('esp32-pasillo', 'paused');
    component.toggleIr('ir-cafeteria');
    component.togglePir('pir-pasillo');
    component.setUltrasonic('ultrasonic-biblioteca', 10);
    component.setServo('servo-cafeteria', 30);
    component.setLed('led-pasillo', 'alerta');
    component.cycleLed('led-pasillo');
    component.resetDevice('esp32-pasillo');

    expect(JSON.stringify(sensors.sensors())).toBe(snapshot);
    expect(component.canControlReading(sensors.sensors()[1]!)).toBe(false);
  });

  it('aplica controles y reset de dispositivo con perfil administrador', () => {
    const sensors = TestBed.inject(SimulatedSensorsService);
    const get = (id: string) => sensors.sensors().find((sensor) => sensor.id === id);

    component.setState('esp32-pasillo', 'paused');
    expect(get('esp32-pasillo')?.simulationState).toBe('paused');

    component.toggleIr('ir-cafeteria');
    expect(get('ir-cafeteria')?.reading).toBe(true);

    component.setUltrasonic('ultrasonic-biblioteca', 80);
    expect(get('ultrasonic-biblioteca')?.reading).toBe(80);

    component.setState('servo-cafeteria', 'active');
    component.setServo('servo-cafeteria', 45);
    expect(get('servo-cafeteria')?.servoAngle).toBe(45);

    component.setLed('led-pasillo', 'alerta');
    expect(get('led-pasillo')?.ledPattern).toBe('alerta');

    component.resetDevice('esp32-pasillo');
    expect(get('esp32-pasillo')?.simulationState).toBe('active');
  });

  it('restablece todos los sensores al confirmar el diálogo con permiso vigente', async () => {
    const sensors = TestBed.inject(SimulatedSensorsService);
    const alertController = TestBed.inject(AlertController);
    const alert = { present: vi.fn().mockResolvedValue(undefined) };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    sensors.setSimulationState('esp32-pasillo', 'paused');
    await component.confirmResetAll();

    const options = createSpy.mock.calls.at(0)?.at(0);
    const buttons = options?.buttons as { role?: string; handler?: () => void }[] | undefined;
    const destructive = buttons?.find((button) => button.role === 'destructive');

    destructive?.handler?.();

    expect(sensors.sensors().find((sensor) => sensor.id === 'esp32-pasillo')?.simulationState).toBe('active');
    expect(sensors.sensors().find((sensor) => sensor.id === 'ultrasonic-biblioteca')?.reading).toBe(120);
  });

  it('revalida el permiso al ejecutar un reset pendiente en el diálogo', async () => {
    const sensors = TestBed.inject(SimulatedSensorsService);
    const alertController = TestBed.inject(AlertController);
    const alert = { present: vi.fn().mockResolvedValue(undefined) };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    sensors.toggleIrDetection('ir-cafeteria');
    const snapshot = JSON.stringify(sensors.sensors());

    await component.confirmResetAll();
    expect(createSpy).toHaveBeenCalledTimes(1);

    const options = createSpy.mock.calls.at(0)?.at(0);
    expect(options).toBeDefined();
    const buttons = options?.buttons as { role?: string; handler?: () => void }[] | undefined;
    const destructive = buttons?.find((button) => button.role === 'destructive');
    expect(destructive?.handler).toBeTypeOf('function');

    TestBed.inject(DemoSessionService).selectProfile('aprendiz');
    destructive?.handler?.();

    expect(JSON.stringify(sensors.sensors())).toBe(snapshot);
  });
});
