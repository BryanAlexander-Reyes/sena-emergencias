import { expect, test, type Page } from '@playwright/test';

const ADMIN_LABEL = /Administrador de demostraci\u00f3n/;
const INSTRUCTOR_LABEL = /Instructor de demostraci\u00f3n/;
const LEARNER_LABEL = /Aprendiz de demostraci\u00f3n/;
const VISITOR_LABEL = /Visitante/;
const ADMIN_LINK = 'app-nav-card a[href="/tabs/mas/administracion"]';
const ALARM_BUTTON = '.alarm-control__button';
const LOGIN_ERROR = 'Credenciales incorrectas. Verifica el perfil seleccionado.';

const CREDENTIALS = {
  administrador: { username: 'admin_demo', password: 'Admin1234!' },
  instructor: { username: 'instructor_demo', password: 'Instructor1234!' },
} as const;

type CredentialProfile = keyof typeof CREDENTIALS;

async function openAcceso(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page).toHaveURL(/\/tabs\/mas$/);
  await page.getByRole('link', { name: /Cambiar perfil/ }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('button.acceso-option')).toHaveCount(4);
}

async function chooseProfile(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await expect(page.locator('.acceso-confirmation')).toBeVisible();
}

async function showLogin(page: Page): Promise<void> {
  await page.locator('.acceso-continue').click();
  await expect(page.locator('.acceso-login')).toBeVisible();
  await expect(page).toHaveURL(/\/acceso$/);
}

async function fillAndSubmit(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Nombre de usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function loginAs(page: Page, profile: CredentialProfile): Promise<void> {
  await showLogin(page);
  await fillAndSubmit(page, CREDENTIALS[profile].username, CREDENTIALS[profile].password);
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('app-inicio h1')).toBeVisible();
}

test('navega desde Más hasta el formulario sin salir de /acceso', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);

  await expect(page.getByRole('button', { name: ADMIN_LABEL })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.acceso-confirmation')).toContainText('Administrador de demostración');
  await expect(page.locator('.acceso-current')).toContainText('Visitante');
  await expect(page.locator('.acceso-login')).toHaveCount(0);

  await showLogin(page);

  await expect(page.locator('#acceso-login-title')).toHaveText('Administrador de demostración');
  await expect(page.locator('.acceso-login')).toContainText('Modo demostración');
  await expect(page.locator('.acceso-login')).toContainText('Iniciar sesión');
  await expect(page.locator('.acceso-login')).toContainText('Volver');
  await expect(page.getByLabel('Nombre de usuario')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('.acceso-options')).toHaveCount(0);
});

test('inicia sesión correctamente como Administrador', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await loginAs(page, 'administrador');

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Administrador de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(6);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(1);

  await page.locator('ion-tab-button[tab="inicio"]').click();
  await expect(page.locator(ALARM_BUTTON)).toBeVisible();
});

test('inicia sesión correctamente como Instructor', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await loginAs(page, 'instructor');

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Instructor de demostración');
  await expect(page.locator('app-nav-card')).toHaveCount(5);
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);

  await page.locator('ion-tab-button[tab="inicio"]').click();
  await expect(page.locator(ALARM_BUTTON)).toBeVisible();
});

test('rechaza contraseña incorrecta y permanece en el formulario', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await showLogin(page);
  await fillAndSubmit(page, CREDENTIALS.administrador.username, 'Admin1234');

  await expect(page.locator('.acceso-login__error')).toHaveText(LOGIN_ERROR);
  await expect(page.locator('.acceso-login')).toBeVisible();
  await expect(page).toHaveURL(/\/acceso$/);

  await page.locator('.acceso-back').click();
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
});

test('rechaza usuario inexistente y credenciales del otro perfil', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await showLogin(page);
  await fillAndSubmit(page, 'usuario_inexistente', CREDENTIALS.administrador.password);

  await expect(page.locator('.acceso-login__error')).toHaveText(LOGIN_ERROR);
  await expect(page).toHaveURL(/\/acceso$/);

  await fillAndSubmit(page, CREDENTIALS.instructor.username, CREDENTIALS.instructor.password);

  await expect(page.locator('.acceso-login__error')).toHaveText(LOGIN_ERROR);
  await expect(page).toHaveURL(/\/acceso$/);
});

