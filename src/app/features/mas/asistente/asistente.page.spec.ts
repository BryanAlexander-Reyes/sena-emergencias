import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AsistentePage } from './asistente.page';

describe('AsistentePage', () => {
  let component: AsistentePage;
  let fixture: ComponentFixture<AsistentePage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsistentePage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AsistentePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the assistant header and demo label', () => {
    const content = pageText();

    expect(content).toContain('SENA AI Assistant');
    expect(content).toContain('Consultas sobre el monitoreo');
    expect(content).toContain('ASISTENTE DE DEMOSTRACIÓN');
    expect(content).toContain('Modo demostración');
  });

  it('should render the welcome message and example conversation', () => {
    const bubbles = Array.from(fixture.nativeElement.querySelectorAll('.assistant__bubble')) as HTMLElement[];
    const texts = bubbles.map((bubble) => (bubble.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(bubbles).toHaveLength(3);
    expect(texts[0]).toContain('Hola, soy el asistente de demostración de SENA CROWD INTELLIGENCE');
    expect(texts[1]).toContain('¿Cuál es la zona más ocupada?');
    expect(texts[2]).toContain('el Pasillo principal registra la mayor ocupación estimada');
    expect(pageText()).toContain('Ejemplo de conversación');
  });

  it('should render the suggested questions as disabled controls', () => {
    const suggestions = Array.from(
      fixture.nativeElement.querySelectorAll('.assistant__suggestion'),
    ) as HTMLButtonElement[];

    expect(component.suggestions).toHaveLength(3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((button) => button.disabled)).toBe(true);
    expect(suggestions[0].textContent).toContain('¿Cuál es la zona más ocupada?');
    expect(suggestions[1].textContent).toContain('¿Cómo funciona la zona segura?');
    expect(suggestions[2].textContent).toContain('¿Qué alertas están activas?');
  });

  it('should keep the composer disabled with a future-feature message', () => {
    const input = fixture.nativeElement.querySelector('.assistant__input') as HTMLInputElement;
    const send = fixture.nativeElement.querySelector('.assistant__send') as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('Escribe tu consulta...');
    expect(send.disabled).toBe(true);
    expect(pageText()).toContain('El chat con IA se habilitará en una fase posterior.');
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });
});
