import { createAnimation, type Animation, type AnimationBuilder } from '@ionic/angular';

/** Opciones que Ionic envía al constructor de animaciones de navegación. */
interface RouteAnimationOptions {
  readonly enteringEl?: HTMLElement;
  readonly leavingEl?: HTMLElement;
  readonly direction?: 'forward' | 'back';
  readonly duration?: number;
}

const ENTER_DURATION = 160;
const BACK_DURATION = 140;
const ENTER_OFFSET = 'translateY(8px)';
const BACK_OFFSET = 'translateY(-8px)';

/** `matchMedia` no existe en todos los entornos de prueba; se comprueba de forma segura. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Duración efectiva: 0 para root/reduced motion, o el valor de la dirección. */
export function resolveTransitionDuration(
  opts: RouteAnimationOptions = {},
  reducedMotion = prefersReducedMotion(),
): number {
  if (reducedMotion || opts.duration === 0) {
    return 0;
  }
  return opts.duration ?? (opts.direction === 'back' ? BACK_DURATION : ENTER_DURATION);
}

/**
 * Ionic puede entregar un contenedor (`ion-tab`, `ion-router-outlet`) en lugar
 * de la página real. Se usa el mismo criterio que las transiciones nativas:
 * animar `.ion-page` cuando existe y, si no, el elemento recibido.
 */
function resolvePage(element: HTMLElement | undefined): HTMLElement | undefined {
  if (!element) {
    return undefined;
  }
  return element.querySelector<HTMLElement>('.ion-page') ?? element;
}

/**
 * Transición única de rutas para UIX.6: fade suave con desplazamiento mínimo.
 * Se registra en `provideIonicAngular({ navAnimation: ... })`, por lo que
 * Ionic sigue gestionando el historial, las pestañas y el ciclo de vida.
 * Con `prefers-reduced-motion` o duration=0 (root) la duración es 0.
 */
export const uixRouteAnimation: AnimationBuilder = (_baseEl: HTMLElement, opts?: RouteAnimationOptions): Animation => {
  const entering = resolvePage(opts?.enteringEl);
  const leaving = resolvePage(opts?.leavingEl);
  const back = opts?.direction === 'back';
  const duration = resolveTransitionDuration(opts);

  const animation = createAnimation()
    .duration(duration)
    .easing(back ? 'ease-in' : 'ease-out')
    .fill('both')
    .beforeRemoveClass('ion-page-invisible');

  if (!entering || duration === 0) {
    return animation;
  }

  animation
    .addElement(entering)
    .fromTo('opacity', 0.01, 1)
    .fromTo('transform', back ? BACK_OFFSET : ENTER_OFFSET, 'translateY(0px)');

  if (leaving && back) {
    const leavingAnimation = createAnimation()
      .addElement(leaving)
      .duration(duration)
      .easing('ease-in')
      .fromTo('opacity', 1, 0)
      .fromTo('transform', 'translateY(0px)', ENTER_OFFSET)
      .onFinish((step) => {
        if (step === 1) {
          leaving.style.setProperty('display', 'none');
        }
      });
    animation.addAnimation(leavingAnimation);
  }

  return animation;
};
