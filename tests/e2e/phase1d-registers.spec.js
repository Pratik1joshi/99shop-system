import { test, expect } from '@playwright/test';

test('Registers & Cash keeps business-day control and drawer movements in one workspace', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  await page.goto('/admin/retail-registers');
  await expect(page.getByRole('heading', { name: 'Registers & Cash' })).toBeVisible();
  await expect(page.getByText('The business day is the reporting period.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening & Closing' })).toBeVisible();
  await page.getByRole('button', { name: 'Register & cash movements' }).click();
  await expect(page.getByRole('heading', { name: 'Cash Drawer' })).toBeVisible();
  await page.getByRole('button', { name: 'Business day & closing' }).click();
  await expect(page.getByRole('heading', { name: 'Opening & Closing' })).toBeVisible();
});

test('Cashier can reach the consolidated register workspace through its page gate', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.getByRole('button', { name: /commerce_cashier/i }).click();
  await page.locator('#admin-pin').fill(process.env.E2E_CASHIER_PASSWORD || 'CashierTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/cashier\//, { timeout: 30_000 });
  await page.goto('/cashier/retail-registers');
  await expect(page.getByRole('heading', { name: 'Registers & Cash' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening & Closing' })).toBeVisible();
});
