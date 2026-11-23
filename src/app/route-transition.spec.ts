import { resolveTransitionDuration, uixRouteAnimation } from './route-transition';

function createPage(className = 'ion-page'): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  document.body.appendChild(element);
  return element;
}

function mockReducedMotion(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

describe('uixRouteAnimation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('uses a 160 ms forward fade with a subtle translate', () => {
    const entering = createPage();

    const animation = uixRouteAnimation(document.body, {
      enteringEl: entering,
      direction: 'forward',
    });

    expect(animation.getDuration()).toBe(160);
    expect(animation.getEasing()).toBe('ease-out');
    expect(animation.elements).toContain(entering);
  });

  it('uses a 140 ms back animation and animates the leaving page too', () => {
    const entering = createPage();
    const leaving = createPage();

    const animation = uixRouteAnimation(document.body, {
      enteringEl: entering,
      leavingEl: leaving,
      direction: 'back',
    });

    expect(animation.getDuration()).toBe(140);
    expect(animation.elements).toContain(entering);
    expect(animation.childAnimations).toHaveLength(1);
    expect(animation.childAnimations[0].elements).toContain(leaving);
  });

  it('resolves zero duration for root navigation and omits keyframes', () => {
    expect(resolveTransitionDuration({ duration: 0 }, false)).toBe(0);

    const animation = uixRouteAnimation(document.body, {
      enteringEl: createPage(),
      duration: 0,
    });

    expect(animation.getKeyframes()).toEqual([]);
    expect(animation.childAnimations).toHaveLength(0);
  });

  it('disables the animation when the user prefers reduced motion', () => {
    mockReducedMotion(true);

    expect(resolveTransitionDuration({ direction: 'forward' })).toBe(0);

    const animation = uixRouteAnimation(document.body, {
      enteringEl: createPage(),
      direction: 'forward',
    });

    expect(animation.getKeyframes()).toEqual([]);
    expect(animation.childAnimations).toHaveLength(0);
  });

  it('animates the inner ion-page when Ionic supplies a wrapper', () => {
    const wrapper = document.createElement('div');
    const page = document.createElement('div');
    page.className = 'ion-page';
    wrapper.appendChild(page);
    document.body.appendChild(wrapper);

    const animation = uixRouteAnimation(document.body, { enteringEl: wrapper });

    expect(animation.elements).toContain(page);
    expect(animation.elements).not.toContain(wrapper);
  });
});
