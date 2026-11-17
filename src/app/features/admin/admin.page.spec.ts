import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from '../../core/auth/admin-access.guard';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAssistantService } from '../../core/services/demo-assistant.service';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';
import { SimulatedSensorsService } from '../../core/services/simulated-sensors.service';
import { SimulationHistoryService } from '../../core/services/simulation-history.service';

import { AdminPage } from './admin.page';

describe('AdminPage', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<AdminPage>>;
  let session: DemoSessionService;

  const pageText = (): string => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [provideRouter([])],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    session.selectProfile('administrador');
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
  });

  it('muestra el panel administrativo al administrador de demostración', () => {
    const activeProfile = fixture.nativeElement.querySelector('.admin-session__value') as HTMLElement;
    const summaryValues = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-summary__value') as NodeListOf<HTMLElement>,
    ).map((item) => item.textContent?.trim());
    const badges = Array.from(fixture.nativeElement.querySelectorAll('.app-badge') as NodeListOf<HTMLElement>).map(
      (item) => item.textContent?.trim(),
    );

    expect(pageText()).toContain('Administración');
    expect(pageText()).toContain('Modo demostración');
    expect(activeProfile.textContent).toContain('Administrador de demostración');
    expect(pageText()).toContain('Usuarios ficticios');
    expect(summaryValues).toEqual(['4', '4', '3', '1']);
    expect(badges).toContain('Demostración');
    expect(pageText()).toContain('USR-DMO-001');
    expect(pageText()).toContain('USR-DMO-002');
    expect(pageText()).toContain('USR-DMO-003');
    expect(pageText()).toContain('USR-DMO-004');
  });

  it('muestra usuarios ficticios sin datos personales reales', () => {
    const text = pageText();

    expect(text).toContain('Administrador Demo');
    expect(text).toContain('Instructor Demo');
    expect(text).toContain('Aprendiz Demo');
    expect(text).toContain('Visitante Demo');
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toContain('contraseña');
  });

  it('filtra usuarios ficticios por rol y permite volver a todos', () => {
    const page = fixture.componentInstance;
    const userCards = (): number => fixture.nativeElement.querySelectorAll('.admin-user').length;

    expect(userCards()).toBe(4);

    page.setRoleFilter('instructor');
    fixture.detectChanges();

    expect(userCards()).toBe(1);
    expect(pageText()).toContain('Instructor Demo');
    expect(pageText()).not.toContain('Administrador Demo');

    page.clearRoleFilter();
    fixture.detectChanges();

    expect(userCards()).toBe(4);
  });

  it('filtra usuarios ficticios por estado y combina filtros', () => {
    const page = fixture.componentInstance;
    const userCards = (): number => fixture.nativeElement.querySelectorAll('.admin-user').length;
    const statusButton = fixture.nativeElement.querySelector(
      '.admin-users__filters [data-status="solo-lectura"]',
    ) as HTMLButtonElement;

    statusButton.click();
    fixture.detectChanges();

    expect(page.statusFilter()).toBe('solo-lectura');
    expect(userCards()).toBe(1);
    expect(pageText()).toContain('Visitante Demo');
    expect(pageText()).not.toContain('Administrador Demo');

    page.setRoleFilter('administrador');
    fixture.detectChanges();

    expect(userCards()).toBe(0);
    expect(pageText()).toContain('No hay usuarios ficticios para los filtros seleccionados');

    page.clearRoleFilter();
    page.clearStatusFilter();
    fixture.detectChanges();

    expect(userCards()).toBe(4);
  });

  it('consulta usuarios y estados sin modificar el perfil activo', () => {
    const page = fixture.componentInstance;
    const instructorButton = fixture.nativeElement.querySelector('[data-role="instructor"]') as HTMLButtonElement;

    instructorButton.click();
    fixture.detectChanges();

    expect(page.filteredUsers()).toHaveLength(1);
    expect(page.statusLabel('solo-lectura')).toBe('Solo lectura');
    expect(session.profileId()).toBe('administrador');
  });

  it('retira el acceso de forma inmediata al cambiar a visitante', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    session.selectProfile('visitante');
    TestBed.flushEffects();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.canAccess()).toBe(false);
    expect(pageText()).toContain('Acceso restringido');
    expect(pageText()).not.toContain('USR-DMO');
    expect(pageText()).not.toContain('Usuarios ficticios');
    expect(fixture.nativeElement.querySelector('.admin-users')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/tabs/mas'], {
      queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
      replaceUrl: true,
    });
  });

  it('no altera el simulador al consultar ni al perder el permiso', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);
    const history = TestBed.inject(SimulationHistoryService);
    const sensors = TestBed.inject(SimulatedSensorsService);
    const assistant = TestBed.inject(DemoAssistantService);

    const initial = JSON.stringify({
      zones: monitoring.snapshots(),
      alerts: alerts.alerts(),
      history: history.events(),
      sensors: sensors.sensors(),
      assistant: assistant.messages(),
    });

    fixture.componentInstance.setRoleFilter('visitante');
    session.selectProfile('visitante');
    TestBed.flushEffects();
    fixture.detectChanges();

    const final = JSON.stringify({
      zones: monitoring.snapshots(),
      alerts: alerts.alerts(),
      history: history.events(),
      sensors: sensors.sensors(),
      assistant: assistant.messages(),
    });

    expect(initial).toBe(final);
    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.monitoredZones()).toBe(4);
    expect(monitoring.hasOccupancyChanges()).toBe(false);
    expect(alerts.totalAlerts()).toBe(3);
    expect(alerts.activeAlerts()).toBe(1);
    expect(history.isEmpty()).toBe(true);
    expect(sensors.totalDevices()).toBe(6);
    expect(assistant.messages()).toHaveLength(1);
  });
});
