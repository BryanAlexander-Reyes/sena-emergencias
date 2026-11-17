import { Injectable, inject, signal } from '@angular/core';

import { OCCUPANCY_STATUS_LABELS } from '../data/demo-monitoring';

import { AlertsStateService } from './alerts-state.service';
import { MonitoringStateService } from './monitoring-state.service';
import { SimulatedSensorsService, SENSOR_TYPE_LABELS, SIMULATION_STATE_LABELS } from './simulated-sensors.service';
import { SimulationHistoryService } from './simulation-history.service';

export type AssistantSender = 'user' | 'assistant';

export interface AssistantMessage {
  readonly id: string;
  readonly sender: AssistantSender;
  readonly content: string;
  readonly createdAt: Date;
  readonly kind?: 'welcome' | 'answer' | 'unknown' | 'safety' | 'help' | 'clarify';
}

type Intent =
  | 'total'
  | 'zone'
  | 'critical-zones'
  | 'warning-zones'
  | 'active-alerts'
  | 'safe-zone'
  | 'sensors'
  | 'stats'
  | 'help'
  | 'evacuation'
  | 'unknown';

const MAX_LENGTH = 240;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

@Injectable({ providedIn: 'root' })
export class DemoAssistantService {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alerts = inject(AlertsStateService);
  private readonly history = inject(SimulationHistoryService);
  private readonly sensors = inject(SimulatedSensorsService);

  private readonly messagesState = signal<readonly AssistantMessage[]>([this.createWelcome()]);

  readonly messages = this.messagesState.asReadonly();

  readonly quickQuestions: readonly string[] = [
    'Ocupación total',
    'Zonas críticas',
    'Alertas activas',
    'Zona segura',
    'Estado de sensores',
    'Estadísticas de sesión',
  ];

  sendUserMessage(raw: string): AssistantMessage | null {
    const content = this.sanitize(raw);
    if (!content) {
      return null;
    }

    const userMessage = this.createMessage('user', content);
    const answer = this.answer(content, normalize(content));

    this.messagesState.update((messages) => [...messages, userMessage, answer]);
    return userMessage;
  }

  askQuickQuestion(question: string): AssistantMessage | null {
    return this.sendUserMessage(question);
  }

  resetConversation(): void {
    this.messagesState.set([this.createWelcome()]);
  }

  private sanitize(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return trimmed.slice(0, MAX_LENGTH);
  }

  private createWelcome(): AssistantMessage {
    return this.createMessage(
      'assistant',
      'Hola, soy el asistente de demostración de SENA CROWD INTELLIGENCE. Puedo ayudarte a consultar ocupación, zonas, alertas, sensores y estadísticas de esta simulación usando respuestas automáticas locales.',
      'welcome',
    );
  }

  private createMessage(sender: AssistantSender, content: string, kind?: AssistantMessage['kind']): AssistantMessage {
    return {
      id: createId(),
      sender,
      content,
      createdAt: new Date(),
      ...(kind ? { kind } : {}),
    };
  }

  private answer(raw: string, text: string): AssistantMessage {
    const intent = this.detectIntent(text);

    switch (intent) {
      case 'evacuation':
        return this.createMessage(
          'assistant',
          'Este asistente utiliza datos simulados y no puede determinar rutas de evacuación seguras. En una emergencia real, sigue la señalización oficial y las instrucciones del personal autorizado del SENA.',
          'safety',
        );
      case 'total':
        return this.createMessage(
          'assistant',
          `Ocupación general actual: ${this.monitoring.totalPeople()} personas en ${this.monitoring.monitoredZones()} zonas monitoreadas (dato simulado de la sesión).`,
          'answer',
        );
      case 'zone':
        return this.createMessage('assistant', this.zoneAnswer(text), 'answer');
      case 'critical-zones':
        return this.createMessage('assistant', this.zonesByStatusAnswer('critical'), 'answer');
      case 'warning-zones':
        return this.createMessage('assistant', this.zonesByStatusAnswer('warning'), 'answer');
      case 'active-alerts':
        return this.createMessage('assistant', this.activeAlertsAnswer(), 'answer');
      case 'safe-zone':
        return this.createMessage('assistant', this.safeZoneAnswer(), 'answer');
      case 'sensors':
        return this.createMessage('assistant', this.sensorsAnswer(text), 'answer');
      case 'stats':
        return this.createMessage('assistant', this.statsAnswer(), 'answer');
      case 'help':
        return this.createMessage(
          'assistant',
          'Puedo ayudarte con consultas locales de esta simulación: ocupación total, estado de una zona (cafetería, biblioteca, pasillo principal o zona segura/punto de encuentro), zonas críticas o en precaución, alertas activas, estado de sensores simulados y estadísticas de la sesión. También respondo con una indicación segura ante preguntas de evacuación.',
          'help',
        );
      case 'unknown':
      default:
        return this.createMessage(
          'assistant',
          'No tengo una respuesta predefinida para esa pregunta. Puedo ayudarte a consultar ocupación, zonas, alertas, sensores y estadísticas de esta simulación.',
          'unknown',
        );
    }
  }

