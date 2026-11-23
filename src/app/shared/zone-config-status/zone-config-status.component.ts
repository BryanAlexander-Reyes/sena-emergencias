import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { businessOutline, reloadOutline, warningOutline } from 'ionicons/icons';

import type { ZoneConfigStatus } from '../../core/services/zone-config-state.service';

/**
 * Aviso de configuración remota de zonas. En DEMO no renderiza nada: las cuatro
 * zonas históricas están sembradas localmente y nunca se consulta la red.
 */
@Component({
  selector: 'app-zone-config-status',
  templateUrl: './zone-config-status.component.html',
  styleUrls: ['./zone-config-status.component.scss'],
  imports: [IonButton, IonIcon],
})
export class ZoneConfigStatusComponent {
  readonly remote = input.required<boolean>();
  readonly status = input.required<ZoneConfigStatus>();
  readonly message = input<string | null>(null);

  readonly retry = output<void>();

  readonly visible = computed(() => this.remote() && this.status() !== 'ready');
  readonly loading = computed(() => this.visible() && (this.status() === 'idle' || this.status() === 'loading'));
  readonly empty = computed(() => this.visible() && this.status() === 'empty');
  readonly error = computed(() => this.visible() && this.status() === 'error');
  readonly canRetry = computed(() => this.error());

  /** El store solo publica mensajes seguros; se fuerza uno genérico si faltase. */
  readonly safeMessage = computed(() => {
    const message = this.message()?.trim();

    return message ? message : 'No fue posible cargar la configuración de zonas.';
  });

  constructor() {
    addIcons({ businessOutline, reloadOutline, warningOutline });
  }
}
