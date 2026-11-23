import { registerPlugin, WebPlugin } from '@capacitor/core';

/**
 * Contrato del plugin nativo `FirebaseAppCheck` registrado en MainActivity.
 * El token se devuelve en un objeto para no exponerlo en logs ni en la firma.
 */
export interface FirebaseAppCheckPlugin {
  getToken(): Promise<{ token: string }>;
}

/** Implementación web de seguridad: nunca se llama desde el navegador. */
export class FirebaseAppCheckWeb extends WebPlugin implements FirebaseAppCheckPlugin {
  async getToken(): Promise<{ token: string }> {
    throw this.unimplemented('Firebase App Check solo está disponible en Android');
  }
}

export const FirebaseAppCheck = registerPlugin<FirebaseAppCheckPlugin>('FirebaseAppCheck', {
  web: () => new FirebaseAppCheckWeb(),
});
