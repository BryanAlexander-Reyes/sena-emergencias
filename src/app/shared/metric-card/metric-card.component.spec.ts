import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { MetricCardComponent } from './metric-card.component';

describe('MetricCardComponent', () => {
  let fixture: ComponentFixture<MetricCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MetricCardComponent);
    fixture.componentRef.setInput('title', 'Personas estimadas');
    fixture.componentRef.setInput('value', 107);
    fixture.componentRef.setInput('icon', 'people-outline');
    fixture.componentRef.setInput('accent', 'cyan');
    fixture.componentRef.setInput('description', 'En zonas monitoreadas');
    fixture.detectChanges();
  });

  it('should render the provided metric', () => {
    const element = fixture.nativeElement as HTMLElement;
    const content = element.textContent ?? '';

    expect(content).toContain('Personas estimadas');
    expect(content).toContain('107');
    expect(content).toContain('En zonas monitoreadas');
  });

  it('should apply the accent modifier class', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.classList).toContain('app-card');
    expect(element.classList).toContain('metric-card--cyan');
  });
});
