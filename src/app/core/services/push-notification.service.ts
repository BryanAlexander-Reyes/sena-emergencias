import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { environment } from '../../../environments/environment';
import { FcmRegistrationChallenge } from '../plugins/fcm-registration-challenge.plugin';
import { FirebaseAppCheck } from '../plugins/firebase-app-check.plugin';

import { ManualAlarmSyncService } from './manual-alarm-sync.service';

interface RegistrationResponse {
  readonly status?: unknown;
  readonly error?: unknown;
  readonly retry_after_seconds?: unknown;
  readonly challenge_ttl_seconds?: unknown;
}

interface SolicitudBody {
  accion: 'solicitar' | 'confirmar';
  token_fcm: string;
  plataforma: 'android';
  app_check_token?: string;
  challenge_token?: string;
}

const MAX_REINTENTOS_AUTOMATICOS = 2;
const ESPERA_FALLBACK_SEGUNDOS = 60;
const MARGEN_EXPIRACION_MS = 1000;
const MAX_ANTIGUEDAD_EXP_MS = 24 * 60 * 60 * 1000;
const MAX_DESAFIOS_REGISTRADOS = 1000;
const CODIGO_SEGURO_PATTERN = /^[A-Z0-9_:-]{1,64}$/i;
const CHALLENGE_TIPO = 'fcm_registration_challenge';

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  readonly token = signal<string | null>(null);
  readonly registrado = signal(false);

  private readonly manualAlarmSync = inject(ManualAlarmSyncService);

  private readonly alarmaIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private readonly challengePattern = /^[A-Za-z0-9_-]{32,256}$/;

  private initialized = false;

  /** Una solicitud `solicitar` en curso por token FCM. */
  private readonly registrosEnCurso = new Map<string, Promise<void>>();

  /** Clave `token:challenge` para no confirmar dos veces el mismo desafío. */
  private readonly confirmacionesEnCurso = new Set<string>();

  /** Challenges ya enviados a confirmar, incluso tras reentregas FCM. */
  private readonly desafiosYaEnviados = new Set<string>();

  /** Reintentos acotados por token y motivo (202/409/429). */
  private readonly reintentos = new Map<string, number>();

  /** Temporizadores pendientes por token; se cancelan al rotar el token. */
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly functionUrl = `${environment.supabaseUrl}/functions/v1/registrar-dispositivo-fcm`;

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[FCM] Plataforma web: registro omitido');
      return;
    }

    if (this.initialized) return;

    this.initialized = true;

    try {
      await PushNotifications.addListener('registration', (result) => {
        this.alCambiarToken(result.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[FCM] Error de registro:', error);
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        this.procesarMensajePush(notification.data);
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        this.procesarMensajePush(action.notification.data);
      });

      await FcmRegistrationChallenge.addListener('challengeStored', () => {
        const tokenFcm = this.token();
        if (tokenFcm !== null && !this.registrado()) {
          void this.consumirDesafioNativo(tokenFcm);
        }
      });

      // Al reanudar, el plugin nativo entrega el desafío recibido con el bridge
      // cerrado. Registrar sin éxito previo también cubre el arranque en frío.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;

        const tokenFcm = this.token();
        if (tokenFcm !== null && !this.registrado()) {
          void this.registrarDispositivo(tokenFcm);
        }
      });

      let permission = await PushNotifications.checkPermissions();

      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive !== 'granted') {
        console.warn('[FCM] Permiso de notificaciones no concedido');
        return;
      }

      await PushNotifications.register();
    } catch (error) {
      this.initialized = false;
      console.error('[FCM] No se pudo inicializar:', error);
    }
  }

  /**
   * La notificación solo transporta el identificador. El modal se decide
   * exclusivamente con el estado real devuelto por Supabase, mediante el
   * servicio de sincronización existente (sin duplicar listeners ni modal).
   */
  private verificarAlarmaNotificada(data: unknown): void {
    if (!esRegistro(data)) {
      return;
    }

    const alarmaId = data['alarma_id'];
    if (typeof alarmaId !== 'string' || !this.alarmaIdPattern.test(alarmaId)) {
      return;
    }

    console.log('[FCM] Notificación de emergencia: verificando estado real');
    this.manualAlarmSync.selectAlarm(alarmaId);
    void this.manualAlarmSync.refresh();
  }

  /** Separa el desafío FCM de las notificaciones de emergencia existentes. */
  private procesarMensajePush(data: unknown): void {
    if (!esRegistro(data)) {
      return;
    }

    if (data['tipo'] === CHALLENGE_TIPO) {
      this.procesarDesafio(data);
      return;
    }

    this.verificarAlarmaNotificada(data);
  }

  private alCambiarToken(tokenFcm: string): void {
    if (typeof tokenFcm !== 'string' || tokenFcm.length === 0) {
      return;
    }

    const anterior = this.token();

    if (anterior !== tokenFcm) {
      if (anterior !== null) {
        this.cancelarEstadoToken(anterior);
      }

      this.registrado.set(false);
      this.token.set(tokenFcm);
      console.log('[FCM] Token obtenido correctamente');
    }

    void this.registrarDispositivo(tokenFcm);
  }

  /** Programa una sola solicitud activa por token y permite reintentos acotados. */
  private registrarDispositivo(tokenFcm: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return Promise.resolve();
    }

    if (this.token() !== tokenFcm || this.registrado()) {
      return Promise.resolve();
    }

    const enCurso = this.registrosEnCurso.get(tokenFcm);
    if (enCurso) {
      return enCurso;
    }

    const solicitud = this.ejecutarSolicitud(tokenFcm);
    this.registrosEnCurso.set(tokenFcm, solicitud);

    void solicitud.then(() => {
      if (this.registrosEnCurso.get(tokenFcm) === solicitud) {
        this.registrosEnCurso.delete(tokenFcm);
      }
    });

    return solicitud;
  }

  private async ejecutarSolicitud(tokenFcm: string): Promise<void> {
    // Antes de volver a solicitar se recupera el desafío que el servicio nativo
    // pudo persistir con la app cerrada. Si se consume, ya hay una confirmación
    // en curso y no debe enviarse otra solicitud `solicitar`.
    if (await this.consumirDesafioNativo(tokenFcm)) {
      return;
    }

    const appCheckToken = await this.appCheckOpcional();

    if (this.token() !== tokenFcm || this.registrado()) {
      return;
    }

    const body: SolicitudBody = {
      accion: 'solicitar',
      token_fcm: tokenFcm,
      plataforma: 'android',
    };

    if (appCheckToken !== undefined) {
      body.app_check_token = appCheckToken;
    }

    let response: Response;
    try {
      response = await fetch(this.functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabasePublishableKey,
        },
        body: JSON.stringify(body),
      });
    } catch {
      console.warn('[FCM] Solicitud de registro sin respuesta');
      return;
    }

    if (this.token() !== tokenFcm) {
      return;
    }

    const resultado = await this.leerRespuesta(response);

    switch (response.status) {
      case 200:
        if (resultado?.status === 'REGISTERED') {
          this.registrado.set(true);
          this.limpiarEstado(tokenFcm);
          console.log('[FCM] Dispositivo registrado en Supabase');
        } else {
          console.warn('[FCM] Respuesta 200 inesperada');
        }
        return;

      case 202:
        // No es éxito: hay que esperar el mensaje FCM data-only.
        console.log('[FCM] Esperando desafío FCM');
        this.programarReintento(
          tokenFcm,
          'desafio',
          this.leerSegundos(
            resultado?.retry_after_seconds,
            this.leerSegundos(resultado?.challenge_ttl_seconds, ESPERA_FALLBACK_SEGUNDOS),
          ),
        );
        return;

      case 409:
        console.warn('[FCM] Desafío ya pendiente');
        this.programarReintento(
          tokenFcm,
          'pendiente',
          this.leerSegundos(resultado?.retry_after_seconds, ESPERA_FALLBACK_SEGUNDOS),
        );
        return;

      case 429:
        console.warn('[FCM] Registro limitado por tasa');
        this.programarReintento(
          tokenFcm,
          'tasa',
          this.leerSegundos(resultado?.retry_after_seconds, ESPERA_FALLBACK_SEGUNDOS),
        );
        return;

      case 401:
      case 500:
      case 503:
      default:
        // Sin reintento automático: no crear ciclos ante errores persistentes.
        console.warn(`[FCM] Registro rechazado status=${response.status} code=${this.codigoSeguro(resultado)}`);
        return;
    }
  }

  private async appCheckOpcional(): Promise<string | undefined> {
    try {
      const appCheck = await FirebaseAppCheck.getToken();
      const token = appCheck?.token?.trim();

      if (typeof token === 'string' && token.length > 0) {
        return token;
      }

      console.warn('[FCM] App Check no devolvió token; se continúa sin él');
    } catch {
      console.warn('[FCM] App Check no disponible; se continúa sin él');
    }

    return undefined;
  }

  private procesarDesafio(data: Record<string, unknown>): void {
    const challenge = data['challenge'];

    if (typeof challenge !== 'string' || !this.challengePattern.test(challenge)) {
      console.warn('[FCM] Desafío FCM con formato inválido');
      return;
    }

    const expiracion = this.leerExpiracion(data['exp']);
    if (expiracion === null) {
      console.warn('[FCM] Desafío FCM con expiración inválida');
      return;
    }

    if (expiracion !== undefined && Date.now() + MARGEN_EXPIRACION_MS >= expiracion) {
      console.warn('[FCM] Desafío FCM expirado');
      return;
    }

    const tokenFcm = this.token();
    if (tokenFcm === null || this.registrado()) {
      return;
    }

    const clave = `${tokenFcm}:${challenge}`;
    if (this.confirmacionesEnCurso.has(clave) || this.desafiosYaEnviados.has(clave)) {
      return;
    }

    // El desafío llegó: no hace falta volver a solicitar.
    this.cancelarTemporizador(tokenFcm);
    this.confirmacionesEnCurso.add(clave);
    this.desafiosYaEnviados.add(clave);

    if (this.desafiosYaEnviados.size > MAX_DESAFIOS_REGISTRADOS) {
      const masAntiguo = this.desafiosYaEnviados.values().next().value;
      if (masAntiguo !== undefined) {
        this.desafiosYaEnviados.delete(masAntiguo);
      }
    }

    void this.confirmarDesafio(tokenFcm, challenge).then(() => {
      this.confirmacionesEnCurso.delete(clave);
    });
  }

  /**
   * El servicio FCM nativo persiste el desafío cuando el bridge no está listo.
   * Se consume aquí, antes de solicitar otro, reutilizando la misma validación
   * y deduplicación del desafío recibido por JavaScript.
   */
  private async consumirDesafioNativo(tokenFcm: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const pendiente = await FcmRegistrationChallenge.consumePending();

      if (typeof pendiente.challenge !== 'string' || this.token() !== tokenFcm || this.registrado()) {
        return false;
      }

      this.procesarDesafio({
        tipo: CHALLENGE_TIPO,
        challenge: pendiente.challenge,
        exp: pendiente.exp,
      });

      return this.hayConfirmacionEnCurso(tokenFcm);
    } catch {
      return false;
    }
  }

  private hayConfirmacionEnCurso(tokenFcm: string): boolean {
    const prefijo = `${tokenFcm}:`;
    for (const clave of this.confirmacionesEnCurso) {
      if (clave.startsWith(prefijo)) {
        return true;
      }
    }
    return false;
  }

  private async confirmarDesafio(tokenFcm: string, challengeToken: string): Promise<void> {
    const clave = `${tokenFcm}:${challengeToken}`;
    let confirmado = false;

    try {
      if (this.token() !== tokenFcm || this.registrado()) {
        return;
      }

      const body: SolicitudBody = {
        accion: 'confirmar',
        token_fcm: tokenFcm,
        plataforma: 'android',
        challenge_token: challengeToken,
      };

      let response: Response;
      try {
        response = await fetch(this.functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: environment.supabasePublishableKey,
          },
          body: JSON.stringify(body),
        });
      } catch {
        console.warn('[FCM] Confirmación del desafío sin respuesta');
        return;
      }

      if (this.token() !== tokenFcm) {
        return;
      }

      const resultado = await this.leerRespuesta(response);

      if (response.ok && resultado?.status === 'REGISTERED') {
        confirmado = true;
        this.registrado.set(true);
        this.limpiarEstado(tokenFcm);
        console.log('[FCM] Dispositivo registrado mediante desafío');
        return;
      }

      console.warn(`[FCM] Confirmación rechazada status=${response.status} code=${this.codigoSeguro(resultado)}`);
    } finally {
      // Si la confirmación no prosperó, el mismo desafío puede reintentarse.
      if (!confirmado) {
        this.desafiosYaEnviados.delete(clave);
      }
    }
  }

  private programarReintento(tokenFcm: string, motivo: string, segundos: number): void {
    if (this.token() !== tokenFcm || this.registrado()) {
      return;
    }

    const clave = `${tokenFcm}:${motivo}`;
    const intentos = this.reintentos.get(clave) ?? 0;
    if (intentos >= MAX_REINTENTOS_AUTOMATICOS) {
      console.warn('[FCM] Se agotaron los reintentos automáticos');
      return;
    }

    this.reintentos.set(clave, intentos + 1);
    this.cancelarTemporizador(tokenFcm);

    const temporizador = setTimeout(
      () => {
        this.temporizadores.delete(tokenFcm);
        void this.registrarDispositivo(tokenFcm);
      },
      Math.max(1, segundos) * 1000,
    );

    this.temporizadores.set(tokenFcm, temporizador);
  }

  private cancelarEstadoToken(tokenFcm: string): void {
    this.cancelarTemporizador(tokenFcm);
    this.limpiarReintentos(tokenFcm);

    const prefijo = `${tokenFcm}:`;
    for (const clave of this.desafiosYaEnviados) {
      if (clave.startsWith(prefijo)) {
        this.desafiosYaEnviados.delete(clave);
      }
    }
  }

  private cancelarTemporizador(tokenFcm: string): void {
    const temporizador = this.temporizadores.get(tokenFcm);
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
      this.temporizadores.delete(tokenFcm);
    }
  }

  private limpiarEstado(tokenFcm: string): void {
    this.cancelarTemporizador(tokenFcm);
    this.limpiarReintentos(tokenFcm);
  }

  private limpiarReintentos(tokenFcm: string): void {
    const prefijo = `${tokenFcm}:`;
    for (const clave of this.reintentos.keys()) {
      if (clave.startsWith(prefijo)) {
        this.reintentos.delete(clave);
      }
    }
  }

  private async leerRespuesta(response: Response): Promise<RegistrationResponse | null> {
    try {
      const data: unknown = await response.json();
      return esRegistro(data) ? (data as RegistrationResponse) : null;
    } catch {
      return null;
    }
  }

  private leerSegundos(valor: unknown, fallback: number): number {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 3600) {
      return fallback;
    }

    return Math.ceil(valor);
  }

  /**
   * `undefined` = el mensaje no incluyó `exp`.
   * `null` = `exp` presente pero no interpretable; no se confirma.
   */
  private leerExpiracion(valor: unknown): number | undefined | null {
    if (valor === undefined || valor === null || valor === '') {
      return undefined;
    }

    const texto = String(valor).trim();
    if (!/^\d+$/.test(texto)) {
      return null;
    }

    const numero = Number(texto);
    if (!Number.isFinite(numero) || numero <= 0) {
      return null;
    }

    // FCM envía segundos UNIX; se aceptan también milliseconds por robustez.
    const expiracion = numero > 1_000_000_000_000 ? numero : numero * 1000;
    return expiracion <= Date.now() + MAX_ANTIGUEDAD_EXP_MS ? expiracion : null;
  }

  private codigoSeguro(resultado: RegistrationResponse | null): string {
    const candidato = resultado?.error ?? resultado?.status;
    return typeof candidato === 'string' && CODIGO_SEGURO_PATTERN.test(candidato) ? candidato : 'DESCONOCIDO';
  }
}
