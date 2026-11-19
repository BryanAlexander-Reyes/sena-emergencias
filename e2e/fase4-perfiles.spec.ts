import { expect, test, type Page } from '@playwright/test';

const ADMIN_LABEL = /Administrador de demostraci\u00f3n/;
const INSTRUCTOR_LABEL = /Instructor de demostraci\u00f3n/;
const ADMIN_LINK = 'app-nav-card a[href="/tabs/mas/administracion"]';

// Credenciales ficticias de la Fase 5.1; solo se usan en el formulario de la demo.
const ADMIN_CREDENTIALS = { username: 'admin_demo', password: 'Admin1234!' };
const INSTRUCTOR_CREDENTIALS = { username: 'instructor_demo', password: 'Instructor1234!' };

interface DemoCredentials {
  readonly username: string;
  readonly password: string;
}

async function openMas(page: Page): Promise<void> {
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page).toHaveURL(/\/tabs\/mas$/);
  await expect(page.locator('app-mas h1')).toContainText('Más opciones');
}

async function openAcceso(page: Page): Promise<void> {
  await openMas(page);
  await page.getByRole('link', { name: /Cambiar perfil/ }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('button.acceso-option')).toHaveCount(3);
}

async function selectProfile(page: Page, label: RegExp, credentials?: DemoCredentials): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await expect(page.locator('.acceso-confirmation')).toBeVisible();
  await page.locator('.acceso-continue').click();

  if (credentials) {
    await expect(page.locator('.acceso-login')).toBeVisible();
    await page.getByLabel('Nombre de usuario').fill(credentials.username);
    await page.getByLabel('Contraseña').fill(credentials.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('app-inicio h1')).toBeVisible();
}

async function openAdmin(page: Page): Promise<void> {
  await openMas(page);
  await page.locator(ADMIN_LINK).click();
  await expect(page).toHaveURL(/\/tabs\/mas\/administracion$/);
  await expect(page.locator('app-admin h1')).toHaveText('Administración');
}

async function leaveAdmin(page: Page): Promise<void> {
  await page.locator('app-secondary-page .secondary-page__back').click();
  await expect(page).toHaveURL(/\/tabs\/mas$/);
  await expect(page.locator('app-mas h1')).toBeVisible();
}

test('inicia como aprendiz sin opciones administrativas', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('ion-tab-button.tab-selected')).toHaveAttribute('tab', 'inicio');

  await openMas(page);

  await expect(page.locator('.mas-profile__value')).toHaveText('Aprendiz de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(5);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});

test('navega a Acceso y selecciona el perfil administrador', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);

  await page.getByRole('button', { name: ADMIN_LABEL }).click();
  await expect(page.locator('.acceso-confirmation')).toContainText('Administrador de demostración');
  await expect(page.getByRole('button', { name: ADMIN_LABEL })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.acceso-continue').click();
  await expect(page.locator('.acceso-login')).toBeVisible();
  await page.getByLabel('Nombre de usuario').fill(ADMIN_CREDENTIALS.username);
  await page.getByLabel('Contraseña').fill(ADMIN_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await openMas(page);
  await expect(page.locator('.mas-profile__value')).toHaveText('Administrador de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(6);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(1);
});

test('muestra usuarios ficticios en el panel de administración', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);
  await selectProfile(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await openAdmin(page);

  await expect(page.locator('.admin-summary__value')).toHaveText(['3', '3', '3', '0']);
  await expect(page.locator('.admin-user')).toHaveCount(3);
  await expect(page.locator('.admin-user__id')).toContainText([/USR-DMO-001/, /USR-DMO-002/, /USR-DMO-003/]);
});

test('cambia de administrador a instructor y retira las opciones administrativas', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);
  await selectProfile(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await openAdmin(page);
  await leaveAdmin(page);
  await openAcceso(page);
  await selectProfile(page, INSTRUCTOR_LABEL, INSTRUCTOR_CREDENTIALS);
  await openMas(page);

  await expect(page.locator('.mas-profile__value')).toHaveText('Instructor de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(5);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});

test('niega la URL directa de administración sin permisos', async ({ page }) => {
  await page.goto('/tabs/mas/administracion');

  await expect(page).toHaveURL(/\/tabs\/mas\?acceso=denegado$/);
  await expect(page.locator('.mas-denied')).toContainText('Acceso no disponible');
  await expect(page.locator('.admin-users')).toHaveCount(0);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});

test('no recupera administración con Atrás después de perder el permiso', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);
  await selectProfile(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await openAdmin(page);
  await leaveAdmin(page);
  await openAcceso(page);
  await selectProfile(page, INSTRUCTOR_LABEL, INSTRUCTOR_CREDENTIALS);
  await openMas(page);

  for (let step = 0; step < 4; step += 1) {
    await page.goBack();
    await expect(page.locator('.admin-users')).toHaveCount(0);
  }

  await expect(page).toHaveURL(/\/tabs\/mas\?acceso=denegado$/);
  await expect(page.locator('.mas-denied')).toBeVisible();
});

test('vuelve al perfil aprendiz después de recargar', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);
  await selectProfile(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await openMas(page);

  await expect(page.locator('.mas-profile__value')).toHaveText('Administrador de demostración');
  await expect(page.locator(ADMIN_LINK)).toHaveCount(1);

  await page.reload();

  await expect(page.locator('.mas-profile__value')).toHaveText('Aprendiz de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(5);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});

test('bloquea los controles de escritura para un perfil de consulta', async ({ page }) => {
  await page.goto('/');
  await openAcceso(page);
  await selectProfile(page, INSTRUCTOR_LABEL, INSTRUCTOR_CREDENTIALS);
  await openMas(page);

  await page.locator('app-nav-card a[href="/tabs/mas/sensores"]').click();
  await expect(page.locator('app-sensores h1')).toHaveText('Sensores IoT');
  await expect(page.locator('.sensor-permission-note')).toBeVisible();
  await expect(page.getByRole('button', { name: /Restablecer todos/ })).toHaveCount(0);
  await page.locator('.sensor-card__toggle').first().click();
  await expect(page.locator('.sensor-card__controls ion-select').first()).toHaveJSProperty('disabled', true);

  await page.locator('ion-tab-button[tab="alertas"]').click();
  await expect(page.locator('app-alertas h1')).toHaveText('Centro de alertas');
  await expect(page.locator('.alert-permission-note')).toBeVisible();
  await page.locator('.alert-card__toggle').first().click();
  await expect(page.locator('.alert-card__review-locked')).toBeVisible();
  await expect(page.getByRole('button', { name: /Marcar como revisada/ })).toHaveCount(0);

  await page.locator('ion-tab-button[tab="zonas"]').click();
  await expect(page.locator('app-zonas h1')).toHaveText('Monitoreo de zonas');
  await expect(page.getByRole('button', { name: /Aumentar una persona/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Disminuir una persona/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Restablecer la ocupación/ })).toHaveCount(0);
  await expect(page.locator('.zone-card__read-only')).toHaveCount(4);
  await expect(page.locator('.zonas-summary__value').first()).toHaveText('107');
});
