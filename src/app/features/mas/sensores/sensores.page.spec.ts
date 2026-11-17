import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AlertsStateService } from '../../../core/services/alerts-state.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';
import { SimulatedSensorsService } from '../../../core/services/simulated-sensors.service';

import { SensoresPage } from './sensores.page';

describe('SensoresPage (Fase 3.6)', () => {
  let component: SensoresPage;
  let fixture: ComponentFixture<SensoresPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SensoresPage],
      providers: [provideRouter([])],
    }).compileComponents();

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
    expect(component.totalDevices()).toBe(6);
    expect(cards.length).toBe(6);
    expect(content).toContain('ESP32');
    expect(content).toContain('Sensor infrarrojo (IR)');
    expect(content).toContain('Sensor ultrasónico');
    expect(content).toContain('Sensor PIR 360°');
    expect(content).toContain('Matriz LED 8×8');
    expect(content).toContain('Servomotor');
  });

  it('should show zone association and physical disconnection explicitly', () => {
    const content = pageText();

    expect(content).toContain('Zona: Pasillo principal');
    expect(content).toContain('Zona: Cafetería');
    expect(content).toContain('Zona: Biblioteca');
    expect(content).toContain('Zona: Punto de encuentro');
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
});
