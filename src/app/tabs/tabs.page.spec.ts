import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

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
});