test('seleccionar un perfil privilegiado no concede permisos antes del login', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await showLogin(page);

  await page.locator('.acceso-back').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
  await expect(page.locator('.alarm-control__note')).toBeVisible();

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Visitante');
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});

test('Volver desde el formulario revoca la selección sin autenticar', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await showLogin(page);

  await page.getByRole('button', { name: 'Volver', exact: true }).click();

  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('.acceso-login')).toHaveCount(0);
  await expect(page.locator('button.acceso-option')).toHaveCount(4);
  await expect(page.locator('.acceso-confirmation')).toHaveCount(0);
  await expect(page.locator('.acceso-current')).toContainText('Visitante');

  await page.locator('.acceso-back').click();
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
});

test('Aprendiz y Visitante acceden directamente sin formulario', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, LEARNER_LABEL);
  await page.locator('.acceso-continue').click();

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('.acceso-login')).toHaveCount(0);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);

  await openAcceso(page);
  await chooseProfile(page, VISITOR_LABEL);
  await page.locator('.acceso-continue').click();

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('.acceso-login')).toHaveCount(0);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
});

test('el botón de alarma solo está disponible tras autenticar un perfil autorizado', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);

  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await loginAs(page, 'administrador');
  await expect(page.locator(ALARM_BUTTON)).toBeVisible();

  await openAcceso(page);
  await chooseProfile(page, LEARNER_LABEL);
  await page.locator('.acceso-continue').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);
});

test('no se muestran ni se guardan las contraseñas de demostración', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, INSTRUCTOR_LABEL);
  await showLogin(page);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(CREDENTIALS.administrador.password);
  expect(bodyText).not.toContain(CREDENTIALS.instructor.password);
  expect(bodyText).not.toContain(CREDENTIALS.administrador.username);
  expect(bodyText).not.toContain(CREDENTIALS.instructor.username);

  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storage).not.toContain(CREDENTIALS.administrador.password);
  expect(storage).not.toContain(CREDENTIALS.instructor.password);

  await fillAndSubmit(page, CREDENTIALS.instructor.username, CREDENTIALS.instructor.password);
  await expect(page.locator(ALARM_BUTTON)).toBeVisible();

  const storageAfterLogin = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storageAfterLogin).not.toContain(CREDENTIALS.instructor.password);
});

test('conserva las rutas y el guard de administración existentes', async ({ page }) => {
  await page.goto('/');

  for (const [tab, title] of [
    ['inicio', 'SENA CROWD'],
    ['zonas', 'Monitoreo de zonas'],
    ['mapa', 'Mapa de monitoreo'],
    ['alertas', 'Centro de alertas'],
    ['mas', 'Más opciones'],
  ]) {
    await page.locator(`ion-tab-button[tab="${tab}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/tabs/${tab}$`));
    await expect(page.locator(`app-${tab} h1`)).toContainText(title);
  }

  await page.goto('/tabs/mas/administracion');
  await expect(page).toHaveURL(/\/tabs\/mas\?acceso=denegado$/);
  await expect(page.locator('.mas-denied')).toContainText('Acceso no disponible');

  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await loginAs(page, 'administrador');
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator(ADMIN_LINK)).toHaveCount(1);
  await page.locator(ADMIN_LINK).click();
  await expect(page).toHaveURL(/\/tabs\/mas\/administracion$/);
  await expect(page.locator('app-admin h1')).toHaveText('Administración');
});

test('la sesión vuelve a Visitante al recargar después del login', async ({ page }) => {
  await openAcceso(page);
  await chooseProfile(page, ADMIN_LABEL);
  await loginAs(page, 'administrador');

  await page.reload();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator(ALARM_BUTTON)).toHaveCount(0);

  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page.locator('.mas-profile__value')).toHaveText('Visitante');
  await expect(page.locator(ADMIN_LINK)).toHaveCount(0);
});
