package com.sena.crowdintelligence;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.AppCheckToken;
import com.google.firebase.appcheck.FirebaseAppCheck;

/**
 * Puente nativo que expone el token de Firebase App Check al layer web.
 *
 * La inicialización de Firebase y la selección del proveedor (Debug / Play
 * Integrity) permanecen en MainActivity. Este plugin solo solicita el token
 * cuando Angular lo pide, de forma asíncrona, sin bloquear el hilo principal.
 */
@CapacitorPlugin(name = "FirebaseAppCheck")
public class FirebaseAppCheckPlugin extends Plugin {

    private static final String TAG = "SENA_APPCHECK_PLUGIN";

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseAppCheck.getInstance()
            .getAppCheckToken(false)
            .addOnSuccessListener((AppCheckToken appCheckToken) -> {
                String token = appCheckToken == null ? null : appCheckToken.getToken();

                if (token == null || token.isEmpty()) {
                    // Nunca se registra el valor del token.
                    Log.w(TAG, "App Check devolvió un token vacío");
                    call.reject("No se pudo obtener el token de App Check", "APP_CHECK_EMPTY_TOKEN");
                    return;
                }

                JSObject result = new JSObject();
                result.put("token", token);
                call.resolve(result);
            })
            .addOnFailureListener(error -> {
                // Solo se registra la clase del error para no exponer tokens ni mensajes sensibles.
                Log.e(TAG, "Fallo al solicitar token de App Check: " + error.getClass().getSimpleName());
                call.reject("No se pudo obtener el token de App Check", "APP_CHECK_TOKEN_ERROR");
            });
    }
}
