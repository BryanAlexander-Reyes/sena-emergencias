/**
 * SENA CROWD INTELLIGENCE — avisos combinados de alarma y aglomeración (Fase 4.6).
 *
 * La lógica es derivada y reactiva: lee el estado de ocupación existente y el
 * estado simulado del buzzer, sin crear eventos, alertas ni registros nuevos.
 * Por eso el mismo mensaje aparece coherentemente en Inicio y en Alertas.
 *
 * Criterio de aglomeración: al menos una zona monitoreada en nivel `critical`
 * (>= 80 % según `OCCUPANCY_THRESHOLDS`), obtenido de `MonitoringStateService`.
 * Se reutiliza el único motor de ocupación del proyecto; `warning` no cuenta.
 */

import { computed, Injectable, inject } from '@angular/core';

import { DemoAlarmStateService } from './demo-alarm-state.service';
import { MonitoringStateService } from './monitoring-state.service';

export type AlarmNoticeScenario = 'A' | 'B' | 'C' | 'D';

export interface DemoAlarmNotice {
  readonly scenario: AlarmNoticeScenario;
  readonly message: string;
  readonly zoneName?: string;
}

/**
 * Las instrucciones de LED verdes solo podrían mostrarse si existieran dos
 * estados explícitos e independientes: señales LED verdes activadas y ruta de
 * demostración habilitada y verificada como segura. Ninguno existe todavía;
 * ambos quedan pendientes de la integración MQTT/ESP32. No se inventan.
 */
const LED_GUIDANCE_CONFIRMED = false as const;

export function buildAlarmNotice(agglomerationZoneName: string | undefined, alarmOn: boolean): DemoAlarmNotice {
  if (!agglomerationZoneName) {
    return alarmOn
      ? {
          scenario: 'C',
          message: 'Alarma activada por personal autorizado. Siga las indicaciones del personal responsable.',
        }
      : { scenario: 'A', message: 'Sin aglomeración crítica ni alarma activa.' };
  }

  return alarmOn
    ? {
        scenario: 'D',
        message: 'Aglomeración detectada y alarma activada. Siga las indicaciones del personal autorizado.',
        zoneName: agglomerationZoneName,
      }
    : {
        scenario: 'B',
        message: 'Aglomeración detectada. Mantenga la calma y esté atento a las indicaciones del personal autorizado.',
        zoneName: agglomerationZoneName,
      };
}

@Injectable({ providedIn: 'root' })
export class DemoAlarmNoticeService {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alarm = inject(DemoAlarmStateService);

  readonly agglomerationZoneName = computed<string | undefined>(
    () => this.monitoring.snapshots().find((snapshot) => snapshot.status === 'critical')?.zone.name,
  );
  readonly hasAgglomeration = computed(() => this.agglomerationZoneName() !== undefined);

  readonly notice = computed<DemoAlarmNotice>(() => buildAlarmNotice(this.agglomerationZoneName(), this.alarm.isOn()));

  readonly ledInstruction = computed<string | null>(() =>
    LED_GUIDANCE_CONFIRMED ? 'Siga las señales LED verdes de orientación.' : null,
  );
}
