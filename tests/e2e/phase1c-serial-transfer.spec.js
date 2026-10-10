import { test, expect } from '@playwright/test';

test('exact serial moves source to transit to destination', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const search = await (await page.request.get('/api/admin/commerce/search?group=products&q=E2E-SERIAL&limit=8', { headers })).json();
  const variantId = search.groups[0].results.find((row) => row.sku === 'E2E-SERIAL').id;
  const suppliers = await (await page.request.get('/api/admin/suppliers?search=E2E%20Supplier', { headers })).json();
  const supplierId = suppliers.suppliers[0].id;
  const serial = `TRANSFER-E2E-${Date.now()}`;
  const receiptResponse = await page.request.post('/api/admin/retail-goods-receipts', { headers, data: {
    supplier_id: supplierId, invoice_number: `TR-E2E-${Date.now()}`, payment_method: 'credit',
    lines: [{ variant_id: variantId, quantity_received: 1, unit_cost: 80, serial_numbers: [serial] }],
  } });
  expect(receiptResponse.status()).toBe(201);
  const receipt = (await receiptResponse.json()).goods_receipt;
  expect((await page.request.post(`/api/admin/retail-goods-receipts/${receipt.id}/post`, { headers, data: {} })).ok()).toBe(true);
  const locationResponse = await page.request.post('/api/admin/retail-inventory/locations', { headers,
    data: { name: `Transfer E2E ${Date.now()}`, code: `T-E2E-${Date.now()}`, location_type: 'shop' } });
  expect(locationResponse.status()).toBe(200);
  const destination = (await locationResponse.json()).location;
  await page.goto('/admin/retail-transfers');
  await page.getByRole('button', { name: /New Transfer/ }).click();
  await page.getByText('New Stock Transfer').locator('..').getByText('Source').locator('..').locator('select').selectOption({ label: 'Main Store' });
  await page.getByText('New Stock Transfer').locator('..').getByText('Destination').locator('..').locator('select').selectOption(String(destination.id));
  await page.getByPlaceholder(/Search item to transfer/).fill('E2E-SERIAL');
  await page.getByRole('button', { name: /E2E Serial Device/ }).click();
  await page.getByLabel(/Serials for E2E Serial Device/).fill(serial);
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page.getByRole('button', { name: 'Dispatch' })).toBeVisible();
  await page.getByRole('button', { name: 'Dispatch' }).click();
  await expect(page.getByRole('button', { name: 'Receive', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Receive', exact: true }).click();
  await expect(page.getByText('RECEIVED', { exact: true })).toBeVisible();
  const identity = await (await page.request.get(`/api/admin/retail-serials/${serial}`, { headers })).json();
  expect(Number(identity.serial.location_id)).toBe(Number(destination.id));
});
