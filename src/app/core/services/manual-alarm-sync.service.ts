import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

import { ManualAlarmService, type ManualAlarmRecord } from './manual-alarm.service';

type ManualAlarmSyncStatus = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({
  providedIn: 'root',
})
export class ManualAlarmSyncService {
  private readonly manualAlarmService = inject(ManualAlarmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  private readonly activeAlarmState = signal<ManualAlarmRecord | null>(null);
  private readonly activeAlarmsState = signal<readonly ManualAlarmRecord[]>([]);
  private requestedAlarmId: string | null = null;
  private readonly syncStatusState = signal<ManualAlarmSyncStatus>('idle');
  private readonly lastCheckedAtState = signal<Date | null>(null);

  readonly activeAlarm = this.activeAlarmState.asReadonly();
  readonly activeAlarms = this.activeAlarmsState.asReadonly();
  readonly hasActiveAlarm = computed(() => this.activeAlarmState() !== null);
  readonly syncStatus = this.syncStatusState.asReadonly();
  readonly lastCheckedAt = this.lastCheckedAtState.asReadonly();

  private refreshPromise: Promise<void> | null = null;
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private listenersRegistered = false;

  private readonly handleVisibilityChange = (): void => {
    if (this.isDocumentVisible()) {
      void this.refresh();
    }
  };

  private readonly handleOnline = (): void => {
    if (this.isDocumentVisible()) {
      void this.refresh();
    }
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stop();
    });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.registerBrowserListeners();

    if (this.isDocumentVisible()) {
      void this.refresh();
    }

    if (this.browser) {
      this.pollingIntervalId = globalThis.setInterval(() => {
        if (this.isDocumentVisible()) {
          void this.refresh();
        }
      }, 10_000);
    }
  }

  stop(): void {
    this.started = false;

    if (this.pollingIntervalId !== null) {
      globalThis.clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }

    this.unregisterBrowserListeners();
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.syncStatusState.set('loading');

    const request = this.manualAlarmService
      .getActiveAlarms()
      .then((alarms) => {
        this.applyActiveAlarms(alarms);
      })
      .catch((error: unknown) => {
        this.handleRefreshError(error);
      })
      .finally(() => {
        if (this.refreshPromise === request) {
          this.refreshPromise = null;
        }
      });

    this.refreshPromise = request;
    return request;
  }

  selectAlarm(id: string): void {
    this.requestedAlarmId = id;
    const alarm = this.activeAlarmsState().find(item => item.id === id);
    if (alarm) this.activeAlarmState.set(alarm);
  }

  private applyActiveAlarms(alarms: ManualAlarmRecord[]): void {
    if (alarms.some(alarm => alarm.estado !== undefined && alarm.estado !== 'activa')) {
      this.syncStatusState.set('error');
      return;
    }
    const unique = [...new Map(alarms.map(alarm => [alarm.id, alarm])).values()]
      .sort((a, b) => a.fecha_activacion.localeCompare(b.fecha_activacion) || a.id.localeCompare(b.id));
    const selected = unique.find(alarm => alarm.id === this.requestedAlarmId)
      ?? unique.find(alarm => alarm.id === this.activeAlarmState()?.id)
      ?? unique[0] ?? null;
    if (selected?.id === this.requestedAlarmId) this.requestedAlarmId = null;
    this.activeAlarmsState.set(unique);
    this.activeAlarmState.set(selected);
    this.syncStatusState.set('ready');
    this.lastCheckedAtState.set(new Date());
  }

  private handleRefreshError(error: unknown): void {
    this.syncStatusState.set('error');

    const code = this.getErrorCode(error);
    if (code === 'SUPABASE_NOT_CONFIGURED') {
      console.error('No se pudo sincronizar la alarma manual: servicio no configurado.');
      return;
    }

    console.error('No se pudo sincronizar la alarma manual activa.');
  }

  private registerBrowserListeners(): void {
    if (!this.browser || this.listenersRegistered) {
      return;
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    globalThis.addEventListener('online', this.handleOnline);
    this.listenersRegistered = true;
  }

  private unregisterBrowserListeners(): void {
    if (!this.browser || !this.listenersRegistered) {
      return;
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    globalThis.removeEventListener('online', this.handleOnline);
    this.listenersRegistered = false;
  }

  private isDocumentVisible(): boolean {
    if (!this.browser) {
      return false;
    }

    return document.visibilityState === 'visible';
  }

  private getErrorCode(error: unknown): string | undefined {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }

    return undefined;
  }
}
