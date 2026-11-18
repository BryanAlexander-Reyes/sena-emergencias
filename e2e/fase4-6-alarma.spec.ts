import { expect, test, type Page } from '@playwright/test';

const ADMIN_LABEL = /Administrador de demostraci\u00f3n/;
const INSTRUCTOR_LABEL = /Instructor de demostraci\u00f3n/;
const LEARNER_LABEL = /Aprendiz de demostraci\u00f3n/;

// Credenciales ficticias de la Fase 5.1; solo se usan en el formulario de la demo.
const ADMIN_CREDENTIALS = { username: 'admin_demo', password: 'Admin1234!' };
const INSTRUCTOR_CREDENTIALS = { username: 'instructor_demo', password: 'Instructor1234!' };

interface DemoCredentials {
  readonly username: string;
  readonly password: string;
}

const CONTROL = '.alarm-control';
const STATUS = '.alarm-control__status';
const BUTTON = '.alarm-control__button';
const NOTICE = '.alarm-control__notice';
const NOTE = '.alarm-control__note';

const MESSAGES = {
  A: 'Sin aglomeración crítica ni alarma activa.',
  B: 'Aglomeración detectada. Mantenga la calma y esté atento a las indicaciones del personal autorizado.',
  C: 'Alarma activada por personal autorizado. Siga las indicaciones del personal responsable.',
  D: 'Aglomeración detectada y alarma activada. Siga las indicaciones del personal autorizado.',
} as const;

async function openAcceso(page: Page): Promise<void> {
  await page.locator('ion-tab-button[tab="mas"]').click();
  await expect(page).toHaveURL(/\/tabs\/mas$/);
  await page.getByRole('link', { name: /Cambiar perfil/ }).click();
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('button.acceso-option')).toHaveCount(4);
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

async function startAs(page: Page, label: RegExp, credentials?: DemoCredentials): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await openAcceso(page);
  await selectProfile(page, label, credentials);
}

async function confirmAlarm(page: Page, action: 'turn-on' | 'turn-off'): Promise<void> {
  const dialog = page.locator('ion-alert');
  const turningOn = action === 'turn-on';
  const label = turningOn ? 'Encender alarma' : 'Apagar alarma';

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(label);
  await expect(dialog).toContainText(
    turningOn ? '¿Deseas activar la alarma de demostración?' : '¿Deseas desactivar la alarma de demostración?',
  );
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function cancelAlarm(page: Page): Promise<void> {
  const dialog = page.locator('ion-alert');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function clearCriticalAgglomeration(page: Page): Promise<void> {
  await page.locator('ion-tab-button[tab="zonas"]').click();
  await expect(page).toHaveURL(/\/tabs\/zonas$/);

  const pasillo = page.locator('app-zone-card').nth(2);
  await expect(pasillo).toContainText('Pasillo principal');
  // 42/50 = 84 %; tres decrementos dejan 39/50 = 78 % (Precaución).
  for (let step = 0; step < 3; step += 1) {
    await pasillo.getByRole('button', { name: 'Disminuir una persona en Pasillo principal' }).click();
  }
  await expect(pasillo).toContainText('39');
  await expect(pasillo).toContainText('78%');

  await page.locator('ion-tab-button[tab="inicio"]').click();
  await expect(page).toHaveURL(/\/tabs\/inicio$/);
}

test('el control aparece en Inicio y solo Alertas muestra el estado en modo lectura', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('ion-tab-button')).toHaveCount(5);
  await expect(page.locator(CONTROL)).toBeVisible();
  await expect(page.locator(CONTROL)).toContainText('Control de alarma');
  await expect(page.locator(CONTROL)).toContainText('Control manual del buzzer');
  await expect(page.locator(CONTROL)).toContainText('Modo demostración');
  await expect(page.locator(CONTROL)).toContainText('Simulado · sin hardware conectado');
  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');

  await page.locator('ion-tab-button[tab="alertas"]').click();
  await expect(page).toHaveURL(/\/tabs\/alertas$/);
  await expect(page.locator('.alert-alarm')).toContainText('Alarma apagada · simulado, sin hardware conectado');
  await expect(page.locator('.alert-alarm button, .alert-alarm ion-button')).toHaveCount(0);
  await expect(page.locator(BUTTON)).toHaveCount(0);

  // Ionic conserva en caché la página Inicio en el DOM; por eso se comprueba
  // que ninguna otra pantalla contenga el control, no que desaparezca del DOM.
  for (const tab of ['zonas', 'mapa', 'mas']) {
    await page.locator(`ion-tab-button[tab="${tab}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/tabs/${tab}$`));
    await expect(page.locator(`app-${tab} .alarm-control`)).toHaveCount(0);
    await expect(page.locator(`app-${tab} .alarm-control__button`)).toHaveCount(0);
  }
});

test('Visitante ve el estado de la alarma pero no puede operarla', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');
  await expect(page.locator(BUTTON)).toHaveCount(0);
  await expect(page.locator(NOTE)).toHaveText('Solo Administradores e Instructores pueden controlar la alarma.');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'B');
});

test('Aprendiz ve el estado pero no puede operar el buzzer', async ({ page }) => {
  await startAs(page, LEARNER_LABEL);

  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');
  await expect(page.locator(BUTTON)).toHaveCount(0);
  await expect(page.locator(NOTE)).toBeVisible();
  await expect(page.locator('.alarm-control__button--on')).toHaveCount(0);
  await expect(page.locator('.alarm-control__button--off')).toHaveCount(0);
});

