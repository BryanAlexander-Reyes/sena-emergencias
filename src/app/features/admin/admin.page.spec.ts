import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import type { Mock } from 'vitest';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from '../../core/auth/admin-access.guard';
import type { AdminUserAccount, CreateInstructorInput, InstructorAccount } from '../../core/auth/auth-domain.types';
import { DemoAuthService } from '../../core/auth/demo-auth.service';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { INSTRUCTOR_ACCOUNT_REPOSITORY } from '../../core/auth/instructor-account-repository.contract';
import {
  INSTRUCTOR_REPOSITORY_MESSAGES,
  InstructorRepositoryError,
  type InstructorRepositoryErrorCode,
} from '../../core/auth/supabase-instructor-account.repository';
import {
  publishVerifiedRole,
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../core/auth/testing/verified-session-test.util';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAssistantService } from '../../core/services/demo-assistant.service';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';
import { SimulatedSensorsService } from '../../core/services/simulated-sensors.service';
import { SimulationHistoryService } from '../../core/services/simulation-history.service';

import {
  INSTRUCTOR_CREATED_SUCCESS,
  INSTRUCTOR_DEACTIVATED_SUCCESS,
  INSTRUCTOR_MANAGE_PERMISSION_ERROR,
  INSTRUCTOR_REACTIVATED_SUCCESS,
  AdminPage,
} from './admin.page';

const CREATED_ACCOUNT: InstructorAccount = {
  id: 'ins-servidor-001',
  nombre: 'instructor_real',
  activo: true,
};

const ADMIN_USER: AdminUserAccount = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  nombre: 'admin_real',
  rol: 'administrador',
  activo: true,
};

const ACTIVE_INSTRUCTOR: AdminUserAccount = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  nombre: 'instructor_activo',
  rol: 'instructor',
  activo: true,
};

const INACTIVE_INSTRUCTOR: AdminUserAccount = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  nombre: 'instructor_inactivo',
  rol: 'instructor',
  activo: false,
};

const REAL_USERS: readonly AdminUserAccount[] = [ADMIN_USER, ACTIVE_INSTRUCTOR, INACTIVE_INSTRUCTOR];

const DEACTIVATED_INSTRUCTOR: AdminUserAccount = { ...ACTIVE_INSTRUCTOR, activo: false };
const REACTIVATED_INSTRUCTOR: AdminUserAccount = { ...INACTIVE_INSTRUCTOR, activo: true };
const DEACTIVATED_USERS: readonly AdminUserAccount[] = [ADMIN_USER, DEACTIVATED_INSTRUCTOR, INACTIVE_INSTRUCTOR];
const REACTIVATED_USERS: readonly AdminUserAccount[] = [ADMIN_USER, ACTIVE_INSTRUCTOR, REACTIVATED_INSTRUCTOR];

const STATUS_UPDATED_ACCOUNT: InstructorAccount = {
  id: ACTIVE_INSTRUCTOR.id,
  nombre: ACTIVE_INSTRUCTOR.nombre,
  activo: false,
};

const VALID_INPUT = {
  nombre: 'instructor_real',
  password: 'clave-simulada-123',
} as const;

type CreateInstructorMock = Mock<(input: CreateInstructorInput) => Promise<InstructorAccount>>;
type ListUsersMock = Mock<() => Promise<readonly AdminUserAccount[]>>;
type SetActiveMock = Mock<(id: string, activo: boolean) => Promise<InstructorAccount>>;
type AlertButtonLike = { readonly text?: string; readonly role?: string; readonly handler?: () => void };

