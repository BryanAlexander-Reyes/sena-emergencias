import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { MetricCardComponent } from './metric-card.component';

describe('MetricCardComponent', () => {
  let fixture: ComponentFixture<MetricCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MetricCardComponent);
    fixture.componentRef.setInput('title', 'Personas estimadas');
    fixture.componentRef.setInput('value', 107);
    fixture.componentRef.setInput('icon', 'people-outline');
    fixture.componentRef.setInput('accent', 'cyan');
    fixture.componentRef.setInput('description', 'En zonas monitoreadas');
    fixture.detectChanges();
  });

  it('should render the provided metric', () => {
    const element = fixture.nativeElement as HTMLElement;
    const content = element.textContent ?? '';

    expect(content).toContain('Personas estimadas');
    expect(content).toContain('107');
    expect(content).toContain('En zonas monitoreadas');
  });

  it('should apply the accent modifier class', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.classList).toContain('app-card');
    expect(element.classList).toContain('metric-card--cyan');
  });

  it('should support every public accent without changing the visual contract', () => {
    const accents = ['blue', 'yellow', 'green'] as const;

    for (const accent of accents) {
      fixture.componentRef.setInput('accent', accent);
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      expect(element.classList).toContain(`metric-card--${accent}`);
    }
  });

  it('should mark the icon as decorative', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should use h2 so the heading level follows the dashboard h1/h2 hierarchy', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h2.metric-card__title')?.textContent).toContain('Personas estimadas');
    expect(element.querySelector('h3')).toBeNull();
  });
});