test('Instructor puede encender y apagar con confirmación', async ({ page }) => {
  await startAs(page, INSTRUCTOR_LABEL, INSTRUCTOR_CREDENTIALS);

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-on');
  await expect(page.locator(STATUS)).toHaveText('Alarma activada');
  await expect(page.locator(BUTTON)).toHaveText('Apagar alarma');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'D');

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-off');
  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');
  await expect(page.locator(BUTTON)).toHaveText('Encender alarma');
});

test('Administrador puede encender y apagar con confirmación', async ({ page }) => {
  await startAs(page, ADMIN_LABEL, ADMIN_CREDENTIALS);

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-on');
  await expect(page.locator(STATUS)).toHaveText('Alarma activada');

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-off');
  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');
});

test('la alarma puede encenderse sin aglomeración', async ({ page }) => {
  await startAs(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await clearCriticalAgglomeration(page);

  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'A');
  await expect(page.locator(NOTICE)).toContainText(MESSAGES.A);

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-on');

  await expect(page.locator(STATUS)).toHaveText('Alarma activada');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'C');
  await expect(page.locator(NOTICE)).not.toContainText('aglomeración detectada');
});

test('cancelar el diálogo conserva el estado y no crea alertas', async ({ page }) => {
  await startAs(page, ADMIN_LABEL, ADMIN_CREDENTIALS);

  await page.locator(BUTTON).click();
  await cancelAlarm(page);

  await expect(page.locator(STATUS)).toHaveText('Alarma apagada');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'B');
  await page.locator('ion-tab-button[tab="alertas"]').click();
  await expect(page.locator('.alert-alarm')).toContainText('Alarma apagada');
  await expect(page.locator('app-alert-card')).toHaveCount(3);
  await expect(page.locator('.alert-stats__value')).toHaveText(['1', '2', '3']);
});

test('los cuatro mensajes combinados cambian con el estado real', async ({ page }) => {
  await startAs(page, ADMIN_LABEL, ADMIN_CREDENTIALS);

  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'B');
  await expect(page.locator(NOTICE)).toContainText(MESSAGES.B);
  await expect(page.locator(NOTICE)).toContainText('Zona afectada: Pasillo principal');

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-on');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'D');
  await expect(page.locator(NOTICE)).toContainText(MESSAGES.D);

  await clearCriticalAgglomeration(page);
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'C');
  await expect(page.locator(NOTICE)).toContainText(MESSAGES.C);

  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-off');
  await expect(page.locator(NOTICE)).toHaveAttribute('data-scenario', 'A');
  await expect(page.locator(NOTICE)).toContainText(MESSAGES.A);
  await expect(page.locator(CONTROL)).not.toContainText('LED verdes');
});

test('cambiar de perfil revoca el permiso sin alterar el estado de la alarma', async ({ page }) => {
  await startAs(page, ADMIN_LABEL, ADMIN_CREDENTIALS);
  await page.locator(BUTTON).click();
  await confirmAlarm(page, 'turn-on');
  await expect(page.locator(STATUS)).toHaveText('Alarma activada');

  await openAcceso(page);
  await selectProfile(page, LEARNER_LABEL);

  await expect(page.locator(STATUS)).toHaveText('Alarma activada');
  await expect(page.locator(BUTTON)).toHaveCount(0);
  await expect(page.locator(NOTE)).toBeVisible();

  await openAcceso(page);
  await selectProfile(page, INSTRUCTOR_LABEL, INSTRUCTOR_CREDENTIALS);
  await expect(page.locator(BUTTON)).toHaveText('Apagar alarma');
});

test('las pestañas, pantallas y línea base del simulador siguen funcionando', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-inicio h1')).toContainText('SENA CROWD');
  await expect(page.locator('app-metric-card').first()).toContainText('107');
  await expect(page.locator('ion-tab-button')).toHaveCount(5);

  const tabs = [
    { tab: 'zonas', title: 'Monitoreo de zonas' },
    { tab: 'mapa', title: 'Mapa de monitoreo' },
    { tab: 'alertas', title: 'Centro de alertas' },
    { tab: 'mas', title: 'Más opciones' },
    { tab: 'inicio', title: 'SENA CROWD' },
  ];

  for (const { tab, title } of tabs) {
    await page.locator(`ion-tab-button[tab="${tab}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/tabs/${tab}$`));
    await expect(page.locator(`app-${tab} h1`)).toContainText(title);
    await expect(page.locator('ion-tab-button.tab-selected')).toHaveAttribute('tab', tab);
    // El perfil inicial es Visitante: ninguna pantalla ofrece control de buzzer.
    await expect(page.locator(BUTTON)).toHaveCount(0);
  }

  await page.locator('ion-tab-button[tab="zonas"]').click();
  await expect(page.locator('app-zone-card')).toHaveCount(4);
  await page.locator('ion-tab-button[tab="alertas"]').click();
  await expect(page.locator('app-alert-card')).toHaveCount(3);
  await expect(page.locator('.alert-stats__value')).toHaveText(['1', '2', '3']);
  await expect(page.locator('.alert-alarm')).toBeVisible();
  await expect(page.locator('.alert-alarm__message')).not.toContainText('LED verdes');
});