describe('AdminPage', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<AdminPage>>;
  let session: DemoSessionService;
  let verified: VerifiedTestIdentities;
  let listUsers: ListUsersMock;
  let createInstructor: CreateInstructorMock;
  let setActive: SetActiveMock;
  let alertCreate: Mock;
  let dismissRole: string;

  const pageText = (): string => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();
  const query = (selector: string): Element | null => fixture.nativeElement.querySelector(selector);
  const queryAll = (selector: string): NodeListOf<Element> => fixture.nativeElement.querySelectorAll(selector);

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setDismissRole(role: string): void {
    dismissRole = role;
  }

  async function setUp(listImpl: () => Promise<readonly AdminUserAccount[]> = async () => REAL_USERS): Promise<void> {
    listUsers = vi.fn(listImpl);
    createInstructor = vi
      .fn<(input: CreateInstructorInput) => Promise<InstructorAccount>>()
      .mockResolvedValue(CREATED_ACCOUNT);
    setActive = vi
      .fn<(id: string, activo: boolean) => Promise<InstructorAccount>>()
      .mockResolvedValue(STATUS_UPDATED_ACCOUNT);
    dismissRole = 'confirm';

    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [
        provideRouter([]),
        {
          provide: INSTRUCTOR_ACCOUNT_REPOSITORY,
          useValue: {
            create: createInstructor,
            list: listUsers,
            setActive,
          },
        },
      ],
    }).compileComponents();

    alertCreate = vi.spyOn(TestBed.inject(AlertController), 'create').mockImplementation(async () => {
      return {
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ data: undefined, role: dismissRole }),
      } as unknown as Awaited<ReturnType<AlertController['create']>>;
    });

    session = TestBed.inject(DemoSessionService);
    session.publishVerifiedIdentity(verified.administrador);
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
  }

  function fillInstructorForm(nombre: string, password: string, confirmation: string): void {
    const page = fixture.componentInstance;

    page.onInstructorUsernameInput({ detail: { value: nombre } } as CustomEvent<{ value?: string | null }>);
    page.onInstructorPasswordInput({ detail: { value: password } } as CustomEvent<{ value?: string | null }>);
    page.onInstructorConfirmationInput({ detail: { value: confirmation } } as CustomEvent<{ value?: string | null }>);
    fixture.detectChanges();
  }

  function fillValidInstructorForm(): void {
    fillInstructorForm(VALID_INPUT.nombre, VALID_INPUT.password, VALID_INPUT.password);
  }

  function expectFieldsPreserved(): void {
    const page = fixture.componentInstance;

    expect(page.instructorUsername()).toBe(VALID_INPUT.nombre);
    expect(page.instructorPassword()).toBe(VALID_INPUT.password);
    expect(page.instructorConfirmation()).toBe(VALID_INPUT.password);
  }

  async function expectCreationFailure(code: InstructorRepositoryErrorCode, expectedMessage: string): Promise<void> {
    const authenticatedBefore = session.authenticatedAccount();
    const demoCreate = vi.spyOn(TestBed.inject(DemoAuthService), 'registerInstructor');

    createInstructor.mockRejectedValueOnce(new InstructorRepositoryError(code));
    fillValidInstructorForm();
    await fixture.componentInstance.registerInstructor();
    fixture.detectChanges();

    expect(createInstructor).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.registrationError()).toBe(expectedMessage);
    expect(fixture.componentInstance.registrationSuccess()).toBeNull();
    expect(fixture.componentInstance.registeringInstructor()).toBe(false);
    expect(pageText()).toContain(expectedMessage);
    expectFieldsPreserved();
    expect(session.profileId()).toBe('administrador');
    expect(session.authenticatedAccount()).toBe(authenticatedBefore);
    expect(demoCreate).not.toHaveBeenCalled();
  }

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
  });

  describe('listado real', () => {
    it('muestra cuentas reales sin etiquetas ni identificadores de demostración', async () => {
      await setUp();
      await settle();

      const summaryValues = Array.from(queryAll('.admin-summary__value')).map((item) => item.textContent?.trim());
      const badges = Array.from(queryAll('.app-badge')).map((item) => item.textContent?.trim());
      const text = pageText();

      expect(text).toContain('Administración');
      expect(text).toContain('Usuarios registrados');
      expect(summaryValues).toEqual(['3', '2', '1', '2']);
      expect(badges).toContain('Datos reales');
      expect(badges).toContain('Servidor');
      expect(text).toContain(ADMIN_USER.nombre);
      expect(text).toContain(ACTIVE_INSTRUCTOR.nombre);
      expect(text).toContain(INACTIVE_INSTRUCTOR.nombre);
      expect(text).toContain(ADMIN_USER.id);
      expect(queryAll('.admin-user')).toHaveLength(3);

      expect(text).not.toContain('Modo demostración');
      expect(text).not.toContain('Usuarios ficticios');
      expect(text).not.toContain('Demostración');
      expect(text).not.toContain('Identificador ficticio');
      expect(text).not.toContain('USR-DMO');
      expect(text).not.toContain('Solo lectura');
      expect(text).not.toContain('Alcance del prototipo');
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text).not.toContain('Admin1234!');
      expect(text).not.toContain('Instructor1234!');
      expect(fixture.componentInstance.canManageInstructors()).toBe(true);
      expect(query('.instructor-management')).not.toBeNull();
    });

    it('mantiene la estructura visual de resumen, filtros y tarjetas', async () => {
      await setUp();
      await settle();

      const filterGroups = Array.from(queryAll('.admin-users__filters'));
      const roleActions = query('.admin-user[data-role="instructor"] .admin-user__actions');

      expect(queryAll('.admin-summary__card')).toHaveLength(4);
      expect(filterGroups).toHaveLength(2);
      expect(filterGroups.map((group) => group.getAttribute('role'))).toEqual(['group', 'group']);
      expect(queryAll('.admin-users__filter')).toHaveLength(6);
      expect(queryAll('.admin-user')).toHaveLength(3);
      expect(roleActions?.getAttribute('aria-busy')).toBe('false');
      expect(query('.instructor-form')?.getAttribute('aria-busy')).toBe('false');
    });

    it('consulta el repositorio una sola vez y conserva el orden del servidor', async () => {
      await setUp();
      await settle();
      fixture.detectChanges();

      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledWith();
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
    });

    it('refleja estados activos, inactivos y conteos por rol', async () => {
      await setUp();
      await settle();

      const page = fixture.componentInstance;
      const cards = Array.from(queryAll('.admin-user'));
      const statuses = cards.map((card) => card.querySelector('.admin-user__status')?.textContent?.trim());

      expect(statuses).toEqual(['Activo', 'Activo', 'Inactivo']);
      expect(page.activeUsers()).toBe(2);
      expect(page.inactiveUsers()).toBe(1);
      expect(page.roleSummaries()).toEqual([
        { role: 'administrador', label: 'Administrador', count: 1 },
        { role: 'instructor', label: 'Instructor', count: 2 },
      ]);
      expect(page.roleSummaries().map((summary) => String(summary.role))).not.toContain('aprendiz');
      expect(cards[2]?.getAttribute('data-role')).toBe('instructor');
      expect(cards[2]?.querySelector('.admin-user__status')?.getAttribute('data-status')).toBe('inactivo');
    });

    it('filtra por rol y permite volver a todos', async () => {
      await setUp();
      await settle();
      const page = fixture.componentInstance;

      page.setRoleFilter('instructor');
      fixture.detectChanges();

      expect(queryAll('.admin-user')).toHaveLength(2);
      expect(pageText()).toContain(ACTIVE_INSTRUCTOR.nombre);
      expect(pageText()).not.toContain(ADMIN_USER.nombre);

      page.clearRoleFilter();
      fixture.detectChanges();

      expect(queryAll('.admin-user')).toHaveLength(3);
    });

    it('filtra por estado y combina filtros', async () => {
      await setUp();
      await settle();
      const page = fixture.componentInstance;

      const inactiveButton = query('.admin-users__filters [data-status="inactivo"]') as HTMLButtonElement;
      inactiveButton.click();
      fixture.detectChanges();

      expect(page.statusFilter()).toBe('inactivo');
      expect(queryAll('.admin-user')).toHaveLength(1);
      expect(pageText()).toContain(INACTIVE_INSTRUCTOR.nombre);

      page.setRoleFilter('administrador');
      fixture.detectChanges();

      expect(queryAll('.admin-user')).toHaveLength(0);
      expect(pageText()).toContain('No hay usuarios para los filtros seleccionados');

      page.clearRoleFilter();
      page.clearStatusFilter();
      fixture.detectChanges();

      expect(queryAll('.admin-user')).toHaveLength(3);
    });

    it('muestra una lista vacía sin inventar cuentas', async () => {
      await setUp(async () => []);
      await settle();

      const page = fixture.componentInstance;

      expect(page.users()).toEqual([]);
      expect(page.totalUsers()).toBe(0);
      expect(page.activeUsers()).toBe(0);
      expect(page.inactiveUsers()).toBe(0);
      expect(queryAll('.admin-user')).toHaveLength(0);
      expect(pageText()).toContain('No hay usuarios registrados en el servidor.');
      expect(listUsers).toHaveBeenCalledTimes(1);
    });

    it('muestra el estado de carga hasta que llega la respuesta', async () => {
      let resolveList: (users: readonly AdminUserAccount[]) => void = () => undefined;
      await setUp(
        () =>
          new Promise<readonly AdminUserAccount[]>((resolve) => {
            resolveList = resolve;
          }),
      );

      expect(fixture.componentInstance.usersLoading()).toBe(true);
      expect(pageText()).toContain('Cargando usuarios…');
      expect(queryAll('.admin-user')).toHaveLength(0);

      resolveList(REAL_USERS);
      await settle();

      expect(fixture.componentInstance.usersLoading()).toBe(false);
      expect(queryAll('.admin-user')).toHaveLength(3);
    });

    it('descarta una respuesta en vuelo si se retira el permiso durante la carga', async () => {
      let resolveList: (users: readonly AdminUserAccount[]) => void = () => undefined;
      await setUp(
        () =>
          new Promise<readonly AdminUserAccount[]>((resolve) => {
            resolveList = resolve;
          }),
      );
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(fixture.componentInstance.usersLoading()).toBe(true);

      session.selectProfile('aprendiz');
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(fixture.componentInstance.users()).toEqual([]);
      expect(fixture.componentInstance.usersLoading()).toBe(false);

      resolveList(REAL_USERS);
      await settle();

      expect(fixture.componentInstance.users()).toEqual([]);
      expect(fixture.componentInstance.usersError()).toBeNull();
      expect(pageText()).toContain('Acceso restringido');
      expect(queryAll('.admin-user')).toHaveLength(0);
    });

    it('muestra un error seguro y permite reintentar la consulta', async () => {
      let attempts = 0;
      await setUp(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new InstructorRepositoryError('LIST_FAILED');
        }
        return REAL_USERS;
      });
      await settle();

      expect(fixture.componentInstance.usersError()).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.LIST_FAILED);
      expect(pageText()).toContain(INSTRUCTOR_REPOSITORY_MESSAGES.LIST_FAILED);
      expect(query('.admin-users__retry')).not.toBeNull();
      expect(queryAll('.admin-user')).toHaveLength(0);

      (query('.admin-users__retry') as HTMLButtonElement).click();
      await settle();

      expect(attempts).toBe(2);
      expect(fixture.componentInstance.usersError()).toBeNull();
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
      expect(queryAll('.admin-user')).toHaveLength(3);
    });

    it('rechaza respuestas malformadas del repositorio sin mostrar filas parciales', async () => {
      await setUp(async () => [{ id: 'incompleto' } as AdminUserAccount]);
      await settle();

      expect(fixture.componentInstance.users()).toEqual([]);
      expect(fixture.componentInstance.usersError()).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.INVALID_RESPONSE);
      expect(queryAll('.admin-user')).toHaveLength(0);
    });
  });

  describe('creación de instructores', () => {
    it('crea en el repositorio y recarga el listado real tras el alta', async () => {
      let calls = 0;
      const newUser: AdminUserAccount = {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        nombre: VALID_INPUT.nombre,
        rol: 'instructor',
        activo: true,
      };
      await setUp(async () => {
        calls += 1;
        return calls === 1 ? REAL_USERS : [...REAL_USERS, newUser];
      });
      await settle();
      const demoAuth = TestBed.inject(DemoAuthService);
      const demoCreate = vi.spyOn(demoAuth, 'registerInstructor');
      const demoDeactivate = vi.spyOn(demoAuth, 'deactivateInstructor');
      const accountsBefore = demoAuth.instructorAccounts();
      const authenticatedBefore = session.authenticatedAccount();

      fillValidInstructorForm();
      await fixture.componentInstance.registerInstructor();
      await settle();

      expect(createInstructor).toHaveBeenCalledTimes(1);
      expect(createInstructor).toHaveBeenCalledWith({ nombre: VALID_INPUT.nombre, password: VALID_INPUT.password });
      expect(Object.keys(createInstructor.mock.calls[0]?.[0] ?? {})).toEqual(['nombre', 'password']);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.users()).toEqual([...REAL_USERS, newUser]);
      expect(fixture.componentInstance.registrationSuccess()).toBe(INSTRUCTOR_CREATED_SUCCESS);
      expect(fixture.componentInstance.registrationError()).toBeNull();
      expect(pageText()).toContain(INSTRUCTOR_CREATED_SUCCESS);
      expect(fixture.componentInstance.instructorUsername()).toBe('');
      expect(fixture.componentInstance.instructorPassword()).toBe('');
      expect(fixture.componentInstance.instructorConfirmation().length).toBe(0);
      expect(queryAll('.admin-user')).toHaveLength(4);
      expect(demoCreate).not.toHaveBeenCalled();
      expect(demoDeactivate).not.toHaveBeenCalled();
      expect(demoAuth.instructorAccounts()).toEqual(accountsBefore);
      expect(session.profileId()).toBe('administrador');
      expect(session.authenticatedAccount()).toBe(authenticatedBefore);
    });

    it('mantiene el éxito del alta y muestra por separado el fallo de la recarga', async () => {
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        if (calls === 2) {
          throw new InstructorRepositoryError('NETWORK');
        }
        return REAL_USERS;
      });
      await settle();

      fillValidInstructorForm();
      await fixture.componentInstance.registerInstructor();
      await settle();

      expect(createInstructor).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.registrationSuccess()).toBe(INSTRUCTOR_CREATED_SUCCESS);
      expect(fixture.componentInstance.registrationError()).toBeNull();
      expect(fixture.componentInstance.usersError()).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
      expect(pageText()).toContain(INSTRUCTOR_CREATED_SUCCESS);
      expect(pageText()).toContain(INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
      expect(query('.admin-users__retry')).not.toBeNull();
    });

    it.each([
      {
        caseName: 'nombre vacío',
        nombre: '',
        password: VALID_INPUT.password,
        confirmation: VALID_INPUT.password,
        error: 'El nombre de usuario es obligatorio.',
      },
      {
        caseName: 'nombre con espacios',
        nombre: ' instructor_real',
        password: VALID_INPUT.password,
        confirmation: VALID_INPUT.password,
        error: 'El nombre de usuario no puede empezar ni terminar con espacios.',
      },
      {
        caseName: 'nombre demasiado corto',
        nombre: 'ab',
        password: VALID_INPUT.password,
        confirmation: VALID_INPUT.password,
        error:
          'El nombre de usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.',
      },
      {
        caseName: 'nombre con caracteres no permitidos',
        nombre: 'ins@real',
        password: VALID_INPUT.password,
        confirmation: VALID_INPUT.password,
        error:
          'El nombre de usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.',
      },
      {
        caseName: 'contraseña vacía',
        nombre: VALID_INPUT.nombre,
        password: '',
        confirmation: '',
        error: 'La contraseña es obligatoria.',
      },
      {
        caseName: 'contraseña demasiado corta',
        nombre: VALID_INPUT.nombre,
        password: 'corta',
        confirmation: 'corta',
        error: 'La contraseña debe tener al menos 8 caracteres.',
      },
      {
        caseName: 'confirmación vacía',
        nombre: VALID_INPUT.nombre,
        password: VALID_INPUT.password,
        confirmation: '',
        error: 'Debes confirmar la contraseña.',
      },
    ])('rechaza datos inválidos antes de invocar la función: $caseName', async (input) => {
      await setUp();
      await settle();
      fillInstructorForm(input.nombre, input.password, input.confirmation);

      await fixture.componentInstance.registerInstructor();
      fixture.detectChanges();

      expect(createInstructor).not.toHaveBeenCalled();
      expect(fixture.componentInstance.registrationError()).toBe(input.error);
      expect(fixture.componentInstance.registrationSuccess()).toBeNull();
      expect(pageText()).toContain(input.error);
      expect(session.profileId()).toBe('administrador');
    });

    it('rechaza contraseñas diferentes antes de invocar la función', async () => {
      await setUp();
      await settle();
      fillInstructorForm(VALID_INPUT.nombre, VALID_INPUT.password, 'otra-clave-simulada-123');

      await fixture.componentInstance.registerInstructor();

      expect(createInstructor).not.toHaveBeenCalled();
      expect(fixture.componentInstance.registrationError()).toBe('Las contraseñas no coinciden.');
      expect(fixture.componentInstance.registrationSuccess()).toBeNull();
      expect(fixture.componentInstance.instructorPassword()).toBe(VALID_INPUT.password);
      expect(fixture.componentInstance.instructorConfirmation()).toBe('otra-clave-simulada-123');
    });

    it('muestra un mensaje seguro y conserva los campos ante un nombre duplicado', async () => {
      await setUp();
      await settle();
      await expectCreationFailure('CONFLICT', INSTRUCTOR_REPOSITORY_MESSAGES.CONFLICT);

      expect(pageText()).not.toContain('Functions');
      expect(pageText()).not.toContain(VALID_INPUT.password);
    });

    it('muestra un mensaje seguro cuando la función no está disponible', async () => {
      await setUp();
      await settle();
      await expectCreationFailure('FUNCTION_UNAVAILABLE', INSTRUCTOR_REPOSITORY_MESSAGES.FUNCTION_UNAVAILABLE);
    });

    it('muestra un mensaje seguro ante un error de red', async () => {
      await setUp();
      await settle();
      await expectCreationFailure('NETWORK', INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
    });

    it('muestra un mensaje seguro ante un error interno del servidor', async () => {
      await setUp();
      await settle();
      await expectCreationFailure('SERVER', INSTRUCTOR_REPOSITORY_MESSAGES.SERVER);
    });

    it('evita dobles envíos mientras la creación está en curso', async () => {
      let resolveCreation: (account: InstructorAccount) => void = () => undefined;
      await setUp();
      await settle();
      createInstructor.mockReturnValueOnce(
        new Promise<InstructorAccount>((resolve) => {
          resolveCreation = resolve;
        }),
      );

      fillValidInstructorForm();
      const firstSubmission = fixture.componentInstance.registerInstructor();
      const secondSubmission = fixture.componentInstance.registerInstructor();

      expect(createInstructor).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.registeringInstructor()).toBe(true);

      const submitButton = query('.instructor-form__submit') as HTMLButtonElement;
      fixture.detectChanges();
      expect(submitButton.disabled).toBe(true);
      expect(pageText()).toContain('Creando instructor…');
      expect(query('.instructor-form')?.getAttribute('aria-busy')).toBe('true');

      resolveCreation(CREATED_ACCOUNT);
      await Promise.all([firstSubmission, secondSubmission]);
      await settle();

      expect(createInstructor).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.registeringInstructor()).toBe(false);
      expect(fixture.componentInstance.registrationSuccess()).toBe(INSTRUCTOR_CREATED_SUCCESS);
      expect(fixture.componentInstance.instructorUsername()).toBe('');
      expect(fixture.componentInstance.instructorPassword()).toBe('');
      expect(fixture.componentInstance.instructorConfirmation()).toBe('');
      expect(submitButton.disabled).toBe(false);
    });
  });

  describe('cambio de estado de instructores', () => {
    it('ofrece Desactivar y Reactivar solo para Instructores', async () => {
      await setUp();
      await settle();

      const adminCard = query('.admin-user[data-role="administrador"]');
      const instructorCards = queryAll('.admin-user[data-role="instructor"]');

      expect(adminCard?.querySelector('.instructor-item__deactivate')).toBeNull();
      expect(adminCard?.querySelector('.instructor-item__reactivate')).toBeNull();
      expect(adminCard?.querySelector('.instructor-item__retry')).toBeNull();
      expect(instructorCards).toHaveLength(2);
      expect(instructorCards[0]?.querySelector('.instructor-item__deactivate')).not.toBeNull();
      expect(instructorCards[0]?.querySelector('.instructor-item__reactivate')).toBeNull();
      expect(instructorCards[1]?.querySelector('.instructor-item__reactivate')).not.toBeNull();
      expect(instructorCards[1]?.querySelector('.instructor-item__deactivate')).toBeNull();
      expect(pageText()).not.toContain('aún no están disponibles');
    });

    it('pide confirmación explícita y desactiva tras la respuesta real del servidor', async () => {
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        return calls === 1 ? REAL_USERS : DEACTIVATED_USERS;
      });
      await settle();
      const page = fixture.componentInstance;
      page.setRoleFilter('instructor');
      fixture.detectChanges();

      await page.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await settle();

      const options = alertCreate.mock.calls[0]?.[0] as {
        header?: string;
        message?: string;
        buttons?: readonly AlertButtonLike[];
      };
      expect(options.header).toBe('Desactivar instructor');
      expect(options.message).toContain(ACTIVE_INSTRUCTOR.nombre);
      expect(options.buttons?.map((button) => button.text)).toEqual(['Cancelar', 'Desactivar']);
      expect(options.buttons?.map((button) => button.role)).toEqual(['cancel', 'confirm']);
      expect(setActive).toHaveBeenCalledTimes(1);
      expect(setActive).toHaveBeenCalledWith(ACTIVE_INSTRUCTOR.id, false);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(page.users()).toEqual(DEACTIVATED_USERS);
      expect(page.activeUsers()).toBe(1);
      expect(page.inactiveUsers()).toBe(2);
      expect(page.roleFilter()).toBe('instructor');
      expect(page.statusUpdateSuccess()).toBe(INSTRUCTOR_DEACTIVATED_SUCCESS);
      expect(page.statusUpdateError()).toBeNull();
      expect(pageText()).toContain(INSTRUCTOR_DEACTIVATED_SUCCESS);
      expect(
        queryAll('.admin-user[data-role="instructor"]')[0]?.querySelector('.admin-user__status')?.textContent,
      ).toContain('Inactivo');
    });

    it('reactiva un Instructor inactivo y recarga el listado real', async () => {
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        return calls === 1 ? REAL_USERS : REACTIVATED_USERS;
      });
      await settle();
      setActive.mockResolvedValueOnce({ id: INACTIVE_INSTRUCTOR.id, nombre: INACTIVE_INSTRUCTOR.nombre, activo: true });

      await fixture.componentInstance.confirmStatusChange(INACTIVE_INSTRUCTOR, true);
      await settle();

      const options = alertCreate.mock.calls[0]?.[0] as { header?: string; buttons?: readonly AlertButtonLike[] };
      expect(options.header).toBe('Reactivar instructor');
      expect(options.buttons?.map((button) => button.text)).toEqual(['Cancelar', 'Reactivar']);
      expect(setActive).toHaveBeenCalledWith(INACTIVE_INSTRUCTOR.id, true);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.users()).toEqual(REACTIVATED_USERS);
      expect(fixture.componentInstance.statusUpdateSuccess()).toBe(INSTRUCTOR_REACTIVATED_SUCCESS);
      expect(pageText()).toContain(INSTRUCTOR_REACTIVATED_SUCCESS);
    });

    it('no envía nada al servidor si se cancela la confirmación', async () => {
      await setUp();
      await settle();
      setDismissRole('cancel');

      await fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await settle();

      expect(alertCreate).toHaveBeenCalledTimes(1);
      expect(setActive).not.toHaveBeenCalled();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
      expect(fixture.componentInstance.statusUpdateSuccess()).toBeNull();
      expect(fixture.componentInstance.statusUpdateError()).toBeNull();
      expect(fixture.componentInstance.updatingUserId()).toBeNull();
      expect(
        queryAll('.admin-user[data-role="instructor"]')[0]?.querySelector('.admin-user__status')?.textContent,
      ).toContain('Activo');
    });

    it('no permite modificar Administradores ni desde el botón ni por llamada directa', async () => {
      await setUp();
      await settle();

      await fixture.componentInstance.confirmStatusChange(ADMIN_USER, false);
      await settle();

      expect(alertCreate).not.toHaveBeenCalled();
      expect(setActive).not.toHaveBeenCalled();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
      expect(query('.admin-user[data-role="administrador"] .admin-user__actions')).toBeNull();
    });

    it('mantiene el estado visual y bloquea duplicados hasta que Supabase confirma', async () => {
      let resolveStatus: (account: InstructorAccount) => void = () => undefined;
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        return calls === 1 ? REAL_USERS : DEACTIVATED_USERS;
      });
      await settle();
      setActive.mockReturnValueOnce(
        new Promise<InstructorAccount>((resolve) => {
          resolveStatus = resolve;
        }),
      );

      const first = fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      const second = fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(alertCreate).toHaveBeenCalledTimes(1);
      expect(setActive).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.updatingUserId()).toBe(ACTIVE_INSTRUCTOR.id);
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
      expect(pageText()).toContain('Actualizando estado del instructor…');
      expect(pageText()).toContain('Desactivando…');
      const deactivate = queryAll('.admin-user[data-role="instructor"]')[0]?.querySelector(
        '.instructor-item__deactivate',
      ) as HTMLButtonElement | null;
      expect(deactivate?.disabled).toBe(true);

      resolveStatus(STATUS_UPDATED_ACCOUNT);
      await Promise.all([first, second]);
      await settle();

      expect(setActive).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.users()).toEqual(DEACTIVATED_USERS);
      expect(fixture.componentInstance.updatingUserId()).toBeNull();
    });

    it.each([
      { code: 'INVALID_RESPONSE' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.INVALID_RESPONSE },
      { code: 'INVALID_STATUS_REQUEST' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.INVALID_STATUS_REQUEST },
      { code: 'UNAUTHENTICATED' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.UNAUTHENTICATED },
      { code: 'OPERATION_NOT_ALLOWED' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.OPERATION_NOT_ALLOWED },
      { code: 'TARGET_NOT_FOUND' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.TARGET_NOT_FOUND },
      { code: 'ALREADY_INACTIVE' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.ALREADY_INACTIVE },
      { code: 'STATUS_UPDATE_FAILED' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.STATUS_UPDATE_FAILED },
      { code: 'NETWORK' as const, message: INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK },
    ])('muestra un error seguro y permite reintentar ante $code', async ({ code, message }) => {
      await setUp();
      await settle();
      setActive.mockRejectedValueOnce(new InstructorRepositoryError(code));

      await fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await settle();

      expect(setActive).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.users()).toEqual(REAL_USERS);
      expect(fixture.componentInstance.statusUpdateError()).toBe(message);
      expect(fixture.componentInstance.failedStatusUserId()).toBe(ACTIVE_INSTRUCTOR.id);
      expect(pageText()).toContain(message);
      expect(query('.instructor-item__retry')).not.toBeNull();
      expect(pageText()).not.toContain('FunctionsHttpError');
    });

    it('vuelve a pedir confirmación en el reintento y aplica el cambio si éste tiene éxito', async () => {
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        return calls === 1 ? REAL_USERS : DEACTIVATED_USERS;
      });
      await settle();
      setActive
        .mockRejectedValueOnce(new InstructorRepositoryError('NETWORK'))
        .mockResolvedValueOnce(STATUS_UPDATED_ACCOUNT);

      await fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await settle();

      expect(fixture.componentInstance.statusUpdateError()).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
      (query('.instructor-item__retry') as HTMLButtonElement).click();
      await settle();

      expect(alertCreate).toHaveBeenCalledTimes(2);
      expect(setActive).toHaveBeenCalledTimes(2);
      expect(setActive).toHaveBeenLastCalledWith(ACTIVE_INSTRUCTOR.id, false);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.statusUpdateError()).toBeNull();
      expect(fixture.componentInstance.statusUpdateSuccess()).toBe(INSTRUCTOR_DEACTIVATED_SUCCESS);
      expect(query('.instructor-item__retry')).toBeNull();
    });

    it('conserva el éxito del cambio aunque falle la recarga posterior', async () => {
      let calls = 0;
      await setUp(async () => {
        calls += 1;
        if (calls === 2) {
          throw new InstructorRepositoryError('NETWORK');
        }
        return REAL_USERS;
      });
      await settle();

      await fixture.componentInstance.confirmStatusChange(ACTIVE_INSTRUCTOR, false);
      await settle();

      expect(setActive).toHaveBeenCalledTimes(1);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.statusUpdateSuccess()).toBe(INSTRUCTOR_DEACTIVATED_SUCCESS);
      expect(fixture.componentInstance.statusUpdateError()).toBeNull();
      expect(fixture.componentInstance.usersError()).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
      expect(pageText()).toContain(INSTRUCTOR_DEACTIVATED_SUCCESS);
      expect(pageText()).toContain(INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK);
      expect(query('.admin-users__retry')).not.toBeNull();
    });
  });

  describe('restricciones de acceso y alcance', () => {
    it('retira el acceso de forma inmediata al cambiar a aprendiz', async () => {
      await setUp();
      await settle();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      session.selectProfile('aprendiz');
      TestBed.flushEffects();
      fixture.detectChanges();
      await settle();

      expect(fixture.componentInstance.canAccess()).toBe(false);
      expect(pageText()).toContain('Acceso restringido');
      expect(pageText()).not.toContain('USR-DMO');
      expect(pageText()).not.toContain('Usuarios registrados');
      expect(fixture.componentInstance.users()).toEqual([]);
      expect(query('.admin-users')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/tabs/mas'], {
        queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
        replaceUrl: true,
      });
    });

    it('impide registrar instructores sin el permiso de administrador', async () => {
      await setUp();
      await settle();
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(publishVerifiedRole(session, 'instructor', verified)).toBe(true);
      TestBed.flushEffects();
      fixture.detectChanges();

      const demoCreate = vi.spyOn(TestBed.inject(DemoAuthService), 'registerInstructor');
      fillValidInstructorForm();
      await fixture.componentInstance.registerInstructor();
      fixture.detectChanges();

      expect(createInstructor).not.toHaveBeenCalled();
      expect(demoCreate).not.toHaveBeenCalled();
      expect(fixture.componentInstance.registrationError()).toBe(INSTRUCTOR_MANAGE_PERMISSION_ERROR);
      expect(fixture.componentInstance.registrationSuccess()).toBeNull();
      expectFieldsPreserved();
      expect(query('.instructor-management')).toBeNull();
    });

    it('no usa el simulador para el cambio de estado ni presenta el listado como demo', async () => {
      await setUp();
      await settle();
      const page = fixture.componentInstance;
      const demoAuth = TestBed.inject(DemoAuthService);
      const demoDeactivate = vi.spyOn(demoAuth, 'deactivateInstructor');
      const accountsBefore = demoAuth.instructorAccounts();

      expect(pageText()).not.toContain('aún no están disponibles');
      expect(pageText()).not.toContain('no están disponibles en el servidor');
      expect(pageText()).not.toContain('no aparecen en un listado local');
      expect(pageText()).not.toContain('Modo demostración');
      expect(query('.instructor-list')).toBeNull();
      expect('deactivateInstructor' in page).toBe(false);
      expect('setActive' in page).toBe(false);
      expect('confirmStatusChange' in page).toBe(true);
      expect(demoDeactivate).not.toHaveBeenCalled();
      expect(demoAuth.instructorAccounts()).toEqual(accountsBefore);
    });

    it('no altera el simulador al consultar ni al perder el permiso', async () => {
      await setUp();
      await settle();
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const monitoring = TestBed.inject(MonitoringStateService);
      const alerts = TestBed.inject(AlertsStateService);
      const history = TestBed.inject(SimulationHistoryService);
      const sensors = TestBed.inject(SimulatedSensorsService);
      const assistant = TestBed.inject(DemoAssistantService);

      const initial = JSON.stringify({
        zones: monitoring.snapshots(),
        alerts: alerts.alerts(),
        history: history.events(),
        sensors: sensors.sensors(),
        assistant: assistant.messages(),
      });

      fixture.componentInstance.setRoleFilter('instructor');
      session.selectProfile('aprendiz');
      TestBed.flushEffects();
      fixture.detectChanges();

      const final = JSON.stringify({
        zones: monitoring.snapshots(),
        alerts: alerts.alerts(),
        history: history.events(),
        sensors: sensors.sensors(),
        assistant: assistant.messages(),
      });

      expect(initial).toBe(final);
      expect(monitoring.totalPeople()).toBe(107);
      expect(monitoring.monitoredZones()).toBe(4);
      expect(monitoring.hasOccupancyChanges()).toBe(false);
      expect(alerts.totalAlerts()).toBe(3);
      expect(alerts.activeAlerts()).toBe(1);
      expect(history.isEmpty()).toBe(true);
      expect(sensors.totalDevices()).toBe(6);
      expect(assistant.messages()).toHaveLength(1);
    });
  });
});
