import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DemoSessionService } from '../core/auth/demo-session.service';
import { publishVerifiedRole, verifiedTestIdentities } from '../core/auth/testing/verified-session-test.util';

import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render five bottom tabs', () => {
    const tabButtons = fixture.nativeElement.querySelectorAll('ion-tab-button') as NodeListOf<HTMLElement>;

    expect(tabButtons.length).toBe(5);
    expect(Array.from(tabButtons).map((button) => button.getAttribute('tab'))).toEqual([
      'inicio',
      'zonas',
      'mapa',
      'alertas',
      'mas',
    ]);
  });

  it('should render the desktop rail with the same five destinations', () => {
    const links = fixture.nativeElement.querySelectorAll('.app-rail__link') as NodeListOf<HTMLAnchorElement>;

    expect(Array.from(links).map((link) => link.textContent?.trim())).toEqual([
      'Inicio',
      'Zonas',
      'Mapa',
      'Alertas',
      'Más',
    ]);
  });

  it('should expose the admin rail link only with a verified administrator identity', async () => {
    const session = TestBed.inject(DemoSessionService);
    const identities = await verifiedTestIdentities();

    expect(fixture.nativeElement.querySelector('.app-rail__admin')).toBeNull();

    expect(publishVerifiedRole(session, 'instructor', identities)).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-rail__admin')).toBeNull();

    expect(publishVerifiedRole(session, 'administrador', identities)).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-rail__admin')).not.toBeNull();
  });
});
