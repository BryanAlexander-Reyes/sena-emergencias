import { TestBed } from '@angular/core/testing';

import { DEMO_ALERTS } from '../data/demo-alerts';

import { AlertsStateService } from './alerts-state.service';

describe('AlertsStateService', () => {
  let service: AlertsStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AlertsStateService);
  });

  it('should be a singleton shared through dependency injection', () => {
    expect(TestBed.inject(AlertsStateService)).toBe(service);
  });

  it('should expose the three demo alerts without duplicating their data', () => {
    expect(service.alerts()).toBe(DEMO_ALERTS);
    expect(service.totalAlerts()).toBe(3);
    expect(service.activeAlerts()).toBe(1);
    expect(service.reviewedAlerts()).toBe(2);
    expect(service.alerts().filter((alert) => alert.status === 'active')).toHaveLength(1);
    expect(service.alerts().filter((alert) => alert.status === 'resolved')).toHaveLength(2);
  });

  it('should expose the active critical alert shared with the dashboard', () => {
    expect(service.activeCriticalAlert()?.id).toBe('ALR-001');
    expect(service.activeCriticalAlert()?.zoneName).toBe('Pasillo principal');
  });

  it('should mark a pending alert as reviewed without resolving it', () => {
    service.markReviewed('ALR-001');

    expect(service.alerts()[0].review).toBe('reviewed');
    expect(service.alerts()[0].status).toBe('active');
    expect(service.reviewedAlerts()).toBe(3);
    expect(service.activeAlerts()).toBe(1);
    expect(service.totalAlerts()).toBe(3);
    expect(service.activeCriticalAlert()?.id).toBe('ALR-001');
  });

  it('should not mutate the original demo alert records', () => {
    service.markReviewed('ALR-001');

    expect(DEMO_ALERTS[0].review).toBe('pending');
  });

  it('should keep the same array when the identifier is unknown', () => {
    const before = service.alerts();

    service.markReviewed('ALR-999');

    expect(service.alerts()).toBe(before);
    expect(service.reviewedAlerts()).toBe(2);
    expect(service.activeAlerts()).toBe(1);
  });

  it('should keep the same array when the alert is already reviewed', () => {
    const before = service.alerts();

    service.markReviewed('ALR-002');

    expect(service.alerts()).toBe(before);
    expect(service.reviewedAlerts()).toBe(2);
  });
});
