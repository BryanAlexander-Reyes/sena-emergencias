import { expect, test, type Locator, type Page } from '@playwright/test';

const ADMIN_LABEL = /Administrador de demostraci\u00f3n/;
const INSTRUCTOR_LABEL = /Instructor de demostraci\u00f3n/;
const LEARNER_LABEL = /Aprendiz de demostraci\u00f3n/;

const ADMIN_LINK = 'app-nav-card a[href="/tabs/mas/administracion"]';
const ALARM_BUTTON = '.alarm-control__button';
const ADMIN_CREDENTIALS = { username: 'admin_demo', password: 'Admin1234!' } as const;
const NEW_PASSWORD = 'InstructorE2E1234!';

const MESSAGES = {
  success: 'Instructor registrado correctamente.',
  duplicate: 'Ya existe una cuenta con ese nombre de usuario.',
  mismatch: 'Las contraseñas no coinciden.',
  inactive: 'Esta cuenta de Instructor está inactiva. No puede iniciar sesión.',
} as const;

async function goToAcceso(page: Page): Promise<void> {
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page).toHaveURL(/\/tabs\/mas$/);
  await page.getByRole('link', { name: /Cambiar perfil/ }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('button.acceso-option')).toHaveCount(3);
}

async function chooseProfile(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await expect(page.locator('.acceso-confirmation')).toBeVisible();
}

async function showLogin(page: Page): Promise<void> {
  await page.locator('.acceso-continue').click();
  await expect(page.locator('.acceso-login')).toBeVisible();
}

async function loginWith(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('app-inicio h1')).toBeVisible();
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await goToAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await showLogin(page);
  await loginWith(page, ADMIN_CREDENTIALS.username, ADMIN_CREDENTIALS.password);
}

async function openAdmin(page: Page): Promise<void> {
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator(ADMIN_LINK)).toHaveCount(1);
  await page.locator(ADMIN_LINK).click();
  await expect(page).toHaveURL(/\/tabs\/mas\/administracion$/);
  await expect(page.locator('app-admin h1')).toHaveText('Administración');
}

async function startAsAdminInManagement(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await openAdmin(page);
  await expect(page.locator('.instructor-management')).toBeVisible();
}

async function registerInstructor(
  page: Page,
  username: string,
  password = NEW_PASSWORD,
  confirmation = password,
): Promise<void> {
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(confirmation);
  await page.getByRole('button', { name: 'Registrar instructor' }).click();
}

function instructorItem(page: Page, username: string): Locator {
  return page.locator('.instructor-item').filter({
    has: page.locator('.instructor-item__username', { hasText: username }),
  });
}

async function openDeactivationDialog(page: Page, username: string): Promise<Locator> {
  await instructorItem(page, username).getByRole('button', { name: 'Desactivar' }).click();
  const dialog = page.locator('ion-alert');

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Desactivar instructor');
  await expect(dialog).toContainText(
    '¿Deseas desactivar esta cuenta de Instructor? No podrá iniciar sesión mientras permanezca inactiva.',
  );
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Desactivar', exact: true })).toBeVisible();

  return dialog;
}

async function loginAsInstructor(page: Page, username: string): Promise<void> {
  await goToAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await showLogin(page);
  await loginWith(page, username, NEW_PASSWORD);
}

async function confirmAlarm(page: Page, action: 'turn-on' | 'turn-off'): Promise<void> {
  const label = action === 'turn-on' ? 'Encender alarma' : 'Apagar alarma';
  const dialog = page.locator('ion-alert');

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(label);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('1. el Administrador autenticado accede a Gestión de instructores', async ({ page }) => {
  await startAsAdminInManagement(page);

  await expect(page.locator('.instructor-management')).toContainText('Gestión de instructores');
  await expect(page.locator('.instructor-management')).toContainText('Instructores registrados');
  await expect(page.locator('.instructor-management')).toContainText('Solo administrador');
  await expect(page.locator('.instructor-item')).toHaveCount(1);
  await expect(instructorItem(page, 'instructor_demo')).toContainText('Instructor');
  await expect(instructorItem(page, 'instructor_demo').locator('.instructor-item__status')).toHaveText('Activo');

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.instructor-management')).toBeVisible();
    await expect(page.locator('.instructor-form')).toBeVisible();
    await expect(page.locator('.instructor-list')).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  }
});

