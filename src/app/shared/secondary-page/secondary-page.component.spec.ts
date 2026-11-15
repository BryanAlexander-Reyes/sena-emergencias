import { Component } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SecondaryPageComponent } from './secondary-page.component';

@Component({
  imports: [SecondaryPageComponent],
  template: `
    <app-secondary-page
      icon="shield-checkmark-outline"
      eyebrow="Seguridad"
      title="Zona segura"
      description="Punto de encuentro"
      footerLabel="Fase 2.7 · Zona segura"
    >
      <p class="projected-content">Contenido proyectado</p>
    </app-secondary-page>
  `,
})
class SecondaryPageHostComponent {}

describe('SecondaryPageComponent', () => {
  let fixture: ComponentFixture<SecondaryPageHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecondaryPageHostComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SecondaryPageHostComponent);
    fixture.detectChanges();
  });

  it('should render the back control to the Más menu', () => {
    const element = fixture.nativeElement as HTMLElement;
    const back = element.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back).toBeTruthy();
    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
    expect(back.querySelector('ion-icon')?.getAttribute('name')).toBe('arrow-back-outline');
  });

  it('should render the shared secondary header', () => {
    const element = fixture.nativeElement as HTMLElement;
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();

    expect(text).toContain('Seguridad');
    expect(text).toContain('Zona segura');
    expect(text).toContain('Punto de encuentro');
    expect(text).toContain('MODO DEMOSTRACIÓN');
    expect(element.querySelector('app-feature-intro ion-icon')?.getAttribute('name')).toBe('shield-checkmark-outline');
  });

  it('should project the page content and render the footer', () => {
    const element = fixture.nativeElement as HTMLElement;
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();

    expect(element.querySelector('.projected-content')?.textContent).toContain('Contenido proyectado');
    expect(text).toContain('Fase 2.7 · Zona segura');
    expect(text).toContain('v0.7');
  });
});
