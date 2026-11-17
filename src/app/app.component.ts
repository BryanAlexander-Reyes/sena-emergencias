import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { OccupancyAlertEngineService } from './core/services/occupancy-alert-engine.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  // Instancia el motor para evaluar cambios de ocupación durante la sesión.
  private readonly occupancyAlertEngine = inject(OccupancyAlertEngineService);

  constructor() {}
}
