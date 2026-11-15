import { expect, test } from '@playwright/test';

test('redirects the root url to the Inicio dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/tabs\/inicio$/);
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await expect(page.locator('ion-tab-button')).toHaveCount(5);
  await expect(page.locator('ion-tab-button.tab-selected')).toContainText('Inicio');
  await expect(page.locator('h1:visible')).toContainText('SENA CROWD');
  await expect(page.locator('app-metric-card')).toHaveCount(4);
  await expect(page.locator('app-metric-card').first()).toContainText('107');
});

test('navigates between the five bottom tabs', async ({ page }) => {
  await page.goto('/tabs/inicio');

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
    await expect(page.locator('h1:visible')).toContainText(title);
    await expect(page.locator('ion-tab-bar')).toBeVisible();
    await expect(page.locator('ion-tab-button.tab-selected')).toHaveAttribute('tab', tab);
  }
});

test('navigates to Zonas from the dashboard summary', async ({ page }) => {
  await page.goto('/tabs/inicio');

  await page.locator('ion-button.dash-summary__cta').click();

  await expect(page).toHaveURL(/\/tabs\/zonas$/);
  await expect(page.locator('h1:visible')).toContainText('Monitoreo de zonas');
});

test('renders the four monitored zone cards with derived occupancies', async ({ page }) => {
  await page.goto('/tabs/zonas');

  await expect(page.locator('h1:visible')).toContainText('Monitoreo de zonas');
  await expect(page.locator('app-zone-card')).toHaveCount(4);
  await expect(page.locator('.zonas-summary')).toContainText('107');

  const cards = page.locator('app-zone-card');
  const expected = [
    { name: 'Cafetería', people: '35', capacity: '50', occupancy: '70%', status: 'Precaución' },
    { name: 'Biblioteca', people: '18', capacity: '60', occupancy: '30%', status: 'Normal' },
    { name: 'Pasillo principal', people: '42', capacity: '50', occupancy: '84%', status: 'Crítico' },
    { name: 'Punto de encuentro', people: '12', capacity: '100', occupancy: '12%', status: 'Normal' },
  ];

  for (const [index, zone] of expected.entries()) {
    const card = cards.nth(index);

    await expect(card).toContainText(zone.name);
    await expect(card).toContainText(zone.people);
    await expect(card).toContainText(zone.capacity);
    await expect(card).toContainText(zone.occupancy);
    await expect(card).toContainText(zone.status);
    await expect(card).toContainText('Datos simulados');
  }

  await cards.nth(2).click();
  await expect(cards.nth(2).locator('.zone-card__note')).toContainText('Pasillo principal');
  await expect(cards.nth(2).locator('.zone-card__note')).toContainText('Crítico');
});
