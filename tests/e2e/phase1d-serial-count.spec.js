import { test, expect } from '@playwright/test';

test('blind serial count captures exact missing and found identities', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const search = await (await page.request.get('/api/admin/commerce/search?group=products&q=E2E-SERIAL&limit=8', { headers })).json();
  const variantId = search.groups[0].results.find((row) => row.sku === 'E2E-SERIAL').id;
  const suppliers = await (await page.request.get('/api/admin/suppliers?search=E2E%20Supplier', { headers })).json();
  const supplierId = suppliers.suppliers[0].id;
  const locationResponse = await page.request.post('/api/admin/retail-inventory/locations', { headers,
    data: { name: `Serial Count E2E ${Date.now()}`, code: `SC-E2E-${Date.now()}`, location_type: 'shop' } });
  expect(locationResponse.ok()).toBe(true);
  const location = (await locationResponse.json()).location;
  const first = `COUNT-E2E-A-${Date.now()}`;
  const missing = `COUNT-E2E-B-${Date.now()}`;
  const found = `COUNT-E2E-FOUND-${Date.now()}`;
  const receiptResponse = await page.request.post('/api/admin/retail-goods-receipts', { headers, data: {
    supplier_id: supplierId, location_id: location.id, invoice_number: `COUNT-E2E-${Date.now()}`, payment_method: 'credit',
    lines: [{ variant_id: variantId, quantity_received: 2, unit_cost: 80, serial_numbers: [first, missing] }],
  } });
  expect(receiptResponse.status()).toBe(201);
  const receipt = (await receiptResponse.json()).goods_receipt;
  expect((await page.request.post(`/api/admin/retail-goods-receipts/${receipt.id}/post`, { headers, data: {} })).ok()).toBe(true);
  const created = await page.request.post('/api/admin/retail-stock-counts', { headers, data: {
    location_id: location.id, count_type: 'CYCLE', variant_ids: [variantId], blind: true,
  } });
  expect(created.ok()).toBe(true);
  const count = (await created.json()).retail_stock_count;
  await page.goto(`/admin/retail-stock-counts/${count.id}`);
  await expect(page.getByText(count.count_number)).toBeVisible();
  await expect(page.getByText(missing)).toHaveCount(0);
  await page.getByLabel(/Counted serials for E2E Serial Device/).fill(`${first}\n${found}`);
  await page.getByLabel(/Counted serials for E2E Serial Device/).blur();
  await expect(page.getByRole('button', { name: 'Complete Counting' })).toBeEnabled();
  await page.getByRole('button', { name: 'Complete Counting' }).click();
  await expect(page.getByText(/Missing:/)).toContainText(missing);
  await page.getByRole('button', { name: /Approve.*Post/ }).click();
  await expect(page.getByText('POSTED', { exact: true })).toBeVisible();
  const missingIdentity = await (await page.request.get(`/api/admin/retail-serials/${missing}`, { headers })).json();
  const foundIdentity = await (await page.request.get(`/api/admin/retail-serials/${found}`, { headers })).json();
  expect(missingIdentity.serial.status).toBe('MISSING');
  expect(foundIdentity.serial.status).toBe('IN_STOCK');
});
