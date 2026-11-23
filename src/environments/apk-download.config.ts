/**
 * URL HTTPS de la APK Android oficial publicada.
 *
 * Durante `ng serve`, `ng build` y `ng test` este archivo se sustituye por
 * `apk-download.config.generated.ts`, generado desde la variable pública
 * `APK_DOWNLOAD_URL`. Vacío significa que no hay APK oficial publicada: el
 * botón de descarga aparece deshabilitado con "Próximamente disponible".
 *
 * Solo se admite HTTPS de una APK real publicada. Una APK debug de prueba
 * nunca debe configurarse aquí como versión oficial.
 */
export const APK_DOWNLOAD_URL = '';
