import { Injectable, computed, signal } from '@angular/core';

import type { ManualAlarmNotification } from '../data/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationStoreService {
  private readonly notificationsState = signal<readonly ManualAlarmNotification[]>([]);

  readonly notifications = this.notificationsState.asReadonly();

  readonly unreadNotifications = computed(() =>
    this.notifications().filter((notification) => notification.readStatus === 'unread'),
  );

  readonly unreadCount = computed(() => this.unreadNotifications().length);

  readonly totalCount = computed(() => this.notifications().length);

  addNotification(notification: ManualAlarmNotification): boolean {
    const current = this.notificationsState();

    if (current.some((existing) => existing.dedupeKey === notification.dedupeKey)) {
      return false;
    }

    const nextNotification: ManualAlarmNotification = { ...notification, recipients: { ...notification.recipients } };
    const next = this.insertByActivatedAt(current, nextNotification);
    this.notificationsState.set(next);

    return true;
  }

  markAsRead(eventId: string): boolean {
    let updated = false;

    this.notificationsState.update((current) =>
      current.map((notification) => {
        if (notification.eventId !== eventId || notification.readStatus === 'read') {
          return notification;
        }

        updated = true;
        return { ...notification, readStatus: 'read' as const };
      }),
    );

    return updated;
  }

  markAllAsRead(): void {
    this.notificationsState.update((current) => {
      let hasUnread = false;
      const next = current.map((notification) => {
        if (notification.readStatus === 'read') {
          return notification;
        }

        hasUnread = true;
        return { ...notification, readStatus: 'read' as const };
      });

      return hasUnread ? next : current;
    });
  }

  private insertByActivatedAt(
    notifications: readonly ManualAlarmNotification[],
    notification: ManualAlarmNotification,
  ): readonly ManualAlarmNotification[] {
    const activatedAt = Date.parse(notification.activatedAt);
    const index = notifications.findIndex((existing) => Date.parse(existing.activatedAt) < activatedAt);

    if (index === -1) {
      return [...notifications, notification];
    }

    return [...notifications.slice(0, index), notification, ...notifications.slice(index)];
  }
}
