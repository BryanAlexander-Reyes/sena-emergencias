import { Component, computed, inject, signal } from '@angular/core';
import { AlertController, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  businessOutline,
  cafeOutline,
  informationCircleOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  walkOutline,
} from 'ionicons/icons';

import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';
import { ZoneCardComponent } from '../../shared/zone-card/zone-card.component';
import { ZoneConfigStatusComponent } from '../../shared/zone-config-status/zone-config-status.component';

@Component({
  selector: 'app-zonas',
  templateUrl: 'zonas.page.html',
  styleUrls: ['zonas.page.scss'],
  imports: [IonContent, IonIcon, FeatureIntroComponent, ZoneCardComponent, ZoneConfigStatusComponent],
})
export class ZonasPage {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alertController = inject(AlertController);
  private readonly permissions = inject(DemoPermissionsService);

  readonly zoneConfigMode = this.monitoring.zoneConfigMode;
  readonly zoneConfigStatus = this.monitoring.zoneConfigStatus;
  readonly zoneConfigError = this.monitoring.zoneConfigError;

  readonly zones = this.monitoring.zones;
  readonly totalPeople = this.monitoring.totalPeople;
  readonly totalZones = this.monitoring.monitoredZones;
  readonly hasChanges = this.monitoring.hasOccupancyChanges;
  readonly simulationMessage = signal('');
  readonly canUpdateOccupancy = computed(() => this.permissions.can('occupancy:update'));
  readonly canResetOccupancy = computed(() => this.permissions.can('occupancy:reset'));
  private readonly readOnlyMessage = 'Tu perfil solo permite consultar la ocupación.';

  retryZoneConfigs(): void {
    void this.monitoring.retryZoneConfigs();
  }

  constructor() {
    void this.monitoring.ensureZoneConfigs();
    addIcons({
      bookOutline,
      businessOutline,
      cafeOutline,
      informationCircleOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      walkOutline,
    });
  }

  increment(zoneId: string): void {
    if (!this.permissions.can('occupancy:update')) {
      this.simulationMessage.set(this.readOnlyMessage);
      return;
    }

    this.simulationMessage.set('');
    this.monitoring.incrementOccupancy(zoneId);
  }

  decrement(zoneId: string): void {
    if (!this.permissions.can('occupancy:update')) {
      this.simulationMessage.set(this.readOnlyMessage);
      return;
    }

    this.simulationMessage.set('');
    this.monitoring.decrementOccupancy(zoneId);
  }

  isAtInitial(zoneId: string): boolean {
    return this.monitoring.isAtInitialOccupancy(zoneId);
  }

  resetZone(zoneId: string): void {
    if (!this.permissions.can('occupancy:reset')) {
      this.simulationMessage.set(this.readOnlyMessage);
      return;
    }

    const name = this.monitoring.zoneById(zoneId)?.name;

    if (!this.monitoring.resetZoneOccupancy(zoneId)) {
      return;
    }

    const people = this.monitoring.zoneById(zoneId)?.people ?? 0;
    this.simulationMessage.set(`${name ?? 'Zona'}: ocupación restablecida a ${people} personas.`);
  }

  async confirmResetAll(): Promise<void> {
    if (!this.permissions.can('occupancy:reset')) {
      this.simulationMessage.set(this.readOnlyMessage);
      return;
    }

    const alert = await this.alertController.create({
      header: 'Restablecer todas las zonas',
      message:
        'Se recuperarán las ocupaciones iniciales de las cuatro zonas. Las alertas automáticas de ocupación se actualizarán según el estado restablecido.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Restablecer',
          role: 'destructive',
          handler: () => this.resetAllZones(),
        },
      ],
    });

    await alert.present();
  }

  private resetAllZones(): void {
    if (!this.permissions.can('occupancy:reset')) {
      this.simulationMessage.set(this.readOnlyMessage);
      return;
    }

    if (!this.monitoring.resetAllOccupancy()) {
      return;
    }

    this.simulationMessage.set('Todas las zonas se restablecieron a sus valores iniciales.');
  }
}
