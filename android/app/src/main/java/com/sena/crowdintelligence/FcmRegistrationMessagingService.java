package com.sena.crowdintelligence;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Único servicio FCM de la app.
 *
 * Hereda del servicio del plugin Capacitor para conservar la ruta original de
 * las notificaciones de emergencia. Los desafíos de registro se interceptan,
 * se validan y se persisten; si el bridge está cargado se notifica a Angular
 * mediante un evento sin datos sensibles. El almacenamiento se consume una sola
 * vez y no se reenvía el desafío al plugin PushNotifications.
 */
public class FcmRegistrationMessagingService extends MessagingService {

    private static final String CHALLENGE_TIPO = "fcm_registration_challenge";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();

        if (data != null && CHALLENGE_TIPO.equals(data.get("tipo"))) {
            if (FcmRegistrationChallengeStore.save(getApplicationContext(), data)) {
                FcmRegistrationChallengePlugin.notifyChallengeStored();
            }
            return;
        }

        super.onMessageReceived(remoteMessage);
    }
}
