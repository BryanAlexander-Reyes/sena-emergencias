/** Utilidad del shell: retira el splash crítico una vez que Angular ya renderizó. */
export const SPLASH_ELEMENT_ID = 'app-splash';

/**
 * Marca el splash como listo y lo elimina del DOM.
 *
 * No introduce retrasos en la aparición de la aplicación: en cuanto se marca
 * `data-ready`, el elemento es transparente y deja de interceptar eventos. El
 * temporizador únicamente garantiza la limpieza del nodo cuando la transición
 * CSS no dispara `transitionend` (por ejemplo, con `prefers-reduced-motion`).
 */
export function dismissSplash(doc: Document = document): void {
  const splash = doc.getElementById(SPLASH_ELEMENT_ID);
  if (!splash || splash.getAttribute('data-ready') === 'true') {
    return;
  }

  splash.setAttribute('data-ready', 'true');
  splash.setAttribute('aria-hidden', 'true');

  let removed = false;
  const remove = (): void => {
    if (removed) {
      return;
    }
    removed = true;
    splash.remove();
  };

  splash.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 400);
}
