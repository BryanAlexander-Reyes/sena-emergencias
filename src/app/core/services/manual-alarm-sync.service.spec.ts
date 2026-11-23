import { TestBed } from '@angular/core/testing';
import { ManualAlarmSyncService } from './manual-alarm-sync.service';
import { ManualAlarmService, type ManualAlarmRecord } from './manual-alarm.service';

describe('Multiple alarm synchronization', () => {
  let rows: ManualAlarmRecord[];
  let fail: boolean;
  let sync: ManualAlarmSyncService;
  const alarm = (id: string): ManualAlarmRecord => ({
    id, tipo: 'alarma_manual', titulo: 'Aviso', mensaje: 'Evacuar', severidad: 'critical',
    estado: 'activa', fecha_activacion: '2026-11-23T12:00:00Z', evento: 'sismo', origen: 'cliente', eventoReportado: true,
  });
  beforeEach(() => {
    rows = [alarm('b'), alarm('a'), alarm('a')]; fail = false;
    TestBed.configureTestingModule({ providers: [{ provide: ManualAlarmService, useValue: {
      getActiveAlarms: async () => { if (fail) throw new Error('network'); return rows; },
    } }] });
    sync = TestBed.inject(ManualAlarmSyncService);
  });
  it('deduplicates and selects incidents by ID', async () => {
    await sync.refresh();
    expect(sync.activeAlarms().map(item => item.id)).toEqual(['a', 'b']);
    sync.selectAlarm('b');
    expect(sync.activeAlarm()?.id).toBe('b');
  });
  it('keeps incidents on network failure and moves to the next on closure', async () => {
    await sync.refresh(); fail = true; await sync.refresh();
    expect(sync.activeAlarms()).toHaveLength(2);
    expect(sync.syncStatus()).toBe('error');
    fail = false; rows = [alarm('b')]; await sync.refresh();
    expect(sync.activeAlarm()?.id).toBe('b');
  });
  it('selects a push target after it is recovered', async () => {
    sync.selectAlarm('b'); await sync.refresh();
    expect(sync.activeAlarm()?.id).toBe('b');
  });
});
