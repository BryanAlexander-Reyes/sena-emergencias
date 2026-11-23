import { isPlatformBrowser } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, timeOutline, warningOutline } from 'ionicons/icons';

import { DemoPermissionsService } from '../../../core/auth/demo-permissions.service';
import { esAlarmaIncidente, type AlarmaIncidente } from '../../../core/data/alarm-incident-contract';
import { ManualAlarmSyncService } from '../../../core/services/manual-alarm-sync.service';
import { ManualAlarmService } from '../../../core/services/manual-alarm.service';

const MENSAJE_GENERAL = 'Sigue las indicaciones del personal autorizado.';

const MENSAJES_POR_EVENTO: Readonly<Record<AlarmaIncidente, string>> = {
  incendio:
    'Evacúa con calma por la ruta de escape más cercana. No uses ascensores y sigue las indicaciones del personal autorizado.',
  sismo:
    'Protégate bajo un mueble resistente y aléjate de ventanas y objetos que puedan caer. Espera la señal para evacuar.',
  impacto:
    'Aléjate de la zona afectada y permanece en un lugar seguro. Sigue las indicaciones del personal autorizado.',
  emergencia: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
  simulacro:
    'Es un simulacro. Diríjase con calma a la zona segura designada y siga las indicaciones del personal autorizado.',
};

@Component({
  selector: 'app-manual-emergency-modal',
  templateUrl: './manual-emergency-modal.component.html',
  styleUrls: ['./manual-emergency-modal.component.scss'],
  imports: [IonIcon],
})
export class ManualEmergencyModalComponent {
  private readonly manualAlarmSync = inject(ManualAlarmSyncService);
  private readonly manualAlarmService = inject(ManualAlarmService);
  private readonly permissions = inject(DemoPermissionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  readonly activeAlarm = this.manualAlarmSync.activeAlarm;
  readonly activeAlarms = this.manualAlarmSync.activeAlarms ?? computed(() => {
    const alarm = this.activeAlarm();
    return alarm ? [alarm] : [];
  });
  selectAlarm(id: string): void {
    if (!this.finalizing()) this.manualAlarmSync.selectAlarm(id);
  }
  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');
  readonly finalizeButton = viewChild<ElementRef<HTMLButtonElement>>('finalizeButton');
  readonly cancelFinalizeButton = viewChild<ElementRef<HTMLButtonElement>>('cancelFinalizeButton');
  readonly titleId = 'manual-emergency-title';
  readonly descriptionId = 'manual-emergency-description';
  readonly statusMessageId = 'manual-emergency-status-message';

  readonly canFinalize = computed(() => this.permissions.can('alarm:control'));
  readonly emergencyMessage = computed(() => {
    const evento = this.activeAlarm()?.evento;
    return esAlarmaIncidente(evento) ? MENSAJES_POR_EVENTO[evento] : MENSAJE_GENERAL;
  });
  readonly finalizing = signal(false);
  readonly confirmationOpen = signal(false);
  readonly finalizeError = signal<string | null>(null);
  readonly pendingSyncMessage = signal<string | null>(null);

  readonly severityLabel = computed(() => {
    const severity = this.activeAlarm()?.severidad?.trim();
    return severity ? severity.toUpperCase() : 'SIN SEVERIDAD';
  });

  readonly severityTone = computed<'critical' | 'high' | 'medium' | 'low' | 'unknown'>(() => {
    const severity = this.activeAlarm()?.severidad?.trim().toLowerCase();

    switch (severity) {
      case 'critica':
      case 'crítica':
      case 'critical':
        return 'critical';
      case 'alta':
      case 'high':
        return 'high';
      case 'media':
      case 'medium':
      case 'moderada':
        return 'medium';
      case 'baja':
      case 'low':
        return 'low';
      default:
        return 'unknown';
    }
  });

  readonly activatedAtLabel = computed(() => {
    const value = this.activeAlarm()?.fecha_activacion;
    if (!value) {
      return 'Fecha no disponible';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  });

  private previouslyFocusedElement: HTMLElement | null = null;
  private focusTrapActive = false;
  private wasVisible = false;
  private activeAlarmId: string | null = null;
  private finalizeConfirmedForAlarmId: string | null = null;

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this.focusTrapActive) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) {
      return;
    }

