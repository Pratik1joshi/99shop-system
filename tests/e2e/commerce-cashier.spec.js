import { test, expect } from '@playwright/test';

const PIN = process.env.E2E_CASHIER_PASSWORD || 'CashierTestOnly123';
async function cashierLogin(page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /commerce_cashier/i }).click();
  await page.locator('#admin-pin').fill(PIN);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/cashier\//, { timeout: 30_000 });
}
async function cashierApi(page, url, options = {}) {
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  return page.request.fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
}

test.describe('real non-admin cashier commerce', () => {
  test.setTimeout(180_000);
  test('keyboard barcode sale, permissions, history and return', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => ({ document: { write() {}, close() {} }, focus() {} }); });
    await cashierLogin(page);
    // Establish this test's own refund cash through a real, separately posted
    // cash sale. Split tender below must not borrow cash from another test.
    const lookup = await cashierApi(page, '/api/admin/commerce/search?group=products&q=E2E-STANDARD&limit=8');
    const fundingVariant = (await lookup.json()).groups[0].results.find(row => row.sku === 'E2E-STANDARD');
    const fundingLines = [{ variant_id: fundingVariant.id, quantity: 3 }];
    const fundingDraftResponse = await cashierApi(page, '/api/admin/retail-sales', { method: 'POST', data: { lines: fundingLines } });
    expect(fundingDraftResponse.ok(), await fundingDraftResponse.text()).toBe(true);
    const fundingDraft = (await fundingDraftResponse.json()).retail_sale;
    const fundingResponse = await cashierApi(page, `/api/admin/retail-sales/${fundingDraft.id}/checkout`, { method: 'POST', data: {
      lines: fundingLines, payments: [{ method: 'cash', amount: fundingDraft.grand_total, cash_tendered: fundingDraft.grand_total }],
      idempotency_key: `refund-cash-fixture-${fundingDraft.id}`,
    } });
    expect(fundingResponse.ok(), await fundingResponse.text()).toBe(true);
    await page.goto('/cashier/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    if ((page.viewportSize()?.width || 1280) < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('button', { name: 'Sell' })).toBeVisible();
    if ((page.viewportSize()?.width || 1280) < 1024) await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.keyboard.press('F3');
    const search = page.getByPlaceholder('Scan barcode or search product / SKU / brand...');
    await expect(search).toBeFocused();
    await search.fill('990000000001');
    await search.press('Enter');
    // Below lg the customer and sale controls are a bottom sheet opened from Sale options.
    if ((page.viewportSize()?.width || 1280) < 1024) await page.getByRole('button', { name: /^Sale options/ }).click();
    await expect(page.getByRole('list', { name: 'Sale cart' }).getByText('E2E Everyday Item')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Line discount' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Override price' })).toHaveCount(0);
    await page.keyboard.press('F4');
    const quantity = page.getByLabel('Quantity for E2E Everyday Item');
    await expect(quantity).toBeFocused();
    await quantity.fill('2');
    await page.getByRole('button', { name: 'New customer' }).click();
    const customerDrawer = page.getByRole('dialog', { name: 'New customer' });
    const customerName = `Billing E2E ${Date.now()}`;
    await customerDrawer.getByLabel('Name').fill(customerName);
    await customerDrawer.getByLabel('Phone').fill(`98${String(Date.now()).slice(-8)}`);
    await customerDrawer.getByRole('button', { name: 'Save customer' }).click();
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay / })).toBeEnabled();
    await page.keyboard.press('F9');
    await expect(page.getByRole('heading', { name: /payment/i })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Credit' })).toHaveCount(0);
    const payment = page.getByRole('dialog', { name: 'Checkout payment' });
    const due = Number((await payment.getByText('Amount due').locator('..').locator('dd').textContent()).replace(/[^\d.]/g, ''));
    expect(due).toBeGreaterThan(10);
    await payment.getByRole('button', { name: '+ Split payment' }).click();
    await payment.locator('input[type="number"]').first().fill('10');
    await payment.getByLabel('Cash tendered 1').fill('20');
    await payment.locator('select').last().selectOption('online');
    await payment.locator('input[type="number"]').last().fill(String(due - 10));
    await expect(payment.getByText('Change').locator('..').locator('dd')).toHaveText('Rs 10.00');
    await expect(payment.getByRole('button', { name: 'Complete Sale' })).toBeEnabled();
    await page.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(page.getByRole('heading', { name: 'Sale Completed' })).toBeVisible();
    const receipt = await page.getByText(/INV-/).first().textContent();
    await page.getByRole('button', { name: 'New Sale' }).click();
    await page.keyboard.press('F10');
    await expect(page.getByRole('heading', { name: 'Sale Completed' })).toBeVisible();
    await page.getByRole('button', { name: 'New Sale' }).click();

    await page.goto('/cashier/retail-sales-history');
    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible();
    await page.getByPlaceholder('Receipt, product, barcode, customer, phone or cashier').fill(receipt.trim());
    await page.locator('tbody button').first().click();
    const detail = page.getByRole('dialog', { name: 'Sale detail' });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Print receipt' }).click();
    await expect(detail.getByText('1 receipt reprints recorded')).toBeVisible();
    const saleLink = detail.getByRole('link', { name: 'Return or exchange' });
    await expect(saleLink).toBeVisible();
    const id = (await saleLink.getAttribute('href')).match(/\/(\d+)\/return$/)[1];
    const response = await cashierApi(page, `/api/admin/retail-sales/${id}`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.retail_sale.cogs_total).toBeUndefined();
    expect(data.retail_sale.lines[0].unit_cost).toBeUndefined();
    const forbidden = await cashierApi(page, '/api/admin/commerce/products', { method: 'POST', data: { name: 'Forbidden', price: 1 } });
    expect(forbidden.status()).toBe(403);
    await saleLink.click();
    await expect(page.getByRole('heading', { name: /Return \/ Exchange/ })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Post Return' }).click();
    await expect(page).toHaveURL(/\/cashier\/retail-sales-history\/\d+$/);
    await expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible();

    await page.goto('/cashier/billing');
    const secondSearch = page.getByPlaceholder('Scan barcode or search product / SKU / brand...');
    await secondSearch.fill('990000000001');
    await secondSearch.press('Enter');
    if ((page.viewportSize()?.width || 1280) < 1024) await page.getByRole('button', { name: /^Sale options/ }).click();
    await page.getByPlaceholder('Customer name/phone (optional)').fill(customerName);
    await page.getByRole('button', { name: new RegExp(customerName) }).click();
    await expect(page.getByRole('button', { name: /^Pay / })).toBeEnabled();
    await page.getByRole('button', { name: /^Pay / }).click();
    await page.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(page.getByRole('heading', { name: 'Sale Completed' })).toBeVisible();
    const exchangeReceipt = (await page.getByText(/INV-/).first().textContent()).trim();
    await page.goto('/cashier/retail-sales-history');
    await page.getByPlaceholder('Receipt, product, barcode, customer, phone or cashier').fill(exchangeReceipt);
    await page.locator('tbody button').first().click();
    await page.getByRole('dialog', { name: 'Sale detail' }).getByRole('link', { name: 'Return or exchange' }).click();
    await page.getByRole('button', { name: 'Exchange', exact: true }).click();
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByPlaceholder(/Search replacement item/).fill('E2E Everyday Item');
    await page.getByRole('button', { name: /E2E Everyday Item.*Rs/ }).click();
    await expect(page.getByText('Difference to settle')).toBeVisible();
    const exchangeResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/admin/retail-exchanges') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Complete Exchange' }).click();
    const exchangeResponse = await exchangeResponsePromise;
    expect(exchangeResponse.ok(), await exchangeResponse.text()).toBe(true);
    await expect(page).toHaveURL(/\/cashier\/retail-sales-history\/\d+$/);
  });
});
