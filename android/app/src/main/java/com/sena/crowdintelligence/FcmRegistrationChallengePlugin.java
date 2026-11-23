package com.sena.crowdintelligence;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente nativo para los desafíos FCM persistidos cuando el bridge JavaScript
 * no estaba disponible.
 *
 * `challengeStored` avisa a Angular cuando el bridge ya está cargado. El evento
 * no transporta el desafío: Angular lo recupera con `consumePending()`, que lo
 * elimina del almacenamiento al entregarlo para evitar duplicados.
 */
@CapacitorPlugin(name = "FcmRegistrationChallenge")
public class FcmRegistrationChallengePlugin extends Plugin {

    private static final String EVENT_CHALLENGE_STORED = "challengeStored";

    private static FcmRegistrationChallengePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        FcmRegistrationChallengeStore.PendingChallenge pending = FcmRegistrationChallengeStore.consume(getContext());

        JSObject result = new JSObject();
        if (pending != null) {
            result.put("challenge", pending.challenge);
            result.put("exp", pending.exp);
        }

        call.resolve(result);
    }

    static void notifyChallengeStored() {
        FcmRegistrationChallengePlugin plugin = instance;
        if (plugin != null) {
            plugin.notifyListeners(EVENT_CHALLENGE_STORED, new JSObject(), true);
        }
    }
}
