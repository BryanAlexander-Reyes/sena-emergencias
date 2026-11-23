import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { FeatureIntroComponent } from './feature-intro.component';

describe('FeatureIntroComponent', () => {
  let fixture: ComponentFixture<FeatureIntroComponent>;
  let element: HTMLElement;

  const create = (badge?: string): void => {
    fixture = TestBed.createComponent(FeatureIntroComponent);
    fixture.componentRef.setInput('icon', 'shield-checkmark-outline');
    fixture.componentRef.setInput('eyebrow', 'Seguridad');
    fixture.componentRef.setInput('title', 'Zona segura');
    fixture.componentRef.setInput('description', 'Punto de encuentro');
    if (badge) {
      fixture.componentRef.setInput('badge', badge);
    }
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureIntroComponent],
    }).compileComponents();
  });

  it('should render the visual header without changing its copy', () => {
    create('MODO DEMOSTRACIÓN');

    expect(element.querySelector('.app-overline')?.textContent).toContain('Seguridad');
    expect(element.querySelector('.feature-intro__title')?.textContent).toContain('Zona segura');
    expect(element.querySelector('.feature-intro__text')?.textContent).toContain('Punto de encuentro');
    expect(element.textContent).toContain('MODO DEMOSTRACIÓN');
  });

  it('should keep the icon decorative and the badge semantic', () => {
    create('DEMO');

    const icon = element.querySelector('ion-icon');
    const badge = element.querySelector('.app-badge--demo');

    expect(icon).toBeTruthy();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.textContent).toContain('DEMO');
  });

  it('should omit the badge when no label is provided', () => {
    create();

    expect(element.querySelector('.app-badge')).toBeNull();
  });
});
