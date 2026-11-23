package com.sena.crowdintelligence;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Almacenamiento privado de un único desafío de registro FCM.
 *
 * Se usa EncryptedSharedPreferences cuando Android Keystore está disponible
 * (minSdk 24) y SharedPreferences privadas como respaldo. Nunca se registran
 * valores en logs y el desafío se elimina en el momento de entregarlo.
 */
final class FcmRegistrationChallengeStore {

    private static final String ENCRYPTED_PREFS_NAME = "sena_fcm_challenge_enc";
    private static final String PLAIN_PREFS_NAME = "sena_fcm_challenge_private";
    private static final String KEY_CHALLENGE = "challenge";
    private static final String KEY_EXP = "exp";

    private static final Pattern CHALLENGE_PATTERN = Pattern.compile("[A-Za-z0-9_-]{32,256}");
    private static final Pattern EXP_PATTERN = Pattern.compile("\\d{1,13}");
    private static final long MAX_EXP_WINDOW_MS = 24L * 60 * 60 * 1000;

    private static final Object LOCK = new Object();

    private FcmRegistrationChallengeStore() {}

    static boolean save(Context context, Map<String, String> data) {
        if (data == null) {
            return false;
        }

        String challenge = data.get("challenge");
        long exp = parseExp(data.get("exp"));

        if (!isValidChallenge(challenge) || exp == 0L) {
            return false;
        }

        synchronized (LOCK) {
            Context app = context.getApplicationContext();
            SharedPreferences encrypted = encryptedPreferences(app);
            SharedPreferences target =
                encrypted == null ? app.getSharedPreferences(PLAIN_PREFS_NAME, Context.MODE_PRIVATE) : encrypted;

            if (encrypted != null) {
                clear(app.getSharedPreferences(PLAIN_PREFS_NAME, Context.MODE_PRIVATE));
            }

            target
                .edit()
                .putString(KEY_CHALLENGE, challenge)
                .putLong(KEY_EXP, exp)
                .commit();
        }

        return true;
    }

    /** Devuelve y elimina atómicamente el desafío pendiente si sigue vigente. */
    static PendingChallenge consume(Context context) {
        synchronized (LOCK) {
            Context app = context.getApplicationContext();

            PendingChallenge pending = consumeFrom(app, encryptedPreferences(app));
            if (pending == null) {
                pending = consumeFrom(app, app.getSharedPreferences(PLAIN_PREFS_NAME, Context.MODE_PRIVATE));
            }

            return pending;
        }
    }

    private static PendingChallenge consumeFrom(Context app, SharedPreferences prefs) {
        if (prefs == null) {
            return null;
        }

        String challenge = prefs.getString(KEY_CHALLENGE, null);
        long exp = prefs.getLong(KEY_EXP, 0L);
        clear(prefs);

        if (!isValidChallenge(challenge) || !isValidExp(exp)) {
            return null;
        }

        return new PendingChallenge(challenge, exp);
    }

    private static void clear(SharedPreferences prefs) {
        prefs
            .edit()
            .remove(KEY_CHALLENGE)
            .remove(KEY_EXP)
            .commit();
    }

    private static SharedPreferences encryptedPreferences(Context app) {
        try {
            // En security-crypto 1.1.0 el esquema maestro por defecto es AES256_GCM.
            MasterKey masterKey = new MasterKey.Builder(app).build();

            return EncryptedSharedPreferences.create(
                app,
                ENCRYPTED_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception | LinkageError unavailable) {
            return null;
        }
    }

    private static boolean isValidChallenge(String challenge) {
        return challenge != null && CHALLENGE_PATTERN.matcher(challenge).matches();
    }

    private static long parseExp(String raw) {
        if (raw == null || !EXP_PATTERN.matcher(raw).matches()) {
            return 0L;
        }

        try {
            long value = Long.parseLong(raw);
            long millis = value > 1_000_000_000_000L ? value : value * 1000L;
            return isValidExp(millis) ? millis : 0L;
        } catch (NumberFormatException invalid) {
            return 0L;
        }
    }

    private static boolean isValidExp(long expMillis) {
        long now = System.currentTimeMillis();
        return expMillis > now && expMillis <= now + MAX_EXP_WINDOW_MS;
    }

    static final class PendingChallenge {
        final String challenge;
        final long exp;

        private PendingChallenge(String challenge, long exp) {
            this.challenge = challenge;
            this.exp = exp;
        }
    }
}
