import type { AdminUserAccount, InstructorAccount } from './auth-domain.types';
import { isAdminUserAccount, isInstructorAccount, isInstructorAccountRead } from './instructor-account.validators';

const BASE_ACCOUNT = { id: 'ins-1', nombre: 'instructor_real' } as const;

describe('instructor account validators', () => {
  describe('isInstructorAccount', () => {
    it('acepta la respuesta de creación con activo true', () => {
      const value = { ...BASE_ACCOUNT, activo: true, extra: 'se ignora' };

      expect(isInstructorAccount(value)).toBe(true);
    });

    it.each([false, undefined, 'true', 1, null])('rechaza activo %j en la respuesta de creación', (activo) => {
      expect(isInstructorAccount({ ...BASE_ACCOUNT, activo })).toBe(false);
    });

    it.each([{}, { id: '', nombre: 'instructor_real', activo: true }, { id: 'ins-1', nombre: '', activo: true }])(
      'rechaza campos mínimos inválidos %j',
      (value) => {
        expect(isInstructorAccount(value)).toBe(false);
      },
    );

    it('rechaza valores que no son objetos', () => {
      expect(isInstructorAccount(null)).toBe(false);
      expect(isInstructorAccount('ins-1')).toBe(false);
    });

    it('preserva el contrato de tipos de InstructorAccount', () => {
      const value: InstructorAccount = { ...BASE_ACCOUNT, activo: true };

      expect(isInstructorAccount(value)).toBe(true);
    });
  });

  describe('isInstructorAccountRead', () => {
    it.each([true, false])('acepta activo %j en lectura', (activo) => {
      expect(isInstructorAccountRead({ ...BASE_ACCOUNT, activo })).toBe(true);
    });

    it.each([undefined, 'false', 0, null])('rechaza activo %j si no es booleano', (activo) => {
      expect(isInstructorAccountRead({ ...BASE_ACCOUNT, activo })).toBe(false);
    });

    it('rechaza identificador o nombre vacíos', () => {
      expect(isInstructorAccountRead({ id: '', nombre: 'instructor_real', activo: true })).toBe(false);
      expect(isInstructorAccountRead({ id: 'ins-1', nombre: '', activo: false })).toBe(false);
    });
  });

  describe('isAdminUserAccount', () => {
    it.each([
      { rol: 'administrador', activo: true },
      { rol: 'administrador', activo: false },
      { rol: 'instructor', activo: true },
      { rol: 'instructor', activo: false },
    ])('acepta rol $rol y activo $activo', ({ rol, activo }) => {
      expect(isAdminUserAccount({ ...BASE_ACCOUNT, rol, activo })).toBe(true);
    });

    it('ignora campos adicionales del servidor', () => {
      const value = {
        ...BASE_ACCOUNT,
        rol: 'instructor',
        activo: false,
        email: 'no-debe-usarse',
        app_metadata: { interno: true },
      };

      expect(isAdminUserAccount(value)).toBe(true);
    });

    it.each(['aprendiz', '', undefined, 1, null])('rechaza rol %j', (rol) => {
      expect(isAdminUserAccount({ ...BASE_ACCOUNT, rol, activo: true })).toBe(false);
    });

    it('rechaza un estado no booleano', () => {
      expect(isAdminUserAccount({ ...BASE_ACCOUNT, rol: 'instructor', activo: 'true' })).toBe(false);
    });

    it('preserva el contrato de tipos de AdminUserAccount', () => {
      const value: AdminUserAccount = { ...BASE_ACCOUNT, rol: 'instructor', activo: false };

      expect(isAdminUserAccount(value)).toBe(true);
    });
  });
});
