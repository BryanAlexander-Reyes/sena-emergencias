import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AUTH_FACADE } from './app/core/auth/auth-facade.contract';
import { INSTRUCTOR_ACCOUNT_REPOSITORY } from './app/core/auth/instructor-account-repository.contract';
import { SupabaseAuthService } from './app/core/auth/supabase-auth.service';
import { SupabaseInstructorAccountRepository } from './app/core/auth/supabase-instructor-account.repository';
import { SupabaseSessionService } from './app/core/auth/supabase-session.service';
import { ALARM_COMMAND_GATEWAY, HttpAlarmCommandGateway } from './app/core/data/alarm-command.gateway';
import { SupabaseZonesRepository } from './app/core/data/supabase-zones.repository';
import { ZONE_CONFIG_MODE } from './app/core/data/zone-config.source';
import { ZONES_REPOSITORY } from './app/core/data/zones-repository.contract';
import { SupabaseService } from './app/core/supabase.service';
import { uixRouteAnimation } from './app/route-transition';
import { ALARM_COMMAND_ENDPOINT } from './environments/alarm-command.config';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ navAnimation: uixRouteAnimation }),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    { provide: AUTH_FACADE, useClass: SupabaseAuthService },
    { provide: INSTRUCTOR_ACCOUNT_REPOSITORY, useClass: SupabaseInstructorAccountRepository },
    { provide: ZONES_REPOSITORY, useClass: SupabaseZonesRepository },
    {
      provide: ALARM_COMMAND_GATEWAY,
      useFactory: () => {
        const supabase = inject(SupabaseService);
        return new HttpAlarmCommandGateway({
          endpoint: ALARM_COMMAND_ENDPOINT,
          obtainJwt: async () => {
            const client = supabase.client;
            if (!client) return null;
            const { data, error } = await client.auth.getSession();
            return error || !data.session ? null : data.session.access_token;
          },
        });
      },
    },
    // ZONAS.3: la fuente pública aún no existe. Se explicita DEMO para no
    // consultar una tabla inexistente ni disfrazar errores como datos reales.
    { provide: ZONE_CONFIG_MODE, useValue: 'remote' },
    // Bloquea el arranque hasta que la sesión Supabase se haya restaurado o
    // descartado. Hasta entonces el estado es `inicializando` sin privilegios.
    provideAppInitializer(() => inject(SupabaseSessionService).initialize()),
  ],
});
