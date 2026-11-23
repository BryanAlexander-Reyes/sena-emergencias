import { Injectable, inject, type OnDestroy } from '@angular/core';
import { type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { DemoSessionService } from './demo-session.service';
import {
  authenticatedAccountFromClaims,
  readVerifiedAccessTokenClaims,
  type VerifiedIdentity,
} from './supabase-auth-claims';

interface AuthStateSubscription {
  readonly data: {
    readonly subscription: { unsubscribe(): void };
  };
}

interface TokenTask {
  readonly kind: 'token';
  readonly token: string | null;
  readonly epoch: number;
  readonly resolve: () => void;
}

interface BarrierTask {
  readonly kind: 'barrier';
  readonly epoch: number;
  readonly resolve: () => void;
}

type SessionTask = TokenTask | BarrierTask;

/**
 * Orquesta el ciclo de vida de Supabase Auth. **No almacena estado de sesión**:
 * `DemoSessionService` sigue siendo la única fuente de verdad de Signals, roles
 * e identidad. Este servicio solo consulta Supabase, valida claims, serializa
 * eventos y delega cada transición al estado compartido.
 *
 * El callback de `onAuthStateChange` es síncrono: solo encola trabajo. Toda
 * llamada asíncrona al SDK ocurre fuera del callback, evitando el bloqueo
 * documentado por auth-js al hacer refresh desde `TOKEN_REFRESHED`.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseSessionService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly state = inject(DemoSessionService);

  private subscription: AuthStateSubscription | null = null;
  private initialized = false;
  private processing = false;
  private epoch = 0;
  private lastAppliedToken: string | null = null;
  private readonly queue: SessionTask[] = [];

  /** Idempotente. Lo invoca el inicializador de la aplicación al arrancar. */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.state.beginInitialization();

    const client = this.supabase.client;
    if (client === null) {
      // Sin configuración pública válida: Aprendiz y estado `lista`, sin privilegios.
      this.applyNoSession();
      return;
    }

    this.subscribe(client);
    const epoch = this.epoch;

    let accessToken: string | null = null;
    try {
      const result = await client.auth.getSession();
      if (result.error === null && result.data.session !== null) {
        accessToken = result.data.session.access_token;
      }
    } catch {
      accessToken = null;
    }

    if (epoch !== this.epoch) {
      // Un cierre de sesión concurrentemente ya degradó el estado a Aprendiz.
      return;
    }

    await this.enqueueToken(accessToken, epoch);
    await this.barrier();
    this.state.finishInitialization();
  }

  /**
   * Publica una cuenta cuyo token ya fue validado por `SupabaseAuthService.signIn`.
   * Evita una segunda validación del mismo token cuando llega `SIGNED_IN`.
   */
  applyVerifiedToken(accessToken: string, identity: VerifiedIdentity): void {
    this.applyAccount(accessToken, identity, this.epoch);
  }

  /**
   * Invalidación síncrona: ninguna validación en curso podrá volver a activar
   * un rol después del cierre. Se llama antes de pedir el cierre remoto.
   */
  invalidateSession(): void {
    this.epoch += 1;
    this.lastAppliedToken = null;

    for (const task of this.queue.splice(0)) {
      task.resolve();
    }

    this.state.clear();
  }

  /** Cierre local inmediato y cierre remoto Supabase con error tolerado. */
  async signOut(): Promise<void> {
    this.invalidateSession();

    const client = this.supabase.client;
    if (client === null) {
      return;
    }

    try {
      await client.auth.signOut();
    } catch {
      // El estado local ya quedó en Aprendiz; no se exponen detalles del error.
    }
  }

  ngOnDestroy(): void {
    this.subscription?.data.subscription.unsubscribe();
    this.subscription = null;
  }

  private subscribe(client: SupabaseClient): void {
    if (this.subscription !== null) {
      return;
    }

    this.subscription = client.auth.onAuthStateChange((event, session) => {
      // Callback síncrono: nunca se espera al SDK desde aquí. SIGNED_OUT se
      // invalida de inmediato para que una validación en vuelo no reactive un rol.
      if (event === 'SIGNED_OUT') {
        this.invalidateSession();
        return;
      }

      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') {
        return;
      }

      void this.enqueueToken(session?.access_token ?? null, this.epoch);
    });
  }

  private enqueueToken(token: string | null, epoch: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const last = this.queue.at(-1);
      if (last?.kind === 'token' && last.token === token && last.epoch === epoch) {
        resolve();
        return;
      }

      if (
        token !== null &&
        token === this.lastAppliedToken &&
        epoch === this.epoch &&
        !this.processing &&
        this.queue.length === 0
      ) {
        resolve();
        return;
      }

      this.queue.push({ kind: 'token', token, epoch, resolve });
      void this.drain();
    });
  }

  /** Garantiza que `initialize()` no termine mientras quede trabajo encolado. */
  private barrier(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ kind: 'barrier', epoch: this.epoch, resolve });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task === undefined) {
          break;
        }

        try {
          if (task.epoch === this.epoch && task.kind === 'token') {
            if (task.token === null) {
              this.applyNoSession();
            } else if (task.token !== this.lastAppliedToken) {
              await this.validateAndApply(task.token, task.epoch);
            }
          }
        } finally {
          task.resolve();
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async validateAndApply(accessToken: string, epoch: number): Promise<void> {
    const client = this.supabase.client;
    if (client === null) {
      if (epoch === this.epoch) {
        this.applyNoSession();
      }
      return;
    }

    // Revocar primero cualquier privilegio visible durante la revalidación.
    this.state.suspendForValidation();

    try {
      const claims = await readVerifiedAccessTokenClaims(client, accessToken);
      if (epoch !== this.epoch) {
        return;
      }

      // Sin campos de identidad confiables se degrada a Aprendiz; nunca se inventa un nombre.
      const identity = authenticatedAccountFromClaims(claims);
      if (identity === null) {
        this.applyNoSession();
        return;
      }

      this.applyAccount(accessToken, identity, epoch);
    } catch {
      if (epoch === this.epoch) {
        this.applyNoSession();
      }
    }
  }

  private applyAccount(accessToken: string, identity: VerifiedIdentity, epoch: number): void {
    if (epoch !== this.epoch) {
      return;
    }

    if (!this.state.publishVerifiedIdentity(identity)) {
      // Defensa en profundidad: una identidad sin marca válida nunca concede rol.
      this.applyNoSession();
      return;
    }

    this.lastAppliedToken = accessToken;
  }

  private applyNoSession(): void {
    this.lastAppliedToken = null;
    this.state.clear();
  }
}
