import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AlertsStateService } from '../../../core/services/alerts-state.service';
import { DemoAssistantService } from '../../../core/services/demo-assistant.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';

import { AsistentePage } from './asistente.page';

describe('AsistentePage (Fase 3.7)', () => {
  let component: AsistentePage;
  let fixture: ComponentFixture<AsistentePage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    // reset singleton conversation state between tests
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AsistentePage],
      providers: [provideRouter([])],
    }).compileComponents();

    TestBed.inject(DemoAssistantService).resetConversation();

    fixture = TestBed.createComponent(AsistentePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render demo/local assistant header', () => {
    expect(component).toBeTruthy();
    const content = pageText();
    expect(content).toContain('SENA AI Assistant');
    expect(content).toContain('ASISTENTE DE DEMOSTRACIÓN — RESPUESTAS AUTOMÁTICAS LOCALES');
    expect(content).toContain('Respuestas locales');
  });

  it('should show welcome message and enabled quick questions/composer', () => {
    const bubbles = Array.from(fixture.nativeElement.querySelectorAll('.assistant__bubble')) as HTMLElement[];
    const suggestions = Array.from(fixture.nativeElement.querySelectorAll('.assistant__suggestion')) as HTMLButtonElement[];
    const input = fixture.nativeElement.querySelector('.assistant__input') as HTMLInputElement;
    const send = fixture.nativeElement.querySelector('.assistant__send') as HTMLButtonElement;

    expect(bubbles.length).toBe(1);
    expect(bubbles[0].textContent).toContain('asistente de demostración');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((b) => !b.disabled)).toBe(true);
    expect(input.disabled).toBe(false);
    expect(send.disabled).toBe(true);
  });

  it('should reject empty/whitespace messages', () => {
    component.onDraftChange('   ');
    component.send();
    fixture.detectChanges();
    expect(component.messages().length).toBe(1);
  });

  it('should answer total, zone and react to current data', () => {
    const assistant = TestBed.inject(DemoAssistantService);
    const monitoring = TestBed.inject(MonitoringStateService);

    assistant.sendUserMessage('¿Cuántas personas hay en total?');
    expect(assistant.messages().at(-1)?.content).toContain('107 personas');

    assistant.sendUserMessage('¿Cuántas personas hay en la cafeteria?');
    expect(assistant.messages().at(-1)?.content).toContain('Cafetería: 35 de 50 personas (70%)');
    expect(assistant.messages().at(-1)?.content).toContain('Precaución');

    // modify occupancy and ask again (consults live state)
    for (let i = 0; i < 5; i += 1) monitoring.incrementOccupancy('cafeteria');
    TestBed.flushEffects();
    assistant.sendUserMessage('¿Cómo está la cafetería?');
    expect(assistant.messages().at(-1)?.content).toContain('40 de 50 personas (80%)');
    expect(assistant.messages().at(-1)?.content).toContain('Crítico');
  });

  it('should answer zones by status, alerts, safe zone, sensors and stats from correct sources', () => {
    const assistant = TestBed.inject(DemoAssistantService);
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);

    assistant.sendUserMessage('¿Qué zonas están críticas?');
    expect(assistant.messages().at(-1)?.content).toContain('Pasillo principal');

    assistant.sendUserMessage('¿Qué zonas están en precaución?');
    expect(assistant.messages().at(-1)?.content).toContain('Cafetería');

    assistant.sendUserMessage('¿Cuántas alertas activas hay?');
    expect(assistant.messages().at(-1)?.content).toContain(`${alerts.activeAlerts()}`);

    assistant.sendUserMessage('¿Dónde está la zona segura?');
    expect(assistant.messages().at(-1)?.content).toContain('Punto de encuentro');
    expect(assistant.messages().at(-1)?.content).toContain('12 de 100');

    assistant.sendUserMessage('¿Qué sensores tiene el sistema?');
    expect(assistant.messages().at(-1)?.content).toContain('6 dispositivos simulados');
    expect(assistant.messages().at(-1)?.content).toContain('sin conexión');

    assistant.sendUserMessage('¿Los ESP32 están funcionando?');
    expect(assistant.messages().at(-1)?.content).toContain('ESP32');
    expect(assistant.messages().at(-1)?.content).toContain('Sin conexión física');

    assistant.sendUserMessage('¿Cuál fue el máximo de personas registrado?');
    expect(assistant.messages().at(-1)?.content).toContain('107');
    monitoring.incrementOccupancy('biblioteca');
    TestBed.flushEffects();
    assistant.sendUserMessage('¿Cuántos cambios se han realizado?');
    expect(assistant.messages().at(-1)?.content).toContain('1 cambios registrados');
  });

  it('should handle accents/unknown questions safely and not modify data', () => {
    const assistant = TestBed.inject(DemoAssistantService);
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);
    const peopleBefore = monitoring.totalPeople();
    const alertsBefore = alerts.activeAlerts();

    assistant.sendUserMessage('Como esta la CAFETERIA');
    expect(assistant.messages().at(-1)?.content).toContain('Cafetería');

    assistant.sendUserMessage('¿Por dónde debo evacuar?');
    expect(assistant.messages().at(-1)?.content).toContain('no puede determinar rutas de evacuación seguras');
    expect(assistant.messages().at(-1)?.content).toContain('señalización oficial');

    assistant.sendUserMessage('cuentame un chiste');
    expect(assistant.messages().at(-1)?.content).toContain('No tengo una respuesta predefinida');

    expect(monitoring.totalPeople()).toBe(peopleBefore);
    expect(alerts.activeAlerts()).toBe(alertsBefore);
  });

  it('should process quick questions through the same service flow and keep history in session', () => {
    component.askQuick('Ocupación total');
    fixture.detectChanges();
    expect(component.messages().length).toBe(3); // welcome + user + answer
    expect(component.messages().at(-1)?.content).toContain('107 personas');
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });
});
