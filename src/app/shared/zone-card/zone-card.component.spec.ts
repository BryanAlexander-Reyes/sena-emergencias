import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { DEMO_ZONES, type MonitoringZone } from '../../core/data/demo-monitoring';

import { ZoneCardComponent } from './zone-card.component';

describe('ZoneCardComponent', () => {
  let fixture: ComponentFixture<ZoneCardComponent>;
  let element: HTMLElement;

  const create = (
    zone: MonitoringZone,
    permissions: { canUpdate: boolean; canReset: boolean } = { canUpdate: true, canReset: true },
  ): void => {
    fixture = TestBed.createComponent(ZoneCardComponent);
    fixture.componentRef.setInput('zone', zone);
    fixture.componentRef.setInput('canUpdate', permissions.canUpdate);
    fixture.componentRef.setInput('canReset', permissions.canReset);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  };

  const incrementButton = (): HTMLButtonElement =>
    element.querySelector('.zone-card__step--increment') as HTMLButtonElement;

  const decrementButton = (): HTMLButtonElement =>
    element.querySelector('.zone-card__step--decrement') as HTMLButtonElement;

  const resetButton = (): HTMLButtonElement => element.querySelector('.zone-card__reset') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoneCardComponent],
    }).compileComponents();
  });

  it('should render the zone data and simulation controls', () => {
    create(DEMO_ZONES[0]);

    const content = element.textContent ?? '';
    expect(content).toContain('A');
    expect(content).toContain('Cafetería');
    expect(content).toContain('35');
    expect(content).toContain('50');
    expect(content).toContain('70%');
    expect(content).toContain('Precaución');
    expect(content).toContain('Datos simulados');
    expect(incrementButton()).toBeTruthy();
    expect(decrementButton()).toBeTruthy();
    expect(resetButton().textContent).toContain('Restablecer');
  });

  it('should derive the status class and progress width from the occupancy', () => {
    create(DEMO_ZONES[2]);

    expect(element.classList).toContain('zone-card--critical');
    const fill = element.querySelector('.zone-card__progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('84%');
    expect(element.querySelector('.zone-card__badge')?.textContent).toContain('Crítico');
  });

  it('should apply the normal and warning modifiers from the percentages', () => {
    create(DEMO_ZONES[1]);
    expect(element.classList).toContain('zone-card--normal');

    create(DEMO_ZONES[0]);
    expect(element.classList).toContain('zone-card--warning');
  });

  it('should expose accessible labels on every control', () => {
    create(DEMO_ZONES[0]);

    expect(decrementButton().getAttribute('aria-label')).toBe('Disminuir una persona en Cafetería');
    expect(incrementButton().getAttribute('aria-label')).toBe('Aumentar una persona en Cafetería');
    expect(resetButton().getAttribute('aria-label')).toBe('Restablecer la ocupación de Cafetería');
  });

  it('should emit the occupancy actions without toggling the summary', () => {
    create(DEMO_ZONES[0]);

    const increment = vi.fn();
    const decrement = vi.fn();
    const reset = vi.fn();
    fixture.componentInstance.increment.subscribe(increment);
    fixture.componentInstance.decrement.subscribe(decrement);
    fixture.componentInstance.resetRequested.subscribe(reset);

    incrementButton().click();
    decrementButton().click();
    resetButton().click();
    fixture.detectChanges();

    expect(increment).toHaveBeenCalledTimes(1);
    expect(decrement).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(element.querySelector('.zone-card__note')).toBeNull();
  });

  it('should disable decrement at zero and increment at capacity', () => {
    create({ ...DEMO_ZONES[1], people: 0 });

    expect(decrementButton().disabled).toBe(true);
    expect(incrementButton().disabled).toBe(false);

    create({ ...DEMO_ZONES[2], people: DEMO_ZONES[2].capacity });

    expect(decrementButton().disabled).toBe(false);
    expect(incrementButton().disabled).toBe(true);
  });

  it('should disable the reset action when requested', () => {
    create(DEMO_ZONES[0]);

    expect(resetButton().disabled).toBe(false);

    fixture.componentRef.setInput('resetDisabled', true);
    fixture.detectChanges();

    expect(resetButton().disabled).toBe(true);
  });

  it('should toggle the inline summary on tap and through the toggle button', () => {
    create(DEMO_ZONES[3]);
    expect(element.querySelector('.zone-card__note')).toBeNull();

    element.click();
    fixture.detectChanges();

    const note = element.querySelector('.zone-card__note');
    const toggle = element.querySelector('.zone-card__toggle') as HTMLButtonElement;
    expect(note?.textContent).toContain('Punto de encuentro');
    expect(note?.textContent).toContain('Normal');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();

    expect(element.querySelector('.zone-card__note')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('oculta la simulación y muestra solo consulta sin permisos', () => {
    create(DEMO_ZONES[0], { canUpdate: false, canReset: false });

    expect(incrementButton()).toBeNull();
    expect(decrementButton()).toBeNull();
    expect(resetButton()).toBeNull();
    expect(element.querySelector('.zone-card__people-value')?.textContent).toContain('35');
    expect(element.querySelector('.zone-card__read-only')?.textContent).toContain('Solo consulta');
    expect(fixture.componentInstance.canIncrement()).toBe(false);
    expect(fixture.componentInstance.canDecrement()).toBe(false);
  });

  it('mantiene la lectura de personas con permiso de restablecimiento', () => {
    create(DEMO_ZONES[3], { canUpdate: false, canReset: true });

    expect(incrementButton()).toBeNull();
    expect(decrementButton()).toBeNull();
    expect(resetButton()).toBeTruthy();
    expect(element.querySelector('.zone-card__people-value')?.textContent).toContain('12');
  });
});
