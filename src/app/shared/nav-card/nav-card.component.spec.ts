import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NavCardComponent } from './nav-card.component';

describe('NavCardComponent', () => {
  let fixture: ComponentFixture<NavCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(NavCardComponent);
    fixture.componentRef.setInput('icon', 'shield-checkmark-outline');
    fixture.componentRef.setInput('title', 'Zona segura');
    fixture.componentRef.setInput('description', 'Punto de encuentro y ocupación');
    fixture.componentRef.setInput('accent', 'green');
    fixture.componentRef.setInput('link', '/tabs/mas/zona-segura');
    fixture.detectChanges();
  });

  it('should render an accessible navigation link', () => {
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector('a.nav-card') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/tabs/mas/zona-segura');
    expect(link.textContent).toContain('Zona segura');
    expect(link.textContent).toContain('Punto de encuentro y ocupación');
  });

  it('should render the option icon and the arrow', () => {
    const element = fixture.nativeElement as HTMLElement;
    const icons = Array.from(element.querySelectorAll('ion-icon')) as HTMLElement[];

    expect(icons[0].getAttribute('name')).toBe('shield-checkmark-outline');
    expect(icons[1].getAttribute('name')).toBe('chevron-forward-outline');
  });

  it('should keep decorative icons hidden from assistive technology', () => {
    const element = fixture.nativeElement as HTMLElement;
    const icons = Array.from(element.querySelectorAll('ion-icon')) as HTMLElement[];

    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('should expose the accent through a host class', () => {
    expect(fixture.nativeElement.classList).toContain('nav-card-host--green');
  });
});
