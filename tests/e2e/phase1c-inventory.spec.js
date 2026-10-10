import { test, expect } from '@playwright/test';

test('owner opens paginated stock and immutable movement evidence', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto('/admin/retail-inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await page.getByLabel('Search product, SKU, barcode, serial or batch').fill('E2E-STANDARD');
  await expect(page.getByRole('button', { name: 'E2E Everyday Item' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Everyday Item' }).click();
  const detail = page.getByRole('dialog', { name: /E2E Everyday Item/ });
  await expect(detail.getByText('Recent movements')).toBeVisible();
  await expect(detail.getByText('Open purchase orders')).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();
  await page.goto('/admin/retail-inventory-movements');
  await expect(page.getByRole('heading', { name: 'Movements' })).toBeVisible();
  await page.getByLabel('Movement').selectOption('SALE');
  await expect(page.locator('tbody tr').first()).toContainText('SALE');
});

test('cashier stock APIs never return cost fields', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /commerce_cashier/i }).click();
  await page.locator('#admin-pin').fill(process.env.E2E_CASHIER_PASSWORD || 'CashierTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/cashier\//);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  for (const path of ['/api/admin/retail-inventory/workspace?page_size=2', '/api/admin/retail-inventory/movements?page_size=2', '/api/admin/retail-serials/E2E-SERIAL-001']) {
    const response = await page.request.get(path, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/"(?:unit_cost|total_cost|average_cost|current_cost|inventory_value|lastPurchaseCost|value_variance)"/);
    if (body.rows) expect(body.rows.length).toBeGreaterThan(0);
  }
  for (const path of ['/api/admin/retail-goods-receipts', '/api/admin/accounts-payable', '/api/admin/retail-suppliers']) {
    const response = await page.request.get(path, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(403);
  }
});

test('owner reviews an adjustment with location stock before posting', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto('/admin/retail-inventory-ops');
  await page.getByText('Action', { exact: true }).locator('..').locator('select').selectOption('MANUAL');
  await page.getByPlaceholder(/Search product\/SKU\/barcode/).fill('E2E-STANDARD');
  await page.getByRole('button', { name: 'E2E Everyday Item' }).click();
  await expect(page.getByText(/Current stock at/)).toBeVisible();
  await page.getByLabel('Quantity (+ found, - shortage)').fill('1');
  await page.getByText('Reason', { exact: true }).locator('..').locator('select').selectOption('FOUND_STOCK');
  await page.getByRole('button', { name: 'Review adjustment' }).click();
  await expect(page.getByText(/Posting changes the inventory ledger immediately/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and post' }).click();
  await expect(page.getByRole('button', { name: 'Review adjustment' })).toBeVisible();
});
