import { TestBed } from '@angular/core/testing';

import { SimulatedSensorsService } from './simulated-sensors.service';

describe('SimulatedSensorsService (Fase 3.6)', () => {
  let service: SimulatedSensorsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SimulatedSensorsService);
  });

  it('should load initial inventory with at least one of each required device type', () => {
    const types = service.sensors().map((s) => s.type);
    expect(service.totalDevices()).toBe(6);
    expect(types).toContain('esp32');
    expect(types).toContain('ir');
    expect(types).toContain('ultrasonic');
    expect(types).toContain('pir');
    expect(types).toContain('led-matrix');
    expect(types).toContain('servo');
    expect(service.sensors().every((s) => s.hardwareConnection === 'Sin conexión física')).toBe(true);
  });

  it('should expose summary counters and support queries by zone and type', () => {
    expect(service.activeSimulations()).toBe(4);
    expect(service.pausedSimulations()).toBe(1);
    expect(service.faultSimulations()).toBe(1);
    expect(service.sensorsByZone('cafeteria').map((s) => s.id)).toEqual(['ir-cafeteria', 'servo-cafeteria']);
    expect(service.sensorsByType('esp32').map((s) => s.id)).toEqual(['esp32-pasillo']);
  });

  it('should change simulation state and toggle IR/PIR when active', () => {
    expect(service.setSimulationState('ir-cafeteria', 'paused')).toBe(true);
    expect(service.toggleIrDetection('ir-cafeteria')).toBe(false); // paused
    expect(service.setSimulationState('ir-cafeteria', 'active')).toBe(true);
    expect(service.toggleIrDetection('ir-cafeteria')).toBe(true);
    expect(service.sensors().find((s) => s.id === 'ir-cafeteria')?.reading).toBe(true);

    expect(service.setSimulationState('pir-zona-segura', 'active')).toBe(true);
    expect(service.togglePirDetection('pir-zona-segura')).toBe(true);
    expect(service.sensors().find((s) => s.id === 'pir-zona-segura')?.reading).toBe(true);
  });

  it('should validate ultrasonic distance and servo angle', () => {
    expect(service.setUltrasonicDistance('ultrasonic-biblioteca', -1)).toBe(false);
    expect(service.setUltrasonicDistance('ultrasonic-biblioteca', Number.NaN)).toBe(false);
    expect(service.setUltrasonicDistance('ultrasonic-biblioteca', 85)).toBe(true);
    expect(service.sensors().find((s) => s.id === 'ultrasonic-biblioteca')?.reading).toBe(85);

    expect(service.setServoAngle('servo-cafeteria', 45)).toBe(false); // fault
    expect(service.setSimulationState('servo-cafeteria', 'active')).toBe(true);
    expect(service.setServoAngle('servo-cafeteria', -5)).toBe(false);
    expect(service.setServoAngle('servo-cafeteria', 181)).toBe(false);
    expect(service.setServoAngle('servo-cafeteria', 120)).toBe(true);
    expect(service.sensors().find((s) => s.id === 'servo-cafeteria')?.servoAngle).toBe(120);
  });

  it('should change LED patterns and reset devices/all', () => {
    expect(service.setLedPattern('led-pasillo', 'alerta')).toBe(true);
    expect(service.sensors().find((s) => s.id === 'led-pasillo')?.ledPattern).toBe('alerta');
    expect(service.cycleLedPattern('led-pasillo')).toBe(true);
    expect(service.sensors().find((s) => s.id === 'led-pasillo')?.ledPattern).toBe('flecha');

    expect(service.resetDevice('led-pasillo')).toBe(true);
    expect(service.sensors().find((s) => s.id === 'led-pasillo')?.ledPattern).toBe('normal');

    service.setSimulationState('esp32-pasillo', 'paused');
    service.setUltrasonicDistance('ultrasonic-biblioteca', 50);
    expect(service.resetAll()).toBe(true);
    expect(service.sensors().find((s) => s.id === 'esp32-pasillo')?.simulationState).toBe('active');
    expect(service.sensors().find((s) => s.id === 'ultrasonic-biblioteca')?.reading).toBe(120);
  });
});
