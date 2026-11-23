import { PLATFORM_ID, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { DemoSessionService } from '../../../core/auth/demo-session.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../../core/auth/testing/verified-session-test.util';
import { ALARM_INCIDENTES, type AlarmaIncidente } from '../../../core/data/alarm-incident-contract';
import { ManualAlarmSyncService } from '../../../core/services/manual-alarm-sync.service';
import { ManualAlarmService, type ManualAlarmRecord } from '../../../core/services/manual-alarm.service';

import { ManualEmergencyModalComponent } from './manual-emergency-modal.component';

const ALARMA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MENSAJE_GENERAL = 'Sigue las indicaciones del personal autorizado.';

const AVISOS_POR_EVENTO: Readonly<Record<AlarmaIncidente, string>> = {
  incendio:
    'Evacúa con calma por la ruta de escape más cercana. No uses ascensores y sigue las indicaciones del personal autorizado.',
  sismo:
    'Protégate bajo un mueble resistente y aléjate de ventanas y objetos que puedan caer. Espera la señal para evacuar.',
  impacto:
    'Aléjate de la zona afectada y permanece en un lugar seguro. Sigue las indicaciones del personal autorizado.',
  emergencia: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
  simulacro:
    'Es un simulacro. Diríjase con calma a la zona segura designada y siga las indicaciones del personal autorizado.',
};

function alarma(evento: AlarmaIncidente | null): ManualAlarmRecord {
  return {
    id: ALARMA_ID,
    tipo: 'alarma_manual',
    titulo: '⚠️ PRECAUCIÓN',
    mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
    severidad: 'critical',
    fecha_activacion: '2026-11-23T12:00:00.000Z',
    estado: 'activa',
    evento,
    origen: 'cliente',
    eventoReportado: evento !== null,
  };
}

describe('ManualEmergencyModalComponent', () => {
  let fixture: ComponentFixture<ManualEmergencyModalComponent>;
  let component: ManualEmergencyModalComponent;
  let session: DemoSessionService;
  let verified: VerifiedTestIdentities;
  let activeAlarm: WritableSignal<ManualAlarmRecord | null>;
  let finalize: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  const noticeText = (): string =>
    (fixture.nativeElement.querySelector('.manual-emergency-dialog__notice')?.textContent ?? '').trim();

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    activeAlarm = signal<ManualAlarmRecord | null>(null);
    finalize = vi.fn(async (id: string, evento?: AlarmaIncidente | null) => ({
      ...alarma(evento ?? null),
      id,
      estado: 'finalizada' as const,
      comandoMqtt: { fase: 'publicado' as const, mensaje: 'Comando entregado al transporte MQTT.' },
    }));
    refresh = vi.fn(async () => {});

    TestBed.configureTestingModule({
      imports: [ManualEmergencyModalComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: ManualAlarmSyncService,
          useValue: {
            activeAlarm,
            syncStatus: signal<'idle' | 'loading' | 'ready' | 'error'>('ready'),
            refresh,
          },
        },
        { provide: ManualAlarmService, useValue: { finalize } },
      ],
    });

    session = TestBed.inject(DemoSessionService);
    session.publishVerifiedIdentity(verified.administrador);

    fixture = TestBed.createComponent(ManualEmergencyModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('muestra un aviso específico para los cinco eventos sin alterar alarm.mensaje', () => {
    for (const evento of ALARM_INCIDENTES) {
      activeAlarm.set(alarma(evento));
      fixture.detectChanges();

      expect(noticeText()).toBe(AVISOS_POR_EVENTO[evento]);
      expect((fixture.nativeElement.querySelector('.manual-emergency-dialog__message')?.textContent ?? '').trim()).toBe(
        'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
      );
    }
  });

  it('conserva el aviso general exacto para una alarma histórica con evento=null', () => {
    activeAlarm.set({ ...alarma(null), evento: null, eventoReportado: false });
    fixture.detectChanges();

    expect(noticeText()).toBe(MENSAJE_GENERAL);
    expect(activeAlarm()?.evento).toBeNull();
    expect(activeAlarm()?.eventoReportado).toBe(false);
  });

  it('envía el evento correcto al finalizar cada incidente', async () => {
    for (const evento of ALARM_INCIDENTES) {
      activeAlarm.set(alarma(evento));
      fixture.detectChanges();

      component.requestFinalize();
      fixture.detectChanges();
      await component.confirmFinalize();

      expect(finalize).toHaveBeenCalledWith(ALARMA_ID, evento);
      finalize.mockClear();

      activeAlarm.set(null);
      fixture.detectChanges();
    }
  });

  it('envía evento=null al finalizar una alarma histórica', async () => {
    activeAlarm.set({ ...alarma(null), evento: null, eventoReportado: false });
    fixture.detectChanges();

    component.requestFinalize();
    fixture.detectChanges();
    await component.confirmFinalize();

    expect(finalize).toHaveBeenCalledWith(ALARMA_ID, null);
  });

  it('permite finalizar a Administrador e Instructor y bloquea a Aprendiz', async () => {
    activeAlarm.set(alarma('simulacro'));

    session.publishVerifiedIdentity(verified.administrador);
    fixture.detectChanges();
    expect(component.canFinalize()).toBe(true);

    session.publishVerifiedIdentity(verified.instructor);
    fixture.detectChanges();
    expect(component.canFinalize()).toBe(true);

    session.selectProfile('aprendiz');
    fixture.detectChanges();
    expect(component.canFinalize()).toBe(false);
    expect(fixture.nativeElement.querySelector('.manual-emergency-dialog__actions')).toBeNull();

    component.requestFinalize();
    expect(component.finalizeError()).toContain('No tienes permisos');
    expect(finalize).not.toHaveBeenCalled();
  });
});
