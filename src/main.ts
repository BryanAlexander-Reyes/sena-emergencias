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

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    { provide: AUTH_FACADE, useClass: SupabaseAuthService },
    { provide: INSTRUCTOR_ACCOUNT_REPOSITORY, useClass: SupabaseInstructorAccountRepository },
    // Bloquea el arranque hasta que la sesión Supabase se haya restaurado o
    // descartado. Hasta entonces el estado es `inicializando` sin privilegios.
    provideAppInitializer(() => inject(SupabaseSessionService).initialize()),
  ],
});
