import type { PublicRole, SessionSnapshot } from './auth-domain.types';

/** Estado de sesión, identidad y rol actual, incluidos perfiles de acceso directo. */
export interface SessionFacade {
  readonly snapshot: SessionSnapshot;
  whenReady(): Promise<SessionSnapshot>;
  selectPublicRole(role: PublicRole): void;
  clear(): void;
}
