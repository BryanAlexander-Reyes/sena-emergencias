import { dismissSplash, SPLASH_ELEMENT_ID } from './app-splash';

describe('dismissSplash', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="${SPLASH_ELEMENT_ID}"></div>`;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('marks the splash as ready and removes it when the transition ends', () => {
    const splash = document.getElementById(SPLASH_ELEMENT_ID);

    dismissSplash();

    expect(splash?.getAttribute('data-ready')).toBe('true');
    expect(splash?.getAttribute('aria-hidden')).toBe('true');
    splash?.dispatchEvent(new Event('transitionend'));
    expect(document.getElementById(SPLASH_ELEMENT_ID)).toBeNull();
  });

  it('still cleans up the node when no transitionend fires', () => {
    dismissSplash();
    vi.advanceTimersByTime(400);

    expect(document.getElementById(SPLASH_ELEMENT_ID)).toBeNull();
  });

  it('is safe when the splash is not present', () => {
    document.getElementById(SPLASH_ELEMENT_ID)?.remove();

    expect(() => dismissSplash()).not.toThrow();
  });

  it('is idempotent', () => {
    const splash = document.getElementById(SPLASH_ELEMENT_ID);

    dismissSplash();
    dismissSplash();

    expect(splash?.getAttribute('data-ready')).toBe('true');
  });
});
