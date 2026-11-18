import { TestBed } from '@angular/core/testing';

import { DemoSessionService } from '../auth/demo-session.service';

import { buildAlarmNotice, DemoAlarmNoticeService } from './demo-alarm-notice.service';
import { DemoAlarmStateService } from './demo-alarm-state.service';
import { MonitoringStateService } from './monitoring-state.service';

describe('DemoAlarmNoticeService (Fase 4.6)', () => {
  let noticeService: DemoAlarmNoticeService;
  let alarm: DemoAlarmStateService;
  let session: DemoSessionService;
  let monitoring: MonitoringStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    noticeService = TestBed.inject(DemoAlarmNoticeService);
    alarm = TestBed.inject(DemoAlarmStateService);
    session = TestBed.inject(DemoSessionService);
    monitoring = TestBed.inject(MonitoringStateService);
    TestBed.flushEffects();
  });

  const removeAgglomeration = (): void => {
    for (let step = 0; step < 3; step += 1) {
      monitoring.decrementOccupancy('pasillo-principal');
    }
    TestBed.flushEffects();
  };

  it('usa el nivel crítico de MonitoringStateService como único criterio', () => {
    expect(noticeService.hasAgglomeration()).toBe(true);
    expect(noticeService.agglomerationZoneName()).toBe('Pasillo principal');

    removeAgglomeration();

    expect(noticeService.hasAgglomeration()).toBe(false);
    expect(noticeService.agglomerationZoneName()).toBeUndefined();
  });

  it('caso A: sin aglomeración y alarma apagada', () => {
    removeAgglomeration();

    expect(noticeService.notice()).toEqual({
      scenario: 'A',
      message: 'Sin aglomeración crítica ni alarma activa.',
    });
  });

  it('caso B: con aglomeración y alarma apagada, sin encender el buzzer', () => {
    expect(noticeService.notice()).toEqual({
      scenario: 'B',
      message: 'Aglomeración detectada. Mantenga la calma y esté atento a las indicaciones del personal autorizado.',
      zoneName: 'Pasillo principal',
    });
    expect(alarm.isOn()).toBe(false);
  });

  it('caso C: sin aglomeración y alarma encendida manualmente', () => {
    session.selectProfile('administrador');
    removeAgglomeration();
    alarm.turnOn();

    expect(noticeService.notice()).toEqual({
      scenario: 'C',
      message: 'Alarma activada por personal autorizado. Siga las indicaciones del personal responsable.',
    });
  });

  it('caso D: con aglomeración y alarma encendida', () => {
    session.selectProfile('administrador');
    alarm.turnOn();

    expect(noticeService.notice()).toEqual({
      scenario: 'D',
      message: 'Aglomeración detectada y alarma activada. Siga las indicaciones del personal autorizado.',
      zoneName: 'Pasillo principal',
    });
  });

  it('deriva el mensaje de forma reactiva al cambiar sólo el estado de la alarma', () => {
    expect(noticeService.notice().scenario).toBe('B');

    session.selectProfile('administrador');
    alarm.turnOn();
    expect(noticeService.notice().scenario).toBe('D');

    alarm.turnOff();
    expect(noticeService.notice().scenario).toBe('B');
  });

  it('no muestra instrucciones LED sin confirmación de ruta segura', () => {
    expect(noticeService.ledInstruction()).toBeNull();

    session.selectProfile('administrador');
    alarm.turnOn();

    expect(noticeService.ledInstruction()).toBeNull();
    expect(noticeService.notice().message).not.toContain('LED');
    expect(buildAlarmNotice('Pasillo principal', true).message).not.toContain('LED');
  });
});
