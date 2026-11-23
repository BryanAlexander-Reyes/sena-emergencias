
package com.sena.crowdintelligence;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SENA_APPCHECK";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor 8 exige registrar los plugins locales antes de crear el bridge.
        registerPlugin(FirebaseAppCheckPlugin.class);
        registerPlugin(FcmRegistrationChallengePlugin.class);
        super.onCreate(savedInstanceState);

        // Inicializar Firebase
        FirebaseApp.initializeApp(this);

        FirebaseAppCheck firebaseAppCheck =
            FirebaseAppCheck.getInstance();

        // El proveedor se elige en tiempo de compilación según el source set:
        // src/debug usa el proveedor Debug; src/release usa Play Integrity.
        AppCheckProviderInstaller.install(firebaseAppCheck);

        // Comprobar si Firebase puede generar el token
        firebaseAppCheck.getAppCheckToken(false)
            .addOnSuccessListener(result -> {

                Log.i(
                    TAG,
                    "SUCCESS: Firebase App Check obtuvo un token"
                );

            })
            .addOnFailureListener(error -> {

                Log.e(
                    TAG,
                    "ERROR: Firebase App Check no pudo obtener el token",
                    error
                );

            });
    }
}
