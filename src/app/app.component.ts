
import { afterNextRender, Component, computed, effect, inject, type OnInit, signal, untracked } from '@angular/core';
import { IonApp, IonButton, IonRouterOutlet, IonSpinner } from '@ionic/angular';


import { dismissSplash } from './app-splash';
import { DemoSessionService } from './core/auth/demo-session.service';
import { ManualAlarmSyncService } from './core/services/manual-alarm-sync.service';
import { OccupancyAlertEngineService } from './core/services/occupancy-alert-engine.service';
import { PushNotificationService } from './core/services/push-notification.service';
import { ManualEmergencyModalComponent } from './shared/components/manual-emergency-modal/manual-emergency-modal.component';


type InitialAlarmCheckStatus = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonButton, IonRouterOutlet, IonSpinner, ManualEmergencyModalComponent],
  styles: [
    `
      .initial-alarm-check {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--ion-background-color, #0b1120);
        color: var(--ion-text-color, #f8fafc);
      }

      .initial-alarm-check__panel {
        width: min(100%, 420px);
        display: grid;
        gap: 16px;
        justify-items: center;
        text-align: center;
      }

      .initial-alarm-check__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
      }

      .initial-alarm-check__message {
        margin: 0;
        color: var(--ion-color-medium, #94a3b8);
        line-height: 1.5;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  // Instancia el motor para evaluar cambios de ocupación durante la sesión.
  private readonly occupancyAlertEngine = inject(OccupancyAlertEngineService);
  private readonly pushNotificationService = inject(PushNotificationService);
  readonly manualAlarmSync = inject(ManualAlarmSyncService);
  private readonly session = inject(DemoSessionService);

  readonly initialAlarmCheckStatus = signal<InitialAlarmCheckStatus>('loading');
  readonly emergencyModalVisible = computed(
    () => this.initialAlarmCheckStatus() === 'ready' && this.manualAlarmSync.activeAlarm() !== null,
  );
  readonly contentBlocked = computed(() => this.initialAlarmCheckStatus() !== 'ready' || this.emergencyModalVisible());

  constructor() {
    // Una consulta inicial fallida no debe ocultar una alarma recuperada por
    // polling, FCM o al volver al primer plano.
    effect(() => {
      if (this.manualAlarmSync.syncStatus() === 'ready') {
        this.initialAlarmCheckStatus.set('ready');
      }
    });
    // También recuperar inmediatamente tras login/cambio de identidad. No
    // ejecutar llamadas al SDK dentro del callback de Supabase Auth.
    effect(() => {
      this.session.authenticatedAccount();
      if (this.session.status() === 'lista') {
        untracked(() => { void this.checkInitialAlarmState(); });
      }
    });
    // El splash vive en index.html porque provideAppInitializer bloquea el
    // bootstrap mientras se restaura la sesión. Se retira en el primer render,
    // sin tocar la inicialización ni la validación de Supabase.
    afterNextRender(() => dismissSplash());
  }

  ngOnInit(): void {
    this.manualAlarmSync.start();
    void this.checkInitialAlarmState();

    void this.pushNotificationService.initialize();
  }

  async retryInitialAlarmCheck(): Promise<void> {
    this.initialAlarmCheckStatus.set('loading');
    await this.checkInitialAlarmState();
  }

  private async checkInitialAlarmState(): Promise<void> {
    try {
      await this.manualAlarmSync.refresh();

      if (this.manualAlarmSync.syncStatus() === 'ready') {
        this.initialAlarmCheckStatus.set('ready');
        return;
      }

      this.initialAlarmCheckStatus.set('error');
    } catch {
      this.initialAlarmCheckStatus.set('error');
    }
  }
}
