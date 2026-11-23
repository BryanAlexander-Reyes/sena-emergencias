import { TestBed } from '@angular/core/testing';

import { AlarmEventSelectionService } from './alarm-event-selection.service';
import { ALARM_INCIDENTES } from './alarm-incident-contract';

describe('AlarmEventSelectionService — MQTT.4', () => {
  let selector: AlarmEventSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    selector = TestBed.inject(AlarmEventSelectionService);
  });

  it('no selecciona automáticamente ningún evento', () => {
    expect(selector.evento()).toBeNull();
    expect(selector.seleccionado()).toBe(false);
  });

  it('ofrece los cinco eventos a administrador e instructor', () => {
    expect(selector.opciones()).toEqual(ALARM_INCIDENTES);
    for (const rol of ['administrador', 'instructor'] as const) {
      expect(selector.eventosPara(rol)).toEqual(ALARM_INCIDENTES);
      for (const evento of ALARM_INCIDENTES) {
        expect(selector.seleccionar(evento, rol)).toBe(true);
        expect(selector.evento()).toBe(evento);
      }
    }
  });

  it('no permite selección a aprendiz ni valores fuera del dominio', () => {
    expect(selector.eventosPara('aprendiz')).toEqual([]);
    expect(selector.seleccionar('incendio', 'aprendiz')).toBe(false);
    expect(selector.seleccionar('volcan')).toBe(false);
    expect(selector.evento()).toBeNull();
  });

  it('permite limpiar la selección y volver a elegir explícitamente', () => {
    expect(selector.seleccionar('sismo')).toBe(true);
    expect(selector.evento()).toBe('sismo');
    selector.limpiar();
    expect(selector.evento()).toBeNull();
    expect(selector.seleccionar('emergencia')).toBe(true);
    expect(selector.evento()).toBe('emergencia');
  });
});