  private detectIntent(text: string): Intent {
    if (!text) return 'unknown';

    if (
      includesAny(text, ['evacuar', 'evacuacion', 'ruta', 'salir', 'salida', 'hacia donde', 'por donde'])
    ) {
      return 'evacuation';
    }

    const asksAlerts =
      text.includes('alerta') || (text.includes('activ') && text.includes('alerta'));
    if (asksAlerts || (includesAny(text, ['cuantas alertas', 'alertas activas']) && !text.includes('zona critica'))) {
      return 'active-alerts';
    }

    const asksStats = includesAny(text, [
      'estadistica',
      'maximo',
      'historial',
      'cambios',
      'cambio registrado',
      'cuantos cambios',
    ]);
    if (asksStats) return 'stats';

    const asksSensors = includesAny(text, [
      'sensor',
      'sensores',
      'esp32',
      'ultrasonico',
      'pir',
      'matriz',
      'led',
      'servo',
      'infrarrojo',
      ' ir ',
      'hardware',
      'conectado',
      'dispositivo',
    ]) || text.startsWith('ir ');
    if (asksSensors) return 'sensors';

    if (includesAny(text, ['ayuda', 'que puedes', 'que preguntas', 'como funcionas', 'funciones'])) {
      return 'help';
    }

    const asksSafe = includesAny(text, ['zona segura', 'punto de encuentro']);
    if (asksSafe && (includesAny(text, ['donde', 'cuantas', 'capacidad', 'ocupacion', 'estado', 'como esta', 'personas']) || text === 'zona segura')) {
      return 'safe-zone';
    }

    const asksCritical = includesAny(text, ['critica', 'criticas', 'critico', 'criticos']);
    const asksWarning = includesAny(text, ['precaucion', 'elevada', 'advertencia', 'amarilla']);
    const asksZonesList = includesAny(text, ['que zonas', 'cuales zonas', 'muestrame', 'mostrar', 'hay zonas', 'zonas en']);
    if (asksCritical && (asksZonesList || text.includes('zona'))) return 'critical-zones';
    if (asksWarning && (asksZonesList || text.includes('zona'))) return 'warning-zones';

    const zoneId = this.matchZoneId(text);
    if (zoneId) {
      return 'zone';
    }

    if (
      includesAny(text, ['total', 'general', 'actualmente', 'en total', 'cuantas personas hay', 'ocupacion general'])
    ) {
      return 'total';
    }

    // fallback: safe zone mention without other qualifiers
    if (asksSafe) return 'safe-zone';
    if (asksCritical) return 'critical-zones';
    if (asksWarning) return 'warning-zones';

    return 'unknown';
  }

  private matchZoneId(text: string): string | undefined {
    // prioritize specific zones; "zona segura"/"punto de encuentro" handled, but allow zone detail
    if (includesAny(text, ['cafeteria'])) return 'cafeteria';
    if (includesAny(text, ['biblioteca'])) return 'biblioteca';
    if (includesAny(text, ['pasillo'])) return 'pasillo-principal';
    if (includesAny(text, ['zona segura', 'punto de encuentro'])) return 'zona-segura';
    return undefined;
  }

  private zoneAnswer(text: string): string {
    const zoneId = this.matchZoneId(text);
    if (!zoneId) {
      return 'No pude identificar la zona. Puedes consultar: Cafetería, Biblioteca, Pasillo principal o Zona segura (Punto de encuentro).';
    }
    const snapshot = this.monitoring.snapshotOf(zoneId);
    if (!snapshot) {
      return 'No encontré datos locales para esa zona.';
    }
    return `${snapshot.zone.name}: ${snapshot.zone.people} de ${snapshot.zone.capacity} personas (${snapshot.occupancy}%), estado ${snapshot.statusLabel}. Dato simulado actual.`;
  }

  private zonesByStatusAnswer(status: 'critical' | 'warning'): string {
    const label = OCCUPANCY_STATUS_LABELS[status];
    const zones = this.monitoring.snapshots().filter((s) => s.status === status);
    if (zones.length === 0) {
      return status === 'critical'
        ? 'Actualmente no hay zonas en estado crítico.'
        : 'Actualmente no hay zonas en estado de precaución.';
    }
    const list = zones.map((s) => `${s.zone.name} (${s.zone.people}/${s.zone.capacity}, ${s.occupancy}%)`).join('; ');
    return `Zonas en ${label.toLowerCase()}: ${list}.`;
  }

