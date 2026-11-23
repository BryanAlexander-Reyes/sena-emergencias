import {
  ALARM_ERROR_CODES,
  ALARM_INCIDENTES,
  ALARM_ORIGENES,
  IDENTIDAD_DISPOSITIVO,
  MENSAJE_ALARMA_MANUAL,
  TITULO_ALARMA_MANUAL,
  TIPO_ALARMA_MANUAL,
  autorizarEventoHardware,
  crearPropuestaActivacion,
  crearPropuestaActivacionHardware,
  esAlarmaIncidente,
  esAlarmaOrigen,
  esCodigoErrorAlarma,
  eventosPermitidosParaRol,
  normalizarIncidenteAlarma,
  puedeActivar,
  puedeConsultar,
  puedeEnviarComandoMqtt,
  puedeFinalizar,
  puedeRecibirFcm,
  validarClaveIncidente,
  validarSolicitudRpcActivacion,
  type ActorRol,
} from './alarm-incident-contract';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('alarm incident contract — MQTT.3B', () => {
  it('conserva tipo y textos aprobados y agrega evento/origen independientes', () => {
    expect(TIPO_ALARMA_MANUAL).toBe('alarma_manual');
    expect(TITULO_ALARMA_MANUAL).toBe('⚠️ PRECAUCIÓN');
    expect(MENSAJE_ALARMA_MANUAL).toContain('Diríjase con calma');
    expect(ALARM_INCIDENTES).toEqual(['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia']);
    expect(ALARM_ORIGENES).toEqual(['cliente', 'hardware']);

    const propuesta = crearPropuestaActivacion({
      claveIdempotencia: UUID,
      evento: 'incendio',
      origen: 'cliente',
    });

    expect(propuesta).toEqual({
      clave_idempotencia: UUID,
      tipo: 'alarma_manual',
      evento: 'incendio',
      origen: 'cliente',
      titulo: TITULO_ALARMA_MANUAL,
      mensaje: MENSAJE_ALARMA_MANUAL,
      severidad: 'critical',
    });
  });

  it('valida evento y origen sin reinterpretar campos existentes', () => {
    expect(esAlarmaIncidente('simulacro')).toBe(true);
    expect(esAlarmaIncidente('volcan')).toBe(false);
    expect(esAlarmaOrigen('hardware')).toBe(true);
    expect(esAlarmaOrigen('servidor')).toBe(false);

    expect(() =>
      crearPropuestaActivacion({ claveIdempotencia: 'no-uuid', evento: 'sismo', origen: 'cliente' }),
    ).toThrow('IDEMPOTENCIA_NO_UUID');
    expect(() =>
      crearPropuestaActivacion({ claveIdempotencia: UUID, evento: 'volcan' as 'sismo', origen: 'cliente' }),
    ).toThrow('EVENTO_NO_VALIDO');
    expect(() =>
      crearPropuestaActivacion({ claveIdempotencia: UUID, evento: 'sismo', origen: 'servidor' as 'cliente' }),
    ).toThrow('ORIGEN_NO_VALIDO');
  });

  it('usa evento_id como idempotencia hardware sin identidad humana', () => {
    const propuesta = crearPropuestaActivacionHardware({ eventoId: 'ev-123', evento: 'sismo' });

    expect(propuesta.clave_idempotencia).toBe('ev-123');
    expect(propuesta.origen).toBe('hardware');
    expect(propuesta.tipo).toBe('alarma_manual');
    expect(propuesta.evento).toBe('sismo');
    expect(() => crearPropuestaActivacionHardware({ eventoId: '', evento: 'sismo' })).toThrow('EVENTO_ID_INVALIDO');
    expect(() => crearPropuestaActivacionHardware({ eventoId: 'x'.repeat(64), evento: 'sismo' })).toThrow(
      'EVENTO_ID_INVALIDO',
    );

    const decision = autorizarEventoHardware('impacto');
    expect(decision).toEqual({
      permitido: true,
      origen: 'hardware',
      identidad: IDENTIDAD_DISPOSITIVO,
      requiereUsuarioHumano: false,
      code: 'EVENTO_HARDWARE_ACEPTADO',
    });
    expect(autorizarEventoHardware('volcan' as 'impacto').code).toBe('EVENTO_NO_VALIDO');
  });

  it('normaliza registros históricos sin inventar evento', () => {
    const historico = {
      id: '11111111-2222-4333-8444-555555555555',
      tipo: 'alarma_manual',
      titulo: TITULO_ALARMA_MANUAL,
      mensaje: MENSAJE_ALARMA_MANUAL,
      severidad: 'critical',
      fecha_activacion: '2026-11-23T12:00:00.000Z',
    };

    expect(normalizarIncidenteAlarma(historico)).toEqual({
      ...historico,
      evento: null,
      origen: 'cliente',
      eventoReportado: false,
    });
    expect(normalizarIncidenteAlarma(null)).toBeNull();
    expect(normalizarIncidenteAlarma({ ...historico, fecha_activacion: 'no-fecha' })).toBeNull();
  });

  it('conserva evento/origen presentes y descarta valores no reconocidos', () => {
    const base = {
      id: 'abc',
      tipo: 'alarma_manual',
      titulo: 't',
      mensaje: 'm',
      severidad: 'critical',
      fecha_activacion: '2026-11-23T12:00:00.000Z',
    };

    expect(normalizarIncidenteAlarma({ ...base, evento: 'simulacro', origen: 'hardware' })).toMatchObject({
      evento: 'simulacro',
      origen: 'hardware',
      eventoReportado: true,
    });
    expect(normalizarIncidenteAlarma({ ...base, evento: 'volcan', origen: 'robot' })).toMatchObject({
      evento: null,
      origen: 'cliente',
      eventoReportado: false,
    });
  });

  it('aplica la matriz MQTT.4: administrador e instructor idénticos en alarmas', () => {
    const roles: readonly ActorRol[] = ['administrador', 'instructor', 'aprendiz'];

    for (const evento of ALARM_INCIDENTES) {
      expect(puedeActivar('administrador', evento)).toBe(true);
      expect(puedeActivar('instructor', evento)).toBe(true);
      expect(puedeActivar('aprendiz', evento)).toBe(false);
      expect(puedeFinalizar('administrador', evento)).toBe(true);
      expect(puedeFinalizar('instructor', evento)).toBe(true);
      expect(puedeFinalizar('aprendiz', evento)).toBe(false);
      expect(puedeEnviarComandoMqtt('administrador')).toBe(true);
      expect(puedeEnviarComandoMqtt('instructor')).toBe(true);
      expect(puedeEnviarComandoMqtt('aprendiz')).toBe(false);
    }

    for (const rol of roles) {
      expect(puedeConsultar(rol)).toBe(true);
      expect(puedeRecibirFcm(rol, true, true)).toBe(true);
      expect(puedeRecibirFcm(rol, false, true)).toBe(false);
      expect(puedeRecibirFcm(rol, true, false)).toBe(false);
    }

    expect(puedeFinalizar('administrador', null)).toBe(true);
    expect(puedeFinalizar('instructor', null)).toBe(true);
    expect(puedeFinalizar('aprendiz', null)).toBe(false);
    expect(eventosPermitidosParaRol('administrador')).toEqual(ALARM_INCIDENTES);
    expect(eventosPermitidosParaRol('instructor')).toEqual(ALARM_INCIDENTES);
    expect(eventosPermitidosParaRol('aprendiz')).toEqual([]);
  });

  it('mantiene una lista canónica de errores compartida por todas las capas', () => {
    expect(new Set(ALARM_ERROR_CODES).size).toBe(ALARM_ERROR_CODES.length);
    for (const code of [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'EVENTO_NO_SELECCIONADO',
      'EVENTO_NO_VALIDO',
      'IDEMPOTENCY_CONFLICT',
      'RPC_NO_DISPONIBLE',
      'MQTT_NO_DISPONIBLE',
    ] as const) {
      expect(esCodigoErrorAlarma(code)).toBe(true);
    }
    expect(esCodigoErrorAlarma('ERROR_INVENTADO')).toBe(false);
  });

  it('separa idempotencia de incidente de idempotencia de comando MQTT', () => {
    expect(validarClaveIncidente(UUID, 'cliente')).toBeNull();
    expect(validarClaveIncidente('ev-123', 'cliente')).toBe('IDEMPOTENCIA_NO_UUID');
    expect(validarClaveIncidente('ev-123', 'hardware')).toBeNull();
    expect(validarClaveIncidente('x'.repeat(64), 'hardware')).toBe('EVENTO_ID_INVALIDO');
    expect(validarClaveIncidente('', 'hardware')).toBe('IDEMPOTENCIA_REQUERIDA');
  });

  it('valida por completo la solicitud de RPC sin asumir nombres de restricciones', () => {
    const base = {
      tipo: TIPO_ALARMA_MANUAL,
      evento: 'simulacro',
      origen: 'cliente',
      titulo: TITULO_ALARMA_MANUAL,
      mensaje: MENSAJE_ALARMA_MANUAL,
      severidad: 'critical',
      activadoPor: UUID,
      claveIdempotencia: UUID,
    } as const;

    expect(validarSolicitudRpcActivacion(base)).toEqual({ valida: true });
    expect(validarSolicitudRpcActivacion({ ...base, tipo: 'otro' })).toEqual({
      valida: false,
      code: 'TIPO_NO_VALIDO',
    });
    expect(validarSolicitudRpcActivacion({ ...base, evento: 'volcan' })).toEqual({
      valida: false,
      code: 'EVENTO_NO_VALIDO',
    });
    expect(validarSolicitudRpcActivacion({ ...base, origen: 'servidor' })).toEqual({
      valida: false,
      code: 'ORIGEN_NO_VALIDO',
    });
    expect(validarSolicitudRpcActivacion({ ...base, activadoPor: null })).toEqual({
      valida: false,
      code: 'USUARIO_REQUERIDO',
    });
    expect(validarSolicitudRpcActivacion({ ...base, evento: null, requiereEvento: true })).toEqual({
      valida: false,
      code: 'EVENTO_NO_SELECCIONADO',
    });
    // C4: cliente antiguo con evento ausente sigue siendo válido en Fase A.
    expect(validarSolicitudRpcActivacion({ ...base, evento: null })).toEqual({ valida: true });

    const hardware = {
      ...base,
      evento: 'incendio',
      origen: 'hardware',
      activadoPor: null,
      claveIdempotencia: 'ev-123',
    } as const;
    expect(validarSolicitudRpcActivacion(hardware)).toEqual({ valida: true });
    expect(validarSolicitudRpcActivacion({ ...hardware, activadoPor: UUID })).toEqual({
      valida: false,
      code: 'IDENTIDAD_HARDWARE_INVALIDA',
    });
    expect(validarSolicitudRpcActivacion({ ...hardware, evento: null })).toEqual({
      valida: false,
      code: 'EVENTO_NO_SELECCIONADO',
    });
  });
});
