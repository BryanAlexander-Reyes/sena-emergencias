import { registerPlugin, WebPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Contrato del plugin nativo que entrega el desafío FCM persistido mientras el
 * bridge JavaScript no estaba disponible.
 *
 * El objeto se devuelve vacío cuando no hay desafío pendiente. El desafío se
 * consume en nativo al leerlo, por lo que cada llamada entrega como máximo uno.
 * El evento `challengeStored` no incluye el desafío, solo avisa de que existe.
 */
export interface FcmRegistrationChallengePayload {
  readonly challenge?: string;
  readonly exp?: number;
}

export interface FcmRegistrationChallengePlugin {
  consumePending(): Promise<FcmRegistrationChallengePayload>;
  addListener(eventName: 'challengeStored', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

/** Implementación web de seguridad: el registro FCM solo ocurre en Android. */
export class FcmRegistrationChallengeWeb extends WebPlugin implements FcmRegistrationChallengePlugin {
  async consumePending(): Promise<FcmRegistrationChallengePayload> {
    return {};
  }
}

export const FcmRegistrationChallenge = registerPlugin<FcmRegistrationChallengePlugin>('FcmRegistrationChallenge', {
  web: () => new FcmRegistrationChallengeWeb(),
});
