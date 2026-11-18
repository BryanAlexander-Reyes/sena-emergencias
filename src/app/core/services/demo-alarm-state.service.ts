/**
 * SENA CROWD INTELLIGENCE — estado de la alarma simulada (Fase 4.6).
 *
 * Responsabilidad exclusiva: el buzzer **simulado** de demostración. No lee
 * ocupación, no genera alertas, no escribe historial y no toca los sensores.
 * La detección de aglomeración vive en `MonitoringStateService` y la
 * señalización LED en `SimulatedSensorsService`; ninguno de los dos enciende
 * ni apaga esta alarma.
 *
 * Preparación para MQTT/ESP32 (sin implementar): cuando exista hardware real
 * deberán distinguirse tres estados independientes:
 *   1. comando solicitado por la interfaz,
 *   2. comando recibido y aceptado por el ESP32,
 *   3. estado físico confirmado por el dispositivo.
 * Hoy solo existe el estado simulado de la interfaz. Nunca afirmar que un
 * buzzer físico está encendido.
 *
 * ADVERTENCIA: los perfiles son demostrativos y no constituyen autenticación.
 * Este permiso de frontend no debe ser la única protección de una alarma
 * física en fases posteriores.
 */

import { computed, inject, Injectable, signal } from '@angular/core';

import { DemoPermissionsService } from '../auth/demo-permissions.service';

export type DemoAlarmStatus = 'off' | 'on';
export type DemoAlarmAction = 'turn-on' | 'turn-off';

export interface DemoAlarmSnapshot {
  readonly status: DemoAlarmStatus;
  readonly isOn: boolean;
  readonly label: string;
  readonly canControl: boolean;
}

@Injectable({ providedIn: 'root' })
export class DemoAlarmStateService {
  private readonly permissions = inject(DemoPermissionsService);
  private readonly statusState = signal<DemoAlarmStatus>('off');

  readonly status = this.statusState.asReadonly();
  readonly isOn = computed(() => this.status() === 'on');
  readonly label = computed(() => (this.isOn() ? 'Alarma activada' : 'Alarma apagada'));
  readonly canControl = computed(() => this.permissions.can('alarm:control'));
  readonly simulatedOnly = true as const;

  readonly snapshot = computed<DemoAlarmSnapshot>(() => ({
    status: this.status(),
    isOn: this.isOn(),
    label: this.label(),
    canControl: this.canControl(),
  }));

  /**
   * Ejecuta la acción revalidando `alarm:control` en este punto, no solo en el
   * botón. `expectedStatus` evita aplicar un cambio incoherente si el estado ya
   * fue modificado por otra acción mientras se mostraba una confirmación.
   */
  apply(action: DemoAlarmAction, expectedStatus?: DemoAlarmStatus): boolean {
    if (!this.permissions.can('alarm:control')) {
      return false;
    }

    const current = this.statusState();
    if (expectedStatus !== undefined && current !== expectedStatus) {
      return false;
    }

    const target: DemoAlarmStatus = action === 'turn-on' ? 'on' : 'off';
    if (current === target) {
      return false;
    }

    this.statusState.set(target);
    return true;
  }

  turnOn(expectedStatus?: DemoAlarmStatus): boolean {
    return this.apply('turn-on', expectedStatus);
  }

  turnOff(expectedStatus?: DemoAlarmStatus): boolean {
    return this.apply('turn-off', expectedStatus);
  }
}
