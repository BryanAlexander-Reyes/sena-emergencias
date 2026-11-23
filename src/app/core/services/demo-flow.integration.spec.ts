import { TestBed } from '@angular/core/testing';

import { autoOccupancyAlertId } from '../data/demo-alerts';

import { AlertsStateService } from './alerts-state.service';
import { DemoAssistantService } from './demo-assistant.service';
import { MonitoringStateService } from './monitoring-state.service';
import { OccupancyAlertEngineService } from './occupancy-alert-engine.service';
import { SimulatedSensorsService } from './simulated-sensors.service';
import { SimulationHistoryService } from './simulation-history.service';

/**
 * Integración Fase 3.8 — recorrido completo del simulador.
 *
 * Une en un solo escenario los servicios aprobados en las fases 3.2–3.7 para
 * comprobar que ocupación, alertas, historial, asistente y sensores siguen
 * compartiendo el mismo estado sin duplicar ni mezclar responsabilidades.
 */
describe('Integración Fase 3.8 — flujo de demostración', () => {
  let monitoring: MonitoringStateService;
  let alerts: AlertsStateService;
  let history: SimulationHistoryService;
  let assistant: DemoAssistantService;
  let sensors: SimulatedSensorsService;

  const flush = (): void => TestBed.flushEffects();
  const lastAnswer = (): string => assistant.messages().at(-1)?.content ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    monitoring = TestBed.inject(MonitoringStateService);
    alerts = TestBed.inject(AlertsStateService);
    history = TestBed.inject(SimulationHistoryService);
    assistant = TestBed.inject(DemoAssistantService);
    sensors = TestBed.inject(SimulatedSensorsService);
    TestBed.inject(OccupancyAlertEngineService);
    flush();
  });

  it('should start from the approved dashboard baseline without generating alerts on load', () => {
    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.monitoredZones()).toBe(4);
    expect(monitoring.hasOccupancyChanges()).toBe(false);
    expect(alerts.activeAlerts()).toBe(1);
    expect(alerts.totalAlerts()).toBe(3);
    expect(alerts.activeCriticalAlert()?.id).toBe('ALR-001');
    expect(history.changeCount()).toBe(0);
  });

  it('should keep occupancy, alerts, history, assistant, sensors and reset coherent through the demo flow', () => {
    const cafeteriaAlertId = autoOccupancyAlertId('cafeteria');

    // 1. Cafetería 35 -> 36: el primer cambio real crea la alerta gestionada.
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.zoneById('cafeteria')?.people).toBe(36);
    expect(monitoring.statusOf('cafeteria')).toBe('warning');
    expect(alerts.alerts().find((alert) => alert.id === cafeteriaAlertId)?.severity).toBe('warning');

    // 2. Cafetería 36 -> 40: crítico sin duplicar el registro automático.
    for (let i = 0; i < 4; i += 1) {
      expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
      flush();
    }
    const criticalCafeteriaAlerts = alerts.alerts().filter((alert) => alert.id === cafeteriaAlertId);
    expect(monitoring.occupancyOf('cafeteria')).toBe(80);
    expect(monitoring.statusOf('cafeteria')).toBe('critical');
    expect(criticalCafeteriaAlerts).toHaveLength(1);
    expect(criticalCafeteriaAlerts[0].severity).toBe('critical');
    expect(criticalCafeteriaAlerts[0].status).toBe('active');
    expect(monitoring.totalPeople()).toBe(112);

    // 3. Cafetería 40 -> 34: normal y alerta automática resuelta.
    for (let i = 0; i < 6; i += 1) {
      expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
      flush();
    }
    expect(monitoring.occupancyOf('cafeteria')).toBe(68);
    expect(monitoring.statusOf('cafeteria')).toBe('normal');
    expect(alerts.alerts().find((alert) => alert.id === cafeteriaAlertId)?.status).toBe('resolved');
    expect(alerts.activeAlerts()).toBe(1);
    expect(monitoring.totalPeople()).toBe(106);

    // 4. Punto de encuentro 12 -> 13 sin alerta (sigue en estado normal).
    expect(monitoring.incrementOccupancy('zona-segura')).toBe(true);
    flush();
    expect(monitoring.safeZonePeople()).toBe(13);
    expect(monitoring.safeZoneStatus()).toBe('normal');
    expect(monitoring.totalPeople()).toBe(107);
    expect(alerts.alerts().filter((alert) => alert.zoneId === 'zona-segura' && alert.status === 'active')).toHaveLength(
      0,
    );

    // 5. El historial solo registra cambios confirmados y conserva el máximo observado.
    expect(history.changeCount()).toBe(12);
    expect(history.maxTotalObserved()).toBe(112);
    expect(history.eventsForZone('cafeteria')).toHaveLength(11);
    expect(history.eventsForZone('zona-segura')).toHaveLength(1);
    expect(history.zoneStats().find((zone) => zone.zoneId === 'cafeteria')?.maxPeopleObserved).toBe(40);
    expect(history.eventsNewestFirst()[0]?.zoneId).toBe('zona-segura');

    // 6. El asistente responde con el estado vivo sin modificarlo.
    const totalBeforeAssistant = monitoring.totalPeople();
    const activeAlertsBeforeAssistant = alerts.activeAlerts();

    assistant.sendUserMessage('¿Cuántas personas hay en total?');
    expect(lastAnswer()).toContain('107 personas');

    assistant.sendUserMessage('¿Qué zonas están críticas?');
    expect(lastAnswer()).toContain('Pasillo principal');
    expect(lastAnswer()).not.toContain('Cafetería');

    assistant.sendUserMessage('¿Cuántas alertas activas hay?');
    expect(lastAnswer()).toContain('1');

    assistant.sendUserMessage('¿Cuál fue el máximo de personas registrado?');
    expect(lastAnswer()).toContain('112');

    assistant.sendUserMessage('¿Por dónde debo evacuar?');
    expect(lastAnswer()).toContain('no puede determinar rutas de evacuación seguras');

    expect(monitoring.totalPeople()).toBe(totalBeforeAssistant);
    expect(alerts.activeAlerts()).toBe(activeAlertsBeforeAssistant);

    // 7. Los sensores simulados no alteran ocupación, alertas ni historial.
    const historyBeforeSensors = history.changeCount();
    const totalBeforeSensors = monitoring.totalPeople();

    expect(sensors.setSimulationState('pir-zona-segura', 'active')).toBe(true);
    expect(sensors.togglePirDetection('pir-zona-segura')).toBe(true);
    expect(sensors.setUltrasonicDistance('ultrasonic-biblioteca', 85)).toBe(true);
    flush();

    expect(monitoring.totalPeople()).toBe(totalBeforeSensors);
    expect(alerts.activeAlerts()).toBe(activeAlertsBeforeAssistant);
    expect(history.changeCount()).toBe(historyBeforeSensors);
    expect(sensors.resetAll()).toBe(true);

    // 8. Restablecer todo devuelve las ocupaciones iniciales y reconcilia las alertas gestionadas.
    expect(monitoring.resetAllOccupancy()).toBe(true);
    flush();

    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.hasOccupancyChanges()).toBe(false);
    expect(monitoring.zoneById('cafeteria')?.people).toBe(35);
    expect(monitoring.safeZonePeople()).toBe(12);
    expect(history.changeCount()).toBe(14);

    const resetEvents = history.eventsNewestFirst().filter((event) => event.action === 'reset-all');
    expect(resetEvents).toHaveLength(2);
    expect(new Set(resetEvents.map((event) => event.operationId)).size).toBe(1);

    // Cafetería vuelve a 70% (precaución), por lo que su alerta gestionada se reactiva.
    const cafeteriaAfterReset = alerts.alerts().find((alert) => alert.id === cafeteriaAlertId);
    expect(cafeteriaAfterReset?.status).toBe('active');
    expect(cafeteriaAfterReset?.severity).toBe('warning');
    expect(alerts.activeAlerts()).toBe(2);

    // Los registros históricos de demostración se conservan sin cambios.
    expect(alerts.alerts().find((alert) => alert.id === 'ALR-002')?.status).toBe('resolved');
    expect(alerts.alerts().find((alert) => alert.id === 'ALR-003')?.status).toBe('resolved');
  });
});
