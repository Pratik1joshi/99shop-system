import { test, expect } from '@playwright/test';

test('Manager can approve an over-limit Retail sale with an audited reason', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  const ownerToken = await page.evaluate(() => localStorage.getItem('pos_token'));
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  const dayContext = await (await page.request.get('/api/admin/business-days?view=context', { headers: ownerHeaders })).json();
  if (dayContext.isStale && !dayContext.staleAcknowledged) {
    const continued = await page.request.post('/api/admin/business-days', { headers: ownerHeaders, data: {
      action: 'continue_stale', confirm_continue_stale: true, reason: 'Continue isolated E2E register for credit policy verification',
    } });
    expect(continued.status(), await continued.text()).toBe(201);
  }
  const suffix = Date.now();
  const managerName = `credit_manager_${suffix}`;
  const pin = 'StaffTestOnly123';
  const employee = await page.request.post('/api/admin/employees', { headers: ownerHeaders, data: {
    username: managerName, full_name: managerName, role: 'manager', pin, is_active: true,
  } });
  expect(employee.status(), await employee.text()).toBe(201);
  const created = await page.request.post('/api/admin/customers', { headers: ownerHeaders, data: {
    name: `Credit Override E2E ${suffix}`, phone: `96${String(suffix).slice(-8)}`, credit_limit: 50,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const customerId = (await created.json()).customer.id;

  await page.evaluate(() => { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); });
  await page.goto('/login');
  await page.getByRole('button', { name: managerName }).click();
  await page.locator('#admin-pin').fill(pin);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  const managerToken = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${managerToken}` };
  await page.goto('/admin/billing');
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  const searchResponse = await page.request.get('/api/admin/commerce/search?group=products&q=E2E-STANDARD&limit=8', { headers });
  expect(searchResponse.status(), await searchResponse.text()).toBe(200);
  const search = await searchResponse.json();
  const variantId = search.groups[0].results.find((row) => row.sku === 'E2E-STANDARD').id;
  const lines = [{ variant_id: variantId, quantity: 1 }];
  const heldResponse = await page.request.post('/api/admin/retail-sales', { headers, data: { customer_id: customerId, lines } });
  expect(heldResponse.status(), await heldResponse.text()).toBe(201);
  const saleId = (await heldResponse.json()).retail_sale.id;
  const payload = { customer_id: customerId, lines, payments: [{ method: 'credit', amount: 100 }],
    idempotency_key: `manager-credit-${suffix}` };
  const denied = await page.request.post(`/api/admin/retail-sales/${saleId}/checkout`, { headers, data: payload });
  expect(denied.status(), await denied.text()).toBe(409);
  const approved = await page.request.post(`/api/admin/retail-sales/${saleId}/checkout`, { headers, data: {
    ...payload, credit_override_reason: 'Manager approved after customer review',
  } });
  expect(approved.status(), await approved.text()).toBe(200);
  const detail = await (await page.request.get(`/api/admin/retail-sales/${saleId}`, { headers })).json();
  expect(detail.retail_sale.credit_override.reason).toContain('customer review');
  expect(Number(detail.retail_sale.credit_override.credit_limit)).toBe(50);
  const attentionResponse = await page.request.get('/api/admin/retail-customers?view=attention', { headers });
  expect(attentionResponse.status(), await attentionResponse.text()).toBe(200);
  const attention = await attentionResponse.json();
  expect(attention.over_limit.some((row) => Number(row.id) === Number(customerId))).toBe(true);
  await page.goto('/admin/retail-customers?filter=over_limit');
  await expect(page.getByRole('heading', { name: 'Customer money attention' })).toBeVisible();
  await expect(page.getByText(`Credit Override E2E ${suffix}`).first()).toBeVisible();
  const financeResponse = await page.request.get('/api/admin/retail-finance', { headers });
  expect(financeResponse.status(), await financeResponse.text()).toBe(200);
  expect((await financeResponse.json()).attention.over_limit_customers).toBeGreaterThan(0);
});
