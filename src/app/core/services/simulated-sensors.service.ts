import { Injectable, computed, signal } from '@angular/core';

export type SensorDeviceType = 'esp32' | 'ir' | 'ultrasonic' | 'pir' | 'led-matrix' | 'servo';
export type SimulationState = 'active' | 'paused' | 'fault';
export type LedPattern = 'alerta' | 'normal' | 'flecha';

export interface SimulatedSensor {
  readonly id: string;
  readonly name: string;
  readonly type: SensorDeviceType;
  readonly zoneId: string;
  readonly description: string;
  readonly simulationState: SimulationState;
  readonly hardwareConnection: 'Sin conexión física';
  readonly reading?: string | number | boolean;
  readonly unit?: string;
  readonly ledPattern?: LedPattern;
  readonly servoAngle?: number;
}

export const SENSOR_TYPE_LABELS: Readonly<Record<SensorDeviceType, string>> = {
  esp32: 'ESP32',
  ir: 'Sensor infrarrojo (IR)',
  ultrasonic: 'Sensor ultrasónico',
  pir: 'Sensor PIR 360°',
  'led-matrix': 'Matriz LED 8×8',
  servo: 'Servomotor',
};

export const SIMULATION_STATE_LABELS: Readonly<Record<SimulationState, string>> = {
  active: 'Simulación activa',
  paused: 'Simulación pausada',
  fault: 'Simulación con fallo ficticio',
};

export const LED_PATTERN_LABELS: Readonly<Record<LedPattern, string>> = {
  alerta: 'Alerta',
  normal: 'Normal',
  flecha: 'Flecha',
};

export const LED_PATTERNS: readonly LedPattern[] = ['normal', 'alerta', 'flecha'];

const INITIAL_SENSORS: readonly SimulatedSensor[] = [
  {
    id: 'esp32-pasillo',
    name: 'Controlador ESP32 Pasillo',
    type: 'esp32',
    zoneId: 'pasillo-principal',
    description: 'Controlador IoT simulado para coordinación lógica de dispositivos en el pasillo.',
    simulationState: 'active',
    hardwareConnection: 'Sin conexión física',
  },
  {
    id: 'ir-cafeteria',
    name: 'Sensor IR Cafetería',
    type: 'ir',
    zoneId: 'cafeteria',
    description: 'Detección ficticia de paso en el acceso de la cafetería.',
    simulationState: 'active',
    hardwareConnection: 'Sin conexión física',
    reading: false,
  },
  {
    id: 'ultrasonic-biblioteca',
    name: 'Sensor ultrasónico Biblioteca',
    type: 'ultrasonic',
    zoneId: 'biblioteca',
    description: 'Distancia ficticia medida en centímetros dentro de la biblioteca.',
    simulationState: 'active',
    hardwareConnection: 'Sin conexión física',
    reading: 120,
    unit: 'cm',
  },
  {
    id: 'pir-zona-segura',
    name: 'Sensor PIR 360° Punto de encuentro',
    type: 'pir',
    zoneId: 'zona-segura',
    description: 'Detección ficticia de movimiento en el punto de encuentro.',
    simulationState: 'paused',
    hardwareConnection: 'Sin conexión física',
    reading: false,
  },
  {
    id: 'led-pasillo',
    name: 'Matriz LED 8×8 Pasillo',
    type: 'led-matrix',
    zoneId: 'pasillo-principal',
    description: 'Patrón visual simulado para señalización en el pasillo principal.',
    simulationState: 'active',
    hardwareConnection: 'Sin conexión física',
    ledPattern: 'normal',
  },
  {
    id: 'servo-cafeteria',
    name: 'Servomotor Cafetería',
    type: 'servo',
    zoneId: 'cafeteria',
    description: 'Ángulo simulado de actuador en la cafetería.',
    simulationState: 'fault',
    hardwareConnection: 'Sin conexión física',
    servoAngle: 90,
  },
];

function cloneSensor(sensor: SimulatedSensor): SimulatedSensor {
  return { ...sensor };
}

@Injectable({ providedIn: 'root' })
export class SimulatedSensorsService {
  private readonly sensorsState = signal<readonly SimulatedSensor[]>(INITIAL_SENSORS.map(cloneSensor));

