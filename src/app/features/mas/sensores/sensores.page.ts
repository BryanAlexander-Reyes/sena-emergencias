import { Component, computed, inject, signal } from '@angular/core';
import { AlertController, IonButton, IonIcon, IonInput, IonSelect, IonSelectOption } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  cloudOfflineOutline,
  cogOutline,
  gridOutline,
  hardwareChipOutline,
  informationCircleOutline,
  pauseCircleOutline,
  playCircleOutline,
  pulseOutline,
  radioOutline,
  refreshOutline,
  swapHorizontalOutline,
  walkOutline,
  warningOutline,
} from 'ionicons/icons';

import { DemoPermissionsService } from '../../../core/auth/demo-permissions.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';
import {
  LED_PATTERN_LABELS,
  LED_PATTERNS,
  SENSOR_TYPE_LABELS,
  SIMULATION_STATE_LABELS,
  SimulatedSensorsService,
  type LedPattern,
  type SensorDeviceType,
  type SimulatedSensor,
  type SimulationState,
} from '../../../core/services/simulated-sensors.service';
import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

/**
 * Tipos con hardware real documentado. El contrato de `SimulatedSensorsService`
 * conserva el resto por compatibilidad; aquí solo se filtran las tarjetas.
 */
const TIPOS_VISIBLES: ReadonlySet<SensorDeviceType> = new Set(['esp32', 'ir', 'ultrasonic']);

@Component({
  selector: 'app-sensores',
  templateUrl: './sensores.page.html',
  styleUrls: ['./sensores.page.scss'],
  imports: [IonButton, IonIcon, IonInput, IonSelect, IonSelectOption, SecondaryPageComponent],
})
export class SensoresPage {
  private readonly sensorsService = inject(SimulatedSensorsService);
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alertController = inject(AlertController);
  private readonly permissions = inject(DemoPermissionsService);

  readonly sensors = computed(() => this.sensorsService.sensors().filter((sensor) => TIPOS_VISIBLES.has(sensor.type)));
  readonly totalDevices = computed(() => this.sensors().length);
  readonly activeSimulations = computed(() => this.sensors().filter((s) => s.simulationState === 'active').length);
  readonly pausedSimulations = computed(() => this.sensors().filter((s) => s.simulationState === 'paused').length);
  readonly faultSimulations = computed(() => this.sensors().filter((s) => s.simulationState === 'fault').length);

  readonly simulationStates: readonly SimulationState[] = ['active', 'paused', 'fault'];
  readonly ledPatterns = LED_PATTERNS;
  readonly expandedIds = signal<ReadonlySet<string>>(new Set());
  readonly canControlSensors = computed(() => this.permissions.can('sensors:control'));
  readonly canResetSensors = computed(() => this.permissions.can('sensors:reset'));

  constructor() {
    addIcons({
      alertCircleOutline,
      chevronDownOutline,
      chevronUpOutline,
      cloudOfflineOutline,
      cogOutline,
      gridOutline,
      hardwareChipOutline,
      informationCircleOutline,
      pauseCircleOutline,
      playCircleOutline,
      pulseOutline,
      radioOutline,
      refreshOutline,
      swapHorizontalOutline,
      walkOutline,
      warningOutline,
    });
  }

  zoneName(zoneId: string): string {
    return this.monitoring.zoneById(zoneId)?.name ?? zoneId;
  }

  typeLabel(sensor: SimulatedSensor): string {
    return SENSOR_TYPE_LABELS[sensor.type];
  }

  stateLabel(state: SimulationState): string {
    return SIMULATION_STATE_LABELS[state];
  }

  ledLabel(pattern: LedPattern | undefined): string {
    return LED_PATTERN_LABELS[pattern ?? 'normal'];
  }

  iconFor(sensor: SimulatedSensor): string {
    switch (sensor.type) {
      case 'esp32':
        return 'hardware-chip-outline';
      case 'ir':
        return 'radio-outline';
      case 'ultrasonic':
        return 'pulse-outline';
      case 'pir':
        return 'walk-outline';
      case 'led-matrix':
        return 'grid-outline';
      case 'servo':
        return 'cog-outline';
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(id: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  canControlReading(sensor: SimulatedSensor): boolean {
    return this.permissions.can('sensors:control') && sensor.simulationState === 'active';
  }

  setState(id: string, value: unknown): void {
    if (!this.permissions.can('sensors:control')) return;

    if (value === 'active' || value === 'paused' || value === 'fault') {
      this.sensorsService.setSimulationState(id, value);
    }
  }

  toggleIr(id: string): void {
    if (!this.permissions.can('sensors:control')) return;
    this.sensorsService.toggleIrDetection(id);
  }

  togglePir(id: string): void {
    if (!this.permissions.can('sensors:control')) return;
    this.sensorsService.togglePirDetection(id);
  }

  setUltrasonic(id: string, value: unknown): void {
    if (!this.permissions.can('sensors:control')) return;

    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    this.sensorsService.setUltrasonicDistance(id, n);
  }

  setServo(id: string, value: unknown): void {
    if (!this.permissions.can('sensors:control')) return;

    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 180) return;
    this.sensorsService.setServoAngle(id, n);
  }

  setLed(id: string, value: unknown): void {
    if (!this.permissions.can('sensors:control')) return;

    if (value === 'normal' || value === 'alerta' || value === 'flecha') {
      this.sensorsService.setLedPattern(id, value);
    }
  }

  cycleLed(id: string): void {
    if (!this.permissions.can('sensors:control')) return;
    this.sensorsService.cycleLedPattern(id);
  }

  resetDevice(id: string): void {
    if (!this.permissions.can('sensors:reset')) return;
    this.sensorsService.resetDevice(id);
  }

  async confirmResetAll(): Promise<void> {
    if (!this.permissions.can('sensors:reset')) return;

    const alert = await this.alertController.create({
      header: 'Restablecer todos los dispositivos',
      message:
        'Se restaurarán los estados y lecturas simuladas iniciales de todos los dispositivos. No se modificarán ocupaciones, alertas ni estadísticas.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Restablecer', role: 'destructive', handler: () => this.resetAllSensors() },
      ],
    });
    await alert.present();
  }

  private resetAllSensors(): void {
    if (!this.permissions.can('sensors:reset')) return;
    this.sensorsService.resetAll();
  }

  readingText(sensor: SimulatedSensor): string {
    switch (sensor.type) {
      case 'ir':
        return sensor.reading === true ? 'Paso detectado: Sí' : 'Paso detectado: No';
      case 'pir':
        return sensor.reading === true ? 'Movimiento detectado: Sí' : 'Movimiento detectado: No';
      case 'ultrasonic':
        return `Distancia simulada: ${sensor.reading ?? 0} cm`;
      case 'servo':
        return `Ángulo simulado: ${sensor.servoAngle ?? 0}°`;
      case 'led-matrix':
        return `Patrón simulado: ${this.ledLabel(sensor.ledPattern)}`;
      case 'esp32':
        return 'Estado lógico del controlador (sin telemetría real)';
    }
  }
}
