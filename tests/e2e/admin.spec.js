import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.E2E_ADMIN_PIN || 'KmTestOnly123';

// Below lg the customer and sale controls are a bottom sheet opened from Sale options.
async function openCartIfSheet(page) {
  if ((page.viewportSize()?.width || 1280) < 1024) await page.getByRole('button', { name: /^Sale options/ }).click();
}

async function loginAsAdmin(page) {
  await page.goto('/login');
  await expect(page.getByText('Signing in as admin')).toBeVisible();
  await page.locator('#admin-pin').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 20_000 });
}

async function authorizedApi(page, path, options = {}) {
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const response = await page.request.fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  expect(response.ok(), `${options.method || 'GET'} ${path}: ${JSON.stringify(body)}`).toBe(true);
  return body;
}

async function scan(page, code) {
  const input = page.getByPlaceholder('Scan barcode or search product / SKU / brand...');
  await input.fill(code);
  await input.press('Enter');
}

async function completeCashSale(page) {
  await openCartIfSheet(page);
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('button', { name: 'Complete Sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale Completed' })).toBeVisible();
  await page.getByRole('button', { name: 'New Sale' }).click();
}

test.describe('Retail admin/cashier PostgreSQL browser gate', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.setTimeout(120_000);

  test('login, register prerequisite, checkout, split, hold/resume, serial, history, return and navigation', async ({ page }) => {
    await loginAsAdmin(page);

    const narrowViewport = (page.viewportSize()?.width || 1280) < 1024;
    if (narrowViewport) await page.getByRole('button', { name: 'Open navigation' }).click();
    const workspaceNav = page.getByRole('navigation', { name: 'Workspaces' }).filter({ visible: true });
    await expect(workspaceNav.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(workspaceNav.getByRole('link', { name: 'Sell' })).toBeVisible();
    await expect(workspaceNav.getByRole('link', { name: 'Inventory' })).toBeVisible();
    await expect(workspaceNav.getByRole('link', { name: 'Purchasing' })).toBeVisible();
    if (narrowViewport) await page.getByRole('button', { name: 'Close navigation' }).click();
    await expect(page.getByRole('status', { name: /Register (open|closed)/ })).toBeVisible();
    await page.keyboard.press('Control+K');
    await expect(page.getByRole('dialog', { name: 'Search and commands' })).toBeVisible();
    await page.getByLabel('Search commerce and commands').fill('receive stock');
    await expect(page.getByRole('link', { name: /Receive stock/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search and commands' })).toBeHidden();

    await page.goto('/admin/billing');
    await page.getByRole('heading', { name: /^(Billing|Open the business day)$/i }).waitFor();
    const openingPrompt = page.getByText(/Open the business day/i);
    if (await openingPrompt.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Open business day/i }).click();
      await page.getByLabel('Opening Cash').fill('500');
      await page.getByRole('button', { name: /^Open Business Day$/i }).click();
      await expect(page.getByText(/^Business Day Open$/i)).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    }

    // Receive all browser stock through the real, journal-producing GRN API.
    const products = (await authorizedApi(page, '/api/admin/products?channel=pos')).products;
    const variants = products.flatMap((p) => (p.variants || []).map((v) => ({ product: p, ...v })));
    const standard = variants.find((v) => v.sku === 'E2E-STANDARD');
    const serial = variants.find((v) => v.sku === 'E2E-SERIAL');
    expect(standard).toBeTruthy();
    expect(serial).toBeTruthy();
    const suppliers = (await authorizedApi(page, '/api/admin/suppliers?page_size=100')).suppliers;
    const supplier = suppliers.find((s) => s.normalized_name === 'e2e supplier');
    const currentStock = (await authorizedApi(page, `/api/admin/retail-inventory/stock?variantIds=${standard.id},${serial.id}`)).stock;
    if (Number(currentStock[standard.id] || 0) === 0 && Number(currentStock[serial.id] || 0) === 0) {
      const grn = await authorizedApi(page, '/api/admin/retail-goods-receipts', {
        method: 'POST',
        data: {
          supplier_id: supplier.id,
          payment_method: 'credit',
          invoice_number: 'E2E-GRN-1',
          lines: [
            { variant_id: standard.id, quantity_received: 20, unit_cost: 60 },
            { variant_id: serial.id, quantity_received: 1, unit_cost: 150, serial_numbers: ['E2E-SERIAL-001'] },
          ],
        },
      });
      await authorizedApi(page, `/api/admin/retail-goods-receipts/${grn.goods_receipt.id}/post`, { method: 'POST', data: {} });
    }

    await page.goto('/admin/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(page.getByText('E2E Everyday Item').first()).toBeVisible();

    await scan(page, '990000000001');
    await expect(page.getByText('E2E Everyday Item').last()).toBeVisible();
    await completeCashSale(page);

    await scan(page, '990000000001');
    await openCartIfSheet(page);
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await expect(page.getByText(/Cart is empty/i)).toBeVisible();
    await page.getByRole('button', { name: /Held \([1-9]\d*\)/ }).click();
    await page.getByRole('button', { name: /Resume/i }).first().click();
    await expect(page.getByText(/Continuing held sale/)).toBeVisible();

    await openCartIfSheet(page);
  await page.getByRole('button', { name: /^Pay / }).click();
    await page.getByRole('button', { name: /Split payment/i }).click();
    const paymentPanel = page.getByRole('heading', { name: /Payment/ }).locator('..').locator('..');
    const amounts = paymentPanel.locator('input[type="number"]');
    await amounts.nth(0).fill('40');
    await paymentPanel.getByLabel('Cash tendered 1').fill('50');
    await paymentPanel.locator('select').nth(1).selectOption('online');
    await amounts.nth(2).fill('60');
    await expect(paymentPanel.getByText('Change').locator('..').locator('dd')).toHaveText('Rs 10.00');
    await page.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(page.getByRole('heading', { name: 'Sale Completed' })).toBeVisible();
    await page.getByRole('button', { name: 'New Sale' }).click();

    await scan(page, '990000000002');
    await expect(page.getByRole('heading', { name: 'Select serial number' })).toBeVisible();
    await page.getByRole('button', { name: 'E2E-SERIAL-001' }).click();
    await expect(page.getByText('Serial: E2E-SERIAL-001')).toBeVisible();
    await completeCashSale(page);

    await page.goto('/admin/retail-sales-history');
    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible();
    const latestSale = page.locator('tbody button').first();
    await expect(latestSale).toBeVisible();
    await latestSale.click();
    await page.getByRole('link', { name: 'Return or exchange' }).click();
    await expect(page.getByRole('heading', { name: /Return \/ Exchange/ })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Post Return' }).click();
    await expect(page).toHaveURL(/\/admin\/retail-sales-history\/\d+$/);
    await expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible();
    const restoredSerials = (await authorizedApi(page, `/api/admin/retail-serials?variantId=${serial.id}`)).serials;
    expect(restoredSerials.map((row) => row.serial_number)).toContain('E2E-SERIAL-001');

    await page.goto('/admin/retail-inventory-ops');
    await expect(page.getByRole('heading', { name: /Inventory Operations/i })).toBeVisible();
    await page.goto('/admin/retail-goods-receipts');
    await expect(page.getByRole('heading', { name: 'Purchases' })).toBeVisible();
  });

  test('wrong password is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#admin-pin').fill('definitely-wrong-pw');
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('authorized return records a missing physical receipt with a reason', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await scan(page, '990000000001');
    await openCartIfSheet(page);
  await page.getByRole('button', { name: /^Pay / }).click();
    await page.getByRole('button', { name: 'Complete Sale' }).click();
    const receipt = (await page.getByText(/INV-/).first().textContent()).trim();
    await page.goto('/admin/retail-sales-history');
    await page.getByPlaceholder('Receipt, product, barcode, customer, phone or cashier').fill(receipt);
    await page.locator('tbody button').first().click();
    await page.getByRole('dialog', { name: 'Sale detail' }).getByRole('link', { name: 'Return or exchange' }).click();
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByLabel(/Customer does not have the receipt/).check();
    await page.getByRole('button', { name: 'Post Return' }).click();
    await expect(page.getByText('Enter a reason for the missing receipt.')).toBeVisible();
    await page.getByLabel(/Reason \(required\)/).fill('Physical receipt lost; original sale verified in history');
    await page.getByRole('button', { name: 'Post Return' }).click();
    await expect(page).toHaveURL(/\/admin\/retail-sales-history\/\d+$/);
  });
});