    const focusable = this.getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || active === panel || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (!panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  constructor() {
    addIcons({ alertCircleOutline, checkmarkCircleOutline, timeOutline, warningOutline });

    effect(() => {
      const alarm = this.activeAlarm();
      const visible = alarm !== null;
      const alarmId = alarm?.id ?? null;

      if (alarmId !== this.activeAlarmId) {
        this.activeAlarmId = alarmId;
        this.resetFinalizeState(alarmId);
      }

      if (visible === this.wasVisible) {
        return;
      }

      this.wasVisible = visible;

      if (visible) {
        this.onDialogShown();
      } else {
        this.onDialogHidden();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.removeFocusTrap();
      this.restorePreviousFocus();
    });
  }

  requestFinalize(): void {
    if (this.finalizing() || this.finalizeConfirmedForAlarmId !== null) {
      return;
    }

    if (!this.canFinalize()) {
      this.finalizeError.set('No tienes permisos para finalizar esta emergencia.');
      return;
    }

    const alarmId = this.activeAlarm()?.id;
    if (!alarmId) {
      this.finalizeError.set('No existe una emergencia activa para finalizar.');
      return;
    }

    this.finalizeError.set(null);
    this.confirmationOpen.set(true);
    this.focusAfterRender(() => this.cancelFinalizeButton()?.nativeElement);
  }

  cancelFinalizeRequest(): void {
    if (this.finalizing()) {
      return;
    }

    this.confirmationOpen.set(false);
    this.focusAfterRender(() => this.finalizeButton()?.nativeElement);
  }

  async confirmFinalize(): Promise<void> {
    if (this.finalizing() || this.finalizeConfirmedForAlarmId !== null) {
      return;
    }

    if (!this.canFinalize()) {
      this.finalizeError.set('No tienes permisos para finalizar esta emergencia.');
      this.confirmationOpen.set(false);
      return;
    }

    const alarmId = this.activeAlarm()?.id;
    if (!alarmId) {
      this.finalizeError.set('No existe una emergencia activa para finalizar.');
      this.confirmationOpen.set(false);
      return;
    }

    this.finalizing.set(true);
    this.finalizeError.set(null);
    this.pendingSyncMessage.set(null);

    try {
      await this.manualAlarmService.finalize(alarmId, this.activeAlarm()?.evento ?? null);
      if (this.activeAlarm()?.id !== alarmId) {
        return;
      }
      this.finalizeConfirmedForAlarmId = alarmId;
      this.confirmationOpen.set(false);
      this.pendingSyncMessage.set('Finalización confirmada. Esperando sincronización...');
      this.focusAfterRender(() => this.dialogPanel()?.nativeElement);
      await this.refreshAfterFinalize(alarmId);
    } catch (error: unknown) {
      if (this.activeAlarm()?.id === alarmId || this.finalizeConfirmedForAlarmId === alarmId) {
        await this.handleFinalizeError(error, alarmId);
      }
    } finally {
      if (this.activeAlarm()?.id === alarmId || this.finalizeConfirmedForAlarmId === alarmId || !this.finalizing()) {
        this.finalizing.set(false);
      }
    }
  }

  private async refreshAfterFinalize(alarmId: string): Promise<void> {
    await this.manualAlarmSync.refresh();

    if (this.activeAlarm()?.id !== alarmId) {
      return;
    }

    if (this.manualAlarmSync.syncStatus() === 'error') {
      if (this.activeAlarm()?.id === alarmId) {
        this.pendingSyncMessage.set('Finalización confirmada. Esperando sincronización...');
        this.finalizeError.set(
          'La finalización fue confirmada, pero no se pudo verificar la sincronización. Se reintentará automáticamente.',
        );
      }
      return;
    }

    if (this.activeAlarm()?.id === alarmId) {
      this.pendingSyncMessage.set('Finalización confirmada. Esperando sincronización...');
      this.finalizeError.set('La emergencia sigue activa tras la sincronización. Espera la próxima actualización.');
    }
  }

  private async handleFinalizeError(error: unknown, requestedAlarmId: string): Promise<void> {
    console.error('No se pudo finalizar la emergencia desde el modal global', error);

    if (this.activeAlarm()?.id !== requestedAlarmId && this.finalizeConfirmedForAlarmId !== requestedAlarmId) {
      return;
    }

    if (this.isAmbiguousFinalizeError(error)) {
      await this.manualAlarmSync.refresh();
      const currentId = this.activeAlarm()?.id ?? null;
      if (currentId === null || currentId !== requestedAlarmId) {
        this.finalizeConfirmedForAlarmId = requestedAlarmId;
        this.confirmationOpen.set(false);
        this.pendingSyncMessage.set('La emergencia ya no se encuentra activa. Esperando sincronización...');
        this.finalizeError.set(null);
        this.focusAfterRender(() => this.dialogPanel()?.nativeElement);
        return;
      }
    }

    if (this.getErrorStatus(error) === 404 || this.getErrorStatus(error) === 409) {
      await this.manualAlarmSync.refresh();
      const currentId = this.activeAlarm()?.id ?? null;
      if (currentId === null || currentId !== requestedAlarmId) {
        this.finalizeConfirmedForAlarmId = requestedAlarmId;
        this.confirmationOpen.set(false);
        this.pendingSyncMessage.set('La emergencia ya no se encuentra activa. Esperando sincronización...');
        this.finalizeError.set(null);
        this.focusAfterRender(() => this.dialogPanel()?.nativeElement);
        return;
      }
    }

    this.finalizeError.set(this.getFinalizeErrorMessage(error));
  }

  private isAmbiguousFinalizeError(error: unknown): boolean {
    const status = this.getErrorStatus(error);
    const code = this.getErrorCode(error);
    if (status !== undefined) {
      return false;
    }

    return code === undefined || code === 'INVALID_ALARM_RESPONSE';
  }

  private getFinalizeErrorMessage(error: unknown): string {
    const code = this.getErrorCode(error);
    const status = this.getErrorStatus(error);

    if (code === 'SUPABASE_NOT_CONFIGURED') {
      return 'El servicio de alarmas no está disponible en este momento.';
    }
    if (code === 'UNAUTHENTICATED' || status === 401) {
      return 'Tu sesión no es válida o expiró. Inicia sesión nuevamente para continuar.';
    }
    if (status === 403) {
      return 'No tienes permisos para finalizar esta emergencia.';
    }
    if (status === 404) {
      return 'La emergencia indicada no existe o ya no está activa.';
    }
    if (status === 409) {
      return 'La emergencia ya fue finalizada o su estado cambió. Se actualizará el estado.';
    }
    if (code === 'INVALID_ALARM_ID' || code === 'INVALID_ALARM_RESPONSE') {
      return 'No se pudo confirmar la finalización de la alarma. Intenta nuevamente.';
    }

    return 'No fue posible finalizar la emergencia. Verifica tu conexión e intenta nuevamente.';
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

  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === 'number') {
      return maybeStatus;
    }

    const context = (error as { context?: unknown }).context;
    if (typeof context === 'object' && context !== null && 'status' in context) {
      const contextStatus = (context as { status?: unknown }).status;
      return typeof contextStatus === 'number' ? contextStatus : undefined;
    }

    return undefined;
  }

  private resetFinalizeState(currentAlarmId: string | null): void {
    this.finalizing.set(false);
    this.confirmationOpen.set(false);
    this.finalizeError.set(null);
    this.pendingSyncMessage.set(null);
    if (this.finalizeConfirmedForAlarmId !== currentAlarmId) {
      this.finalizeConfirmedForAlarmId = null;
    }
  }

  private focusAfterRender(getElement: () => HTMLElement | undefined): void {
    if (!this.browser) {
      return;
    }

    afterNextRender(
      () => {
        if (!this.wasVisible) {
          return;
        }

        const element = getElement();
        if (element && this.canReceiveFocus(element)) {
          element.focus();
          return;
        }

        this.dialogPanel()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private onDialogShown(): void {
    if (!this.browser) {
      return;
    }

    const active = document.activeElement;
    this.previouslyFocusedElement = active instanceof HTMLElement ? active : null;
    this.addFocusTrap();

    afterNextRender(
      () => {
        if (!this.wasVisible || !this.focusTrapActive) {
          return;
        }

        this.dialogPanel()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private onDialogHidden(): void {
    this.removeFocusTrap();
    this.restorePreviousFocus();
    this.wasVisible = false;
    this.activeAlarmId = null;
    this.resetFinalizeState(null);
  }

  private addFocusTrap(): void {
    if (!this.browser || this.focusTrapActive) {
      return;
    }

    document.addEventListener('keydown', this.handleDocumentKeydown, true);
    this.focusTrapActive = true;
  }

  private removeFocusTrap(): void {
    if (!this.browser || !this.focusTrapActive) {
      return;
    }

    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.focusTrapActive = false;
  }

  private restorePreviousFocus(): void {
    if (!this.browser || !this.previouslyFocusedElement) {
      return;
    }

    const target = this.previouslyFocusedElement;
    this.previouslyFocusedElement = null;

    if (this.canReceiveFocus(target)) {
      target.focus();
    }
  }

  private canReceiveFocus(element: HTMLElement): boolean {
    if (!element.isConnected) {
      return false;
    }

    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (element.closest('[inert]')) {
      return false;
    }

    const disabled = 'disabled' in element && Boolean((element as HTMLButtonElement).disabled);
    if (disabled) {
      return false;
    }

    return true;
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
    );
  }
}
