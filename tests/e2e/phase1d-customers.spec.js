import { test, expect } from '@playwright/test';

test('owner sees distinct customer balances and Retail receivables', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await page.goto('/admin/retail-customers');
  await expect(page.getByRole('heading', { name: 'Customer command center' })).toBeVisible();
  await page.getByLabel('Search customers').fill('Billing E2E');
  await expect(page.locator('tbody tr').first()).toContainText('Billing E2E');
  await page.locator('tbody tr a').first().click();
  await expect(page.getByText('Receivables · customer owes us')).toBeVisible();
  await expect(page.getByText('Store credit · we owe customer')).toBeVisible();
  await expect(page.getByText('Loyalty · reward points')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Commerce timeline' })).toBeVisible();
  await page.goto('/admin/retail-receivables');
  await expect(page.getByRole('heading', { name: 'Receivables' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Collect payment' })).toBeVisible();
  await page.goto('/admin/retail-finance');
  await expect(page.getByRole('heading', { name: 'Money and accounts' })).toBeVisible();
  await expect(page.getByText('Trial balance: Balanced')).toBeVisible();
});

test('Retail collection settles two sales without changing revenue', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const suffix = Date.now();
  const created = await page.request.post('/api/admin/customers', { headers, data: {
    name: `Collection E2E ${suffix}`, phone: `98${String(suffix).slice(-8)}`, credit_limit: 10000,
  } });
  expect(created.status()).toBe(201);
  const customerId = (await created.json()).customer.id;
  const search = await (await page.request.get('/api/admin/commerce/search?group=products&q=E2E-STANDARD&limit=8', { headers })).json();
  const variantId = search.groups[0].results.find((row) => row.sku === 'E2E-STANDARD').id;
  const sales = [];
  for (let index = 0; index < 2; index += 1) {
    const heldResponse = await page.request.post('/api/admin/retail-sales', { headers, data: {
      customer_id: customerId, lines: [{ variant_id: variantId, quantity: 1 }],
    } });
    expect(heldResponse.status()).toBe(201);
    const held = (await heldResponse.json()).retail_sale;
    const completed = await page.request.post(`/api/admin/retail-sales/${held.id}/checkout`, { headers, data: {
      customer_id: customerId, lines: [{ variant_id: variantId, quantity: 1 }],
      payments: [{ method: 'credit', amount: 100 }], idempotency_key: `collection-e2e-${suffix}-${index}`,
    } });
    expect(completed.status(), await completed.text()).toBe(200);
    sales.push((await completed.json()).retail_sale);
  }
  const before = await (await page.request.get('/api/admin/retail-finance', { headers })).json();
  await page.goto(`/admin/retail-receivables?customer_id=${customerId}`);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel(`Allocate ${sales[0].sale_number}`).fill('30');
  await page.getByLabel(`Allocate ${sales[1].sale_number}`).fill('20');
  const posted = page.waitForResponse((response) => response.url().endsWith('/api/admin/retail-receivables') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Post collection' }).click();
  const collectionId = (await (await posted).json()).collection.id;
  await expect(page.getByRole('heading', { name: /Collection COL/ })).toBeVisible();
  await page.goto(`/admin/retail-receivables?collection=${collectionId}`);
  await expect(page.getByRole('heading', { name: /Collection COL/ })).toBeVisible();
  const after = await (await page.request.get('/api/admin/retail-finance', { headers })).json();
  expect(after.retail.gross_sales).toBe(before.retail.gross_sales);
  expect(after.retail.open_ar).toBe(before.retail.open_ar - 50);
  const statement = await (await page.request.get(`/api/admin/retail-customers/${customerId}/statement`, { headers })).json();
  expect(statement.closing_balance).toBe(150);
  expect(statement.lines.filter((line) => line.source_type === 'retail_credit_collection')).toHaveLength(1);
});

test('cashier cannot read private customer notes or change credit controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const ownerToken = await page.evaluate(() => localStorage.getItem('pos_token'));
  const suffix = Date.now();
  const created = await page.request.post('/api/admin/customers', { headers: { Authorization: `Bearer ${ownerToken}` }, data: {
    name: `Private E2E ${suffix}`, phone: `97${String(suffix).slice(-8)}`, credit_limit: 900,
    notes: 'OWNER PRIVATE NOTE', is_blacklisted: true,
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).customer.id;
  await page.evaluate(() => { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); });
  await page.goto('/login');
  await page.getByRole('button', { name: /commerce_cashier/i }).click();
  await page.locator('#admin-pin').fill(process.env.E2E_CASHIER_PASSWORD || 'CashierTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/cashier\//, { timeout: 25_000 });
  const cashierToken = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${cashierToken}` };
  const list = await (await page.request.get(`/api/admin/customers?search=Private%20E2E%20${suffix}`, { headers })).json();
  expect(list.customers).toHaveLength(1);
  expect(JSON.stringify(list)).not.toContain('OWNER PRIVATE NOTE');
  const profile = await (await page.request.get(`/api/admin/customers/${id}/profile`, { headers })).json();
  expect(JSON.stringify(profile)).not.toContain('OWNER PRIVATE NOTE');
  const changed = await page.request.put('/api/admin/customers', { headers, data: {
    id, name: `Private E2E ${suffix}`, phone: `97${String(suffix).slice(-8)}`,
    credit_limit: 0, is_blacklisted: false, notes: 'cashier changed note',
  } });
  expect(changed.status()).toBe(200);
  expect((await changed.json()).customer.notes).toBeUndefined();
  expect((await page.request.delete(`/api/admin/customers?id=${id}`, { headers })).status()).toBe(403);
  expect((await page.request.get('/api/admin/retail-finance', { headers })).status()).toBe(403);
  expect((await page.request.patch('/api/admin/retail-receivables', { headers, data: {} })).status()).toBe(403);
  const ownerView = await (await page.request.get(`/api/admin/customers?phone=97${String(suffix).slice(-8)}`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
  expect(ownerView.customer.credit_limit).toBe(900);
  expect(ownerView.customer.is_blacklisted).toBe(1);
  expect(ownerView.customer.notes).toBe('OWNER PRIVATE NOTE');
});

test('store credit correction is visible, journaled and safe to retry', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const context = await (await page.request.get('/api/admin/business-days?view=context', { headers })).json();
  if (context.isStale && !context.staleAcknowledged) {
    const continued = await page.request.post('/api/admin/business-days', { headers, data: {
      action: 'continue_stale', confirm_continue_stale: true, reason: 'Continue isolated E2E register for store-credit verification',
    } });
    expect(continued.status(), await continued.text()).toBe(201);
  }
  const suffix = Date.now();
  const created = await page.request.post('/api/admin/customers', { headers, data: {
    name: `Store Credit E2E ${suffix}`, phone: `95${String(suffix).slice(-8)}`,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const customerId = (await created.json()).customer.id;
  const endpoint = `/api/admin/customers/${customerId}/store-credit/adjust`;
  const data = { amount: 25, reason: 'Correct return value', idempotency_key: `store-credit-e2e-${suffix}` };
  const first = await page.request.post(endpoint, { headers, data });
  expect(first.status(), await first.text()).toBe(200);
  const replay = await page.request.post(endpoint, { headers, data });
  expect(replay.status(), await replay.text()).toBe(200);
  expect((await replay.json()).transactionId).toBe((await first.json()).transactionId);
  const balance = await (await page.request.get(`/api/admin/customers/${customerId}/store-credit`, { headers })).json();
  expect(balance.balance).toBe(25);
  await page.goto(`/admin/retail-customers/${customerId}`);
  await expect(page.getByRole('heading', { name: 'Store credit history' })).toBeVisible();
  await expect(page.getByLabel('Store credit adjustment amount')).toBeVisible();
});
