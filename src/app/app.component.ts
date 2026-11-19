import { Component, afterNextRender, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { dismissSplash } from './app-splash';
import { OccupancyAlertEngineService } from './core/services/occupancy-alert-engine.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  // Instancia el motor para evaluar cambios de ocupación durante la sesión.
  private readonly occupancyAlertEngine = inject(OccupancyAlertEngineService);

  constructor() {
    // El splash vive en index.html porque provideAppInitializer bloquea el
    // bootstrap mientras se restaura la sesión. Se retira en el primer render,
    // sin tocar la inicialización ni la validación de Supabase.
    afterNextRender(() => dismissSplash());
  }
}
