import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { DemoSessionService } from '../../core/auth/demo-session.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../core/auth/testing/verified-session-test.util';
import { DEMO_ALERTS } from '../../core/data/demo-alerts';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAlarmStateService } from '../../core/services/demo-alarm-state.service';

import { AlertasPage } from './alertas.page';

describe('AlertasPage', () => {
  let component: AlertasPage;
  let fixture: ComponentFixture<AlertasPage>;
  let verified: VerifiedTestIdentities;

  const cards = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('app-alert-card')) as HTMLElement[];

  const cardTexts = (): string[] => cards().map((card) => card.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const statsValues = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.alert-stats__value') as NodeListOf<HTMLElement>).map(
      (value) => value.textContent?.trim() ?? '',
    );

  const clickFilter = (group: 'severity' | 'status', value: string): void => {
    const button = fixture.nativeElement.querySelector(`[data-${group}="${value}"]`) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
  };

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    await TestBed.configureTestingModule({
      imports: [AlertasPage],
    }).compileComponents();

    TestBed.inject(DemoSessionService).publishVerifiedIdentity(verified.administrador);
    fixture = TestBed.createComponent(AlertasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the header, demo indicator and notification icon', () => {
    const content = pageText();
    const header = fixture.nativeElement.querySelector('app-feature-intro') as HTMLElement;

    expect(content).toContain('Centro de alertas');
    expect(content).toContain('Eventos y notificaciones del sistema');
    expect(content).toContain('MODO DEMOSTRACIÓN');
    expect(header.querySelector('ion-icon')?.getAttribute('name')).toBe('notifications-outline');
  });

  it('should compute the three indicators from the centralized alert state', () => {
    const alertsState = TestBed.inject(AlertsStateService);

    expect(component.alerts()).toBe(DEMO_ALERTS);
    expect(component.alerts()).toBe(alertsState.alerts());
    expect(component.activeAlerts()).toBe(1);
    expect(component.activeAlerts()).toBe(alertsState.activeAlerts());
    expect(component.reviewedAlerts()).toBe(2);
    expect(component.reviewedAlerts()).toBe(alertsState.reviewedAlerts());
    expect(component.totalAlerts()).toBe(3);
    expect(component.totalAlerts()).toBe(alertsState.totalAlerts());
    expect(statsValues()).toEqual(['1', '2', '3']);

    const content = pageText();
    expect(content).toContain('Alertas activas');
    expect(content).toContain('Alertas revisadas');
    expect(content).toContain('Total de alertas');
  });

  it('should render the three demo alerts with their summary data', () => {
    const texts = cardTexts();

    expect(cards()).toHaveLength(3);
    expect(texts[0]).toContain('Ocupación crítica');
    expect(texts[0]).toContain('Pasillo principal');
    expect(texts[0]).toContain('Ocupación estimada del 84%.');
    expect(texts[0]).toContain('Estado · Activa');
    expect(texts[0]).toContain('Revisión · Pendiente');
    expect(texts[1]).toContain('Ocupación elevada');
    expect(texts[1]).toContain('Cafetería');
    expect(texts[1]).toContain('Estado · Resuelta');
    expect(texts[1]).toContain('Revisión · Revisada');
    expect(texts[2]).toContain('Estado actualizado');
    expect(texts[2]).toContain('Biblioteca');
    expect(texts[2]).toContain('Zona en estado normal.');
  });

  it('should filter by severity and update the visible count', () => {
    clickFilter('severity', 'critical');
    expect(cards()).toHaveLength(1);
    expect(cardTexts()[0]).toContain('Ocupación crítica');
    expect(pageText()).toContain('1 de 3');

    clickFilter('severity', 'warning');
    expect(cards()).toHaveLength(1);
    expect(cardTexts()[0]).toContain('Ocupación elevada');

    clickFilter('severity', 'info');
    expect(cards()).toHaveLength(1);
    expect(cardTexts()[0]).toContain('Estado actualizado');

    clickFilter('severity', 'all');
    expect(cards()).toHaveLength(3);
  });

  it('should filter by alert status without changing the total', () => {
    clickFilter('status', 'active');
    expect(cards()).toHaveLength(1);
    expect(cardTexts()[0]).toContain('Ocupación crítica');
    expect(statsValues()).toEqual(['1', '2', '3']);

    clickFilter('status', 'resolved');
    expect(cards()).toHaveLength(2);
    expect(cardTexts()[0]).toContain('Ocupación elevada');
    expect(cardTexts()[1]).toContain('Estado actualizado');

    clickFilter('status', 'all');
    expect(cards()).toHaveLength(3);
  });

  it('should expose the active filter state through aria-pressed', () => {
    clickFilter('severity', 'critical');
    clickFilter('status', 'resolved');

    const critical = fixture.nativeElement.querySelector('[data-severity="critical"]') as HTMLElement;
    const allSeverity = fixture.nativeElement.querySelector('[data-severity="all"]') as HTMLElement;
    const resolved = fixture.nativeElement.querySelector('[data-status="resolved"]') as HTMLElement;

    expect(critical.getAttribute('aria-pressed')).toBe('true');
    expect(critical.classList).toContain('alert-filter--on');
    expect(allSeverity.getAttribute('aria-pressed')).toBe('false');
    expect(resolved.getAttribute('aria-pressed')).toBe('true');
  });

  it('should keep both filter groups and their machine-readable state', () => {
    const filters = fixture.nativeElement.querySelector('.alert-filters') as HTMLElement;
    const severity = filters.querySelector('[role="group"][aria-label="Filtrar por severidad"]') as HTMLElement;
    const status = filters.querySelector('[role="group"][aria-label="Filtrar por estado de la alerta"]') as HTMLElement;

    expect(severity).toBeTruthy();
    expect(status).toBeTruthy();
    expect(Array.from(severity.querySelectorAll('.alert-filter'))).toHaveLength(4);
    expect(Array.from(status.querySelectorAll('.alert-filter'))).toHaveLength(3);
    expect(severity.querySelector('[data-severity="critical"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(status.querySelector('[data-status="all"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('should show an empty state with an icon and message when there are no results', () => {
    clickFilter('severity', 'critical');
    clickFilter('status', 'resolved');

    expect(cards()).toHaveLength(0);
    const empty = fixture.nativeElement.querySelector('.alert-empty') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No hay alertas con estos filtros');
    expect(empty.querySelector('ion-icon')?.getAttribute('name')).toBe('search-outline');
  });

  it('should clear the filters from the empty state', () => {
    clickFilter('severity', 'critical');
    clickFilter('status', 'resolved');

    const reset = fixture.nativeElement.querySelector('.alert-empty__reset') as HTMLButtonElement;
    reset.click();
    fixture.detectChanges();

    expect(cards()).toHaveLength(3);
    expect(component.severityFilter()).toBe('all');
    expect(component.statusFilter()).toBe('all');
    expect(fixture.nativeElement.querySelector('.alert-empty')).toBeNull();
  });

  it('should mark a pending alert as reviewed without changing its alert status', () => {
    const toggle = cards()[0].querySelector('.alert-card__toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const reviewButton = cards()[0].querySelector('.alert-card__review') as HTMLButtonElement;
    expect(reviewButton).toBeTruthy();

    reviewButton.click();
    fixture.detectChanges();

    expect(statsValues()).toEqual(['1', '3', '3']);
    expect(component.alerts()[0].review).toBe('reviewed');
    expect(component.alerts()[0].status).toBe('active');
    expect(TestBed.inject(AlertsStateService).alerts()[0].review).toBe('reviewed');

    const text = cards()[0].textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(text).toContain('Estado · Activa');
    expect(text).toContain('Revisión · Revisada');
    expect(text).not.toContain('Pendiente');
    expect(cards()[0].querySelector('.alert-card__review')).toBeNull();
    expect(text).toContain('Revisión completada');
  });

  it('should keep the review state while filtering', () => {
    const toggle = cards()[0].querySelector('.alert-card__toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const reviewButton = cards()[0].querySelector('.alert-card__review') as HTMLButtonElement;
    reviewButton.click();
    fixture.detectChanges();

    clickFilter('severity', 'critical');
    expect(cards()).toHaveLength(1);
    expect(cardTexts()[0]).toContain('Revisión · Revisada');
    expect(component.reviewedAlerts()).toBe(3);
  });

  it('should render the demo disclaimer and the footer', () => {
    const content = pageText();

    expect(content).toContain('Las alertas son simuladas');
    expect(content).toContain('no provienen de sensores conectados');
    expect(content).toContain('no cambia el estado ni elimina el riesgo simulado');
    expect(content).toContain('Fase 2.6 · Alertas');
    expect(content).toContain('v0.6');
  });

  it('muestra la revisión con perfil administrador', () => {
    expect(component.canReviewAlerts()).toBe(true);
    expect(pageText()).not.toContain('no marcarlas como revisadas');

    const toggle = cards()[0].querySelector('.alert-card__toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(cards()[0].querySelector('.alert-card__review')).toBeTruthy();
  });

  it('oculta la revisión y bloquea el handler para perfil de solo consulta', () => {
    const alertsState = TestBed.inject(AlertsStateService);
    const review = alertsState.alerts()[0].review;

    TestBed.inject(DemoSessionService).selectProfile('aprendiz');
    fixture.detectChanges();

    expect(component.canReviewAlerts()).toBe(false);
    expect(pageText()).toContain('no marcarlas como revisadas');

    const toggle = cards()[0].querySelector('.alert-card__toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(cards()[0].querySelector('.alert-card__review')).toBeNull();
    expect(cards()[0].textContent).toContain('Solo consulta: la revisión no está disponible');

    component.reviewAlert(DEMO_ALERTS[0].id);
    expect(alertsState.alerts()[0].review).toBe(review);
    expect(statsValues()).toEqual(['1', '2', '3']);
  });

  it('muestra el estado de la alarma y el aviso combinado sin botones de control', () => {
    const section = fixture.nativeElement.querySelector('.alert-alarm') as HTMLElement;
    const state = section.querySelector('.alert-alarm__state') as HTMLElement;
    const message = section.querySelector('.alert-alarm__message') as HTMLElement;

    expect(section).toBeTruthy();
    expect(state.textContent).toContain('Alarma apagada · simulado, sin hardware conectado');
    expect(message.getAttribute('data-scenario')).toBe('B');
    expect(message.textContent).toContain(
      'Aglomeración detectada. Mantenga la calma y esté atento a las indicaciones del personal autorizado.',
    );
    expect(section.querySelector('button')).toBeNull();
    expect(section.querySelector('ion-button')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.alarm-control__button')).toHaveLength(0);
  });

  it('actualiza reactivamente el aviso combinado al encender la alarma', () => {
    TestBed.inject(DemoAlarmStateService).turnOn();
    fixture.detectChanges();

    const message = fixture.nativeElement.querySelector('.alert-alarm__message') as HTMLElement;
    expect(message.getAttribute('data-scenario')).toBe('D');
    expect(message.textContent).toContain(
      'Aglomeración detectada y alarma activada. Siga las indicaciones del personal autorizado.',
    );
    expect((fixture.nativeElement.querySelector('.alert-alarm__state') as HTMLElement).textContent).toContain(
      'Alarma activada · simulado, sin hardware conectado',
    );
  });

  it('no crea alertas ni instrucciones LED al cambiar de perfil con la alarma encendida', () => {
    const alertsState = TestBed.inject(AlertsStateService);
    const alarm = TestBed.inject(DemoAlarmStateService);
    const session = TestBed.inject(DemoSessionService);
    const initialIds = alertsState.alerts().map((alert) => alert.id);

    alarm.turnOn();
    for (const profileId of ['aprendiz', 'instructor', 'administrador'] as const) {
      if (profileId === 'administrador') {
        session.publishVerifiedIdentity(verified.administrador);
      } else if (profileId === 'instructor') {
        session.publishVerifiedIdentity(verified.instructor);
      } else {
        session.selectProfile('aprendiz');
      }
      fixture.detectChanges();
    }

    expect(alertsState.alerts().map((alert) => alert.id)).toEqual(initialIds);
    expect(alertsState.totalAlerts()).toBe(3);
    expect(alertsState.activeAlerts()).toBe(1);
    expect(fixture.nativeElement.querySelector('.alert-alarm__led')).toBeNull();
    expect(pageText()).not.toContain('LED verdes');
    expect((fixture.nativeElement.querySelector('.alert-alarm__state') as HTMLElement).textContent).toContain(
      'Alarma activada',
    );
  });
});
