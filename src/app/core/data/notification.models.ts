/**
 * SENA CROWD INTELLIGENCE — contratos de notificaciones (Fase 1.2).
 *
 * Modelos puros para notificaciones internas/externas. No dependen de Angular,
 * Firebase, WebSocket ni de servicios de plataforma.
 */

export const MANUAL_ALARM_NOTIFICATION_TITLE = '⚠️ PRECAUCIÓN' as const;

export const MANUAL_ALARM_NOTIFICATION_MESSAGE =
  'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.' as const;

export type ManualAlarmNotificationSeverity = 'critical';

export type NotificationReadStatus = 'unread' | 'read';

export type NotificationAudience = 'all-subscribed-devices';

export interface ManualAlarmNotificationRecipients {
  readonly audience: NotificationAudience;
  readonly requiresAuthentication: false;
}

export interface ManualAlarmNotification {
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly title: typeof MANUAL_ALARM_NOTIFICATION_TITLE;
  readonly message: typeof MANUAL_ALARM_NOTIFICATION_MESSAGE;
  readonly severity: ManualAlarmNotificationSeverity;
  readonly activatedAt: string;
  readonly readStatus: NotificationReadStatus;
  readonly recipients: ManualAlarmNotificationRecipients;
}

/**
 * Construye la notificación de alarma manual activada por un usuario autorizado.
 *
 * Función pura: el mismo `eventId` y `activatedAt` producen el mismo resultado.
 * La notificación se dirige a todos los dispositivos suscritos, sin exigir
 * autenticación a los aprendices.
 */
export function createManualAlarmNotification(eventId: string, activatedAt: Date): ManualAlarmNotification {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new Error('Manual alarm notification eventId must not be empty.');
  }

  return {
    eventId: normalizedEventId,
    dedupeKey: `manual-alarm:${normalizedEventId}`,
    title: MANUAL_ALARM_NOTIFICATION_TITLE,
    message: MANUAL_ALARM_NOTIFICATION_MESSAGE,
    severity: 'critical',
    activatedAt: activatedAt.toISOString(),
    readStatus: 'unread',
    recipients: {
      audience: 'all-subscribed-devices',
      requiresAuthentication: false,
    },
  };
}
