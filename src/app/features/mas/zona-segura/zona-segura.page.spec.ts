import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DEMO_SAFE_ZONE } from '../../../core/data/demo-monitoring';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';

import { ZonaSeguraPage } from './zona-segura.page';

describe('ZonaSeguraPage', () => {
  let component: ZonaSeguraPage;
  let fixture: ComponentFixture<ZonaSeguraPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonaSeguraPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ZonaSeguraPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should derive the occupancy from the shared safe zone data', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(component.safeZone()).toBe(DEMO_SAFE_ZONE);
    expect(component.safeZone()).toBe(monitoring.safeZone());
    expect(component.safeZone().people).toBe(12);
    expect(component.safeZone().capacity).toBe(100);
    expect(component.occupancy()).toBe(12);
    expect(component.occupancy()).toBe(monitoring.safeZoneOccupancy());
    expect(component.status()).toBe('normal');
    expect(component.statusLabel()).toBe('Normal');
  });

  it('should render the header, occupancy card and simulated data label', () => {
    const content = pageText();
    const progress = fixture.nativeElement.querySelector('.safe-card__progress') as HTMLElement;

    expect(content).toContain('Zona segura');
    expect(content).toContain('Punto de encuentro');
    expect(content).toContain('12');
    expect(content).toContain('/ 100');
    expect(content).toContain('12%');
    expect(content).toContain('Capacidad 100 personas');
    expect(content).toContain('Datos simulados');
    expect(content).toContain('Normal');
    expect(progress.getAttribute('aria-valuenow')).toBe('12');
  });

  it('should keep the accessible occupancy card structure', () => {
    const card = fixture.nativeElement.querySelector('.safe-card') as HTMLElement;
    const foot = card?.querySelector('.safe-card__foot');
    const note = fixture.nativeElement.querySelector('.safe-note') as HTMLElement;

    expect(card?.getAttribute('aria-labelledby')).toBe('safe-card-title');
    expect(card?.querySelector('.safe-card__progress')?.getAttribute('role')).toBe('progressbar');
    expect(foot).toBeTruthy();
    expect(note?.getAttribute('aria-labelledby')).toBe('safe-note-title');
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });

  it('should not render entry, exit or history sections', () => {
    const content = pageText();

    expect(content).not.toContain('Entradas');
    expect(content).not.toContain('Salidas');
    expect(content).not.toContain('Historial de eventos');
  });
});