  private activeAlertsAnswer(): string {
    const count = this.alerts.activeAlerts();
    const active = this.alerts.alerts().filter((a) => a.status === 'active');
    if (count === 0 || active.length === 0) {
      return 'Actualmente no hay alertas activas según el servicio de alertas.';
    }
    const list = active
      .map((a) => `${a.title} en ${a.zoneName} (${a.severity === 'critical' ? 'crítica' : a.severity === 'warning' ? 'precaución' : 'informativa'})`)
      .join('; ');
    return `Alertas activas actuales: ${count}. ${list}.`;
  }

  private safeZoneAnswer(): string {
    const zone = this.monitoring.safeZone();
    const snapshot = this.monitoring.safeZoneSnapshot();
    return `Zona segura: ${zone.name}. Ocupación actual: ${snapshot.zone.people} de ${snapshot.zone.capacity} personas (${snapshot.occupancy}%), estado ${snapshot.statusLabel}. La ubicación corresponde a datos simulados de la aplicación y no ha sido verificada físicamente.`;
  }

  private sensorsAnswer(text: string): string {
    const devices = this.sensors.sensors();
    const total = this.sensors.totalDevices();
    const active = this.sensors.activeSimulations();
    const paused = this.sensors.pausedSimulations();
    const fault = this.sensors.faultSimulations();

    const mentionsEsp32 = text.includes('esp32');
    const mentionsPir = text.includes('pir');
    const mentionsIr = text.includes('infrarrojo') || text.includes(' ir ') || text.startsWith('ir');
    const mentionsUltra = text.includes('ultrason');
    const mentionsLed = text.includes('matriz') || text.includes('led');
    const mentionsServo = text.includes('servo');
    const mentionsConnected = includesAny(text, ['conectado', 'conectados', 'conexion', 'hardware']);

    if (mentionsConnected) {
      return `No hay hardware conectado físicamente. Todos los dispositivos del panel están en simulación: ${total} dispositivos (${active} activos, ${paused} pausados, ${fault} con fallo ficticio), cada uno con estado "Sin conexión física".`;
    }

    const specificType =
      mentionsEsp32 ? 'esp32' : mentionsPir ? 'pir' : mentionsIr ? 'ir' : mentionsUltra ? 'ultrasonic' : mentionsLed ? 'led-matrix' : mentionsServo ? 'servo' : undefined;

    if (specificType) {
      const list = devices.filter((d) => d.type === specificType);
      if (list.length === 0) return 'No encontré datos locales para ese tipo de sensor simulado.';
      const detail = list
        .map((d) => {
          const state = SIMULATION_STATE_LABELS[d.simulationState];
          const reading = this.sensorReading(d);
          return `${d.name} (${SENSOR_TYPE_LABELS[d.type]}, zona ${d.zoneId}): ${state}, ${reading}, hardware real: ${d.hardwareConnection}`;
        })
        .join('; ');
      return `Estado de sensores simulados consultado: ${detail}.`;
    }

    const types = Array.from(new Set(devices.map((d) => SENSOR_TYPE_LABELS[d.type]))).join(', ');
    return `El sistema cuenta con ${total} dispositivos simulados: ${types}. Resumen de simulación: ${active} activos, ${paused} pausados, ${fault} con fallo ficticio. Ninguno tiene conexión física real (hardware: sin conexión).`;
  }

  private sensorReading(d: { type: string; reading?: string | number | boolean; servoAngle?: number; ledPattern?: string }): string {
    switch (d.type) {
      case 'ir':
        return `paso detectado: ${d.reading ? 'Sí' : 'No'}`;
      case 'pir':
        return `movimiento detectado: ${d.reading ? 'Sí' : 'No'}`;
      case 'ultrasonic':
        return `distancia simulada: ${d.reading ?? 0} cm`;
      case 'servo':
        return `ángulo simulado: ${d.servoAngle ?? 0}°`;
      case 'led-matrix':
        return `patrón simulado: ${d.ledPattern ?? 'normal'}`;
      case 'esp32':
      default:
        return 'estado lógico sin telemetría real';
    }
  }

  private statsAnswer(): string {
    const changes = this.history.changeCount();
    const maxTotal = this.history.maxTotalObserved();
    const hasHistory = !this.history.isEmpty();
    const last = this.history.eventsNewestFirst()[0];

    if (!hasHistory) {
      return `Estadísticas de sesión: ${changes} cambios registrados, máximo total observado ${maxTotal} personas (incluye el valor inicial). Aún no hay historial de cambios en esta sesión.`;
    }

    const lastText = last
      ? ` Último evento: ${last.zoneName} (${last.actionLabel}, ${last.previousPeople} → ${last.newPeople}).`
      : '';
    return `Estadísticas de sesión: ${changes} cambios registrados, máximo total observado ${maxTotal} personas. Hay historial de ocupación en esta sesión.${lastText}`;
  }
}
