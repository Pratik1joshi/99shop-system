import { test, expect } from '@playwright/test';

test('tablet can search stock, serials, suppliers and open purchase review', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto('/admin/retail-inventory');
  await page.getByLabel('Search product, SKU, barcode, serial or batch').fill('E2E-STANDARD');
  await expect(page.getByRole('button', { name: 'E2E Everyday Item' })).toBeVisible();
  await page.goto('/admin/retail-inventory-tracking');
  await page.getByRole('combobox', { name: 'Identity' }).selectOption('serial');
  await page.getByRole('textbox', { name: 'Search product, SKU or identity' }).fill('E2E-SERIAL');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.goto('/admin/retail-purchase-orders');
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
  await page.goto('/admin/retail-goods-receipts');
  await expect(page.getByRole('heading', { name: 'Purchases' })).toBeVisible();
  await page.goto('/admin/retail-suppliers');
  await page.getByLabel('Search supplier name or contact').fill('E2E Supplier');
  await expect(page.getByRole('button', { name: 'E2E Supplier' })).toBeVisible();
});