test('2. registrar un Instructor muestra el éxito y actualiza el listado', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_creado');

  await expect(page.locator('.instructor-form__success')).toHaveText(MESSAGES.success);
  await expect(instructorItem(page, 'instructor_creado')).toBeVisible();
  await expect(instructorItem(page, 'instructor_creado')).toContainText('Instructor');
  await expect(instructorItem(page, 'instructor_creado').locator('.instructor-item__status')).toHaveText('Activo');
  await expect(page.locator('.instructor-item')).toHaveCount(2);
  await expect(page.locator('.instructor-form__password input:not(.cloned-input)')).toHaveValue('');
  await expect(page.locator('.instructor-form__confirmation input:not(.cloned-input)')).toHaveValue('');
});

test('3. registrar un usuario duplicado muestra un error', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'Instructor_Demo');

  await expect(page.locator('.instructor-form__error')).toHaveText(MESSAGES.duplicate);
  await expect(page.locator('.instructor-item')).toHaveCount(1);
});

test('4. registrar con contraseñas diferentes muestra un error', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_distinto', NEW_PASSWORD, 'OtraContrasena123!');

  await expect(page.locator('.instructor-form__error')).toHaveText(MESSAGES.mismatch);
  await expect(page.locator('.instructor-item')).toHaveCount(1);
});

test('5. un Instructor creado puede iniciar sesión en el flujo existente', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_login_e2e');
  await expect(page.locator('.instructor-form__success')).toHaveText(MESSAGES.success);

  await loginAsInstructor(page, 'instructor_login_e2e');

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Instructor de demostración');
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
  await expect(page.locator('.instructor-management')).toHaveCount(0);

  await page.locator('ion-tab-button[tab="inicio"]').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toBeVisible();
});

test('6. un Instructor creado puede controlar la alarma simulada', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_buzzer_e2e');
  await loginAsInstructor(page, 'instructor_buzzer_e2e');

  await expect(page.locator(ALARM_BUTTON)).toBeVisible();
  await page.locator(ALARM_BUTTON).click();
  await confirmAlarm(page, 'turn-on');
  await expect(page.locator('.alarm-control__status')).toHaveText('Alarma activada');

  await page.locator(ALARM_BUTTON).click();
  await confirmAlarm(page, 'turn-off');
  await expect(page.locator('.alarm-control__status')).toHaveText('Alarma apagada');
});

test('7. un Instructor no puede acceder a Administración', async ({ page }) => {
  await page.goto('/');
  await goToAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await showLogin(page);
  await loginWith(page, 'instructor_demo', 'Instructor1234!');

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Instructor de demostración');
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);

  await page.evaluate(() => {
    history.pushState({}, '', '/tabs/mas/administracion');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page).toHaveURL(/\/tabs\/mas\?acceso=denegado$/);
  await expect(page.locator('.mas-denied')).toContainText('Acceso no disponible');
});

test('8. desactivar un Instructor requiere confirmación y cancelar conserva el estado', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_desactivar');

  const dialog = await openDeactivationDialog(page, 'instructor_desactivar');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(instructorItem(page, 'instructor_desactivar').locator('.instructor-item__status')).toHaveText('Activo');

  const confirmDialog = await openDeactivationDialog(page, 'instructor_desactivar');
  await confirmDialog.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(instructorItem(page, 'instructor_desactivar').locator('.instructor-item__status')).toHaveText(
    'Inactivo',
  );
  await expect(instructorItem(page, 'instructor_desactivar').getByRole('button', { name: 'Desactivar' })).toHaveCount(
    0,
  );
});

test('9. un Instructor desactivado no puede iniciar sesión', async ({ page }) => {
  await startAsAdminInManagement(page);
  await registerInstructor(page, 'instructor_sin_acceso');

  const dialog = await openDeactivationDialog(page, 'instructor_sin_acceso');
  await dialog.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await goToAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await showLogin(page);
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('instructor_sin_acceso');
  await page.getByLabel('Contraseña', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.locator('.acceso-login__error')).toHaveText(MESSAGES.inactive);
  await expect(page).toHaveURL(/\/acceso$/);

  await page.locator('.acceso-back').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
});

test('10. Aprendiz conserva sus restricciones', async ({ page }) => {
  await page.goto('/');
  await goToAcceso(page);
  await chooseProfile(page, LEARNER_LABEL);
  await page.locator('.acceso-continue').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
  await expect(page.locator('.instructor-management')).toHaveCount(0);
});