  readonly sensors = this.sensorsState.asReadonly();
  readonly totalDevices = computed(() => this.sensors().length);
  readonly activeSimulations = computed(
    () => this.sensors().filter((s) => s.simulationState === 'active').length,
  );
  readonly pausedSimulations = computed(
    () => this.sensors().filter((s) => s.simulationState === 'paused').length,
  );
  readonly faultSimulations = computed(
    () => this.sensors().filter((s) => s.simulationState === 'fault').length,
  );

  sensorsByZone(zoneId: string): readonly SimulatedSensor[] {
    return this.sensors().filter((s) => s.zoneId === zoneId);
  }

  sensorsByType(type: SensorDeviceType): readonly SimulatedSensor[] {
    return this.sensors().filter((s) => s.type === type);
  }

  setSimulationState(id: string, state: SimulationState): boolean {
    return this.updateSensor(id, (sensor) =>
      sensor.simulationState === state ? sensor : { ...sensor, simulationState: state },
    );
  }

  toggleIrDetection(id: string): boolean {
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'ir' || sensor.simulationState !== 'active') return sensor;
      return { ...sensor, reading: !(sensor.reading === true) };
    });
  }

  togglePirDetection(id: string): boolean {
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'pir' || sensor.simulationState !== 'active') return sensor;
      return { ...sensor, reading: !(sensor.reading === true) };
    });
  }

  setUltrasonicDistance(id: string, value: number): boolean {
    if (!Number.isFinite(value) || value < 0) {
      return false;
    }
    const distance = Math.round(value);
    if (distance < 0) return false;
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'ultrasonic' || sensor.simulationState !== 'active') return sensor;
      if (sensor.reading === distance) return sensor;
      return { ...sensor, reading: distance };
    });
  }

  setServoAngle(id: string, value: number): boolean {
    if (!Number.isFinite(value) || value < 0 || value > 180) {
      return false;
    }
    const angle = Math.round(value);
    if (angle < 0 || angle > 180) return false;
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'servo' || sensor.simulationState !== 'active') return sensor;
      if (sensor.servoAngle === angle) return sensor;
      return { ...sensor, servoAngle: angle };
    });
  }

  setLedPattern(id: string, pattern: LedPattern): boolean {
    if (!LED_PATTERNS.includes(pattern)) return false;
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'led-matrix' || sensor.simulationState !== 'active') return sensor;
      if (sensor.ledPattern === pattern) return sensor;
      return { ...sensor, ledPattern: pattern };
    });
  }

  cycleLedPattern(id: string): boolean {
    return this.updateSensor(id, (sensor) => {
      if (sensor.type !== 'led-matrix' || sensor.simulationState !== 'active') return sensor;
      const current = sensor.ledPattern ?? 'normal';
      const idx = LED_PATTERNS.indexOf(current);
      const next = LED_PATTERNS[(idx + 1) % LED_PATTERNS.length];
      return { ...sensor, ledPattern: next };
    });
  }

  resetDevice(id: string): boolean {
    const initial = INITIAL_SENSORS.find((s) => s.id === id);
    if (!initial) return false;
    return this.updateSensor(id, (sensor) => {
      const fresh = cloneSensor(initial);
      if (JSON.stringify(sensor) === JSON.stringify(fresh)) return sensor;
      return fresh;
    });
  }

  resetAll(): boolean {
    const initial = INITIAL_SENSORS.map(cloneSensor);
    const current = this.sensors();
    if (JSON.stringify(current) === JSON.stringify(initial)) {
      return false;
    }
    this.sensorsState.set(initial);
    return true;
  }

  private updateSensor(id: string, updater: (sensor: SimulatedSensor) => SimulatedSensor): boolean {
    const sensors = this.sensors();
    const index = sensors.findIndex((s) => s.id === id);
    if (index === -1) return false;
    const current = sensors[index];
    const next = updater(current);
    if (next === current) {
      // for value-equality cases where updater returned same ref only if identical we handled above;
      // ensure we don't treat unchanged as false when caller expects boolean change of action?
      // callers return sensor when no-op due to state; treat as false to indicate no effective change.
      return false;
    }
    const copy = sensors.slice();
    copy[index] = next;
    this.sensorsState.set(copy);
    return true;
  }
}
