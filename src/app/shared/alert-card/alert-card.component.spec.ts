import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { DEMO_ALERTS } from '../../core/data/demo-alerts';

import { AlertCardComponent } from './alert-card.component';

describe('AlertCardComponent', () => {
  let fixture: ComponentFixture<AlertCardComponent>;
  let element: HTMLElement;

  const create = (index: number, canReview = true): void => {
    fixture = TestBed.createComponent(AlertCardComponent);
    fixture.componentRef.setInput('alert', DEMO_ALERTS[index]);
    fixture.componentRef.setInput('canReview', canReview);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  };

  const toggle = (): HTMLButtonElement => element.querySelector('.alert-card__toggle') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertCardComponent],
    }).compileComponents();
  });

  it('should render the summary data of the alert', () => {
    create(0);

    const content = element.textContent ?? '';

    expect(content).toContain('Ocupación crítica');
    expect(content).toContain('Pasillo principal');
    expect(content).toContain('Ocupación estimada del 84%.');
    expect(content).toContain('Demo · 12 nov 2026 · 10:42 a. m.');
    expect(content).toContain('Crítica');
    expect(content).toContain('Estado · Activa');
    expect(content).toContain('Revisión · Pendiente');
    expect(content).toContain('Ver detalle');
  });

  it('should apply the severity modifier and expose a collapsed toggle', () => {
    create(0);

    expect(element.querySelector('.alert-card')?.classList).toContain('alert-card--critical');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('alert-details-ALR-001');
    expect(element.querySelector('.alert-card__details')).toBeNull();
  });

  it('should communicate status with icons and text, not only color', () => {
    create(0);

    const chips = Array.from(element.querySelectorAll('.alert-card__chip')) as HTMLElement[];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.textContent?.trim()).toBeTruthy();
      expect(chip.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    }

    expect(element.querySelector('.alert-card__severity')?.textContent).toContain('Crítica');
  });

  it('should expand and collapse the details with the native toggle button', () => {
    create(0);

    toggle().click();
    fixture.detectChanges();

    const details = element.querySelector('.alert-card__details') as HTMLElement;
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(details.id).toBe('alert-details-ALR-001');
    expect(details.textContent).toContain('ALR-001');
    expect(details.textContent).toContain('Pasillo principal');
    expect(details.textContent).toContain('Demo · 12 nov 2026 · 10:42 a. m.');
    expect(details.textContent).toContain('Activa');
    expect(details.textContent).toContain('Pendiente');
    expect(details.textContent).toContain('84%');
    expect(element.textContent).toContain('Ocultar detalle');

    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.alert-card__details')).toBeNull();
  });

  it('should emit the review request only for pending alerts', () => {
    create(0);
    const emitted: string[] = [];
    fixture.componentInstance.reviewRequested.subscribe((id) => emitted.push(id));

    toggle().click();
    fixture.detectChanges();

    const reviewButton = element.querySelector('.alert-card__review') as HTMLButtonElement;
    expect(reviewButton.textContent).toContain('Marcar como revisada');

    reviewButton.click();

    expect(emitted).toEqual(['ALR-001']);
  });

  it('should not offer the review action for already reviewed alerts', () => {
    create(1);

    toggle().click();
    fixture.detectChanges();

    expect(element.querySelector('.alert-card__review')).toBeNull();
    expect(element.textContent).toContain('Revisión completada');
    expect(element.textContent).toContain('Estado · Resuelta');
    expect(element.textContent).toContain('Revisión · Revisada');
    expect(element.querySelector('.alert-card')?.classList).toContain('alert-card--warning');
  });

  it('should render the informative severity with its own modifier', () => {
    create(2);

    expect(element.querySelector('.alert-card')?.classList).toContain('alert-card--info');
    expect(element.textContent).toContain('Informativa');
    expect(element.textContent).toContain('Biblioteca');
    expect(element.textContent).toContain('Zona en estado normal.');
  });

  it('oculta la revisión y no emite sin permiso', () => {
    create(0, false);
    const emitted: string[] = [];
    fixture.componentInstance.reviewRequested.subscribe((id) => emitted.push(id));

    toggle().click();
    fixture.detectChanges();

    expect(element.querySelector('.alert-card__review')).toBeNull();
    expect(element.textContent).toContain('Solo consulta: la revisión no está disponible');
    expect(fixture.componentInstance.showReview()).toBe(false);

    fixture.componentInstance.requestReview();
    expect(emitted).toEqual([]);
  });
});
