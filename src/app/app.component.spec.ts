import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppComponent } from './app.component';
import { DemoSessionService } from './core/auth/demo-session.service';
import { ManualAlarmSyncService } from './core/services/manual-alarm-sync.service';
import { OccupancyAlertEngineService } from './core/services/occupancy-alert-engine.service';
import { PushNotificationService } from './core/services/push-notification.service';

describe('AppComponent alarm recovery', () => {
  const status = signal('error');
  const account = signal<unknown>(null);
  let refreshes = 0;

  beforeEach(() => {
    status.set('error');
    account.set(null);
    refreshes = 0;
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: OccupancyAlertEngineService, useValue: {} },
        { provide: PushNotificationService, useValue: { initialize: async () => undefined } },
        { provide: DemoSessionService, useValue: { authenticatedAccount: account, status: signal('lista') } },
        { provide: ManualAlarmSyncService, useValue: {
          activeAlarm: signal(null), syncStatus: status, start: () => undefined,
          refresh: async () => { refreshes++; },
        } },
      ],
    }).overrideComponent(AppComponent, { set: { template: '', imports: [] } });
  });

  it('recovers the initial error when a later sync succeeds', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.initialAlarmCheckStatus()).toBe('error');
    status.set('ready');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.initialAlarmCheckStatus()).toBe('ready');
  });

  it('refreshes alarms again when the authenticated identity changes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const before = refreshes;
    account.set({ id: 'verified-account' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(refreshes).toBeGreaterThan(before);
  });
});
