import { test, expect } from '@playwright/test';

test('real Retail specialists see their workspace and are denied unrelated financial APIs', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const ownerToken = await page.evaluate(() => localStorage.getItem('pos_token'));
  const suffix = Date.now();
  const pin = 'StaffTestOnly123';
  const people = [
    { role: 'inventory_staff', username: `inventory_${suffix}`, landing: /\/admin\/retail-inventory$/, heading: 'Inventory', allowed: '/api/admin/retail-inventory/workspace?page_size=2', denied: '/api/admin/accounts-payable' },
    { role: 'purchasing_staff', username: `purchasing_${suffix}`, landing: /\/admin\/retail-purchase-orders$/, heading: 'Purchase Orders', allowed: '/api/admin/retail-purchase-orders?page_size=2', denied: '/api/admin/ledger' },
    { role: 'accountant', username: `accountant_${suffix}`, landing: /\/admin\/retail-finance$/, heading: 'Money and accounts', allowed: '/api/admin/retail-finance', denied: '/api/admin/retail-inventory-adjustments' },
    { role: 'manager', username: `manager_${suffix}`, landing: /\/admin\/dashboard$/, heading: 'Business at a glance', allowed: '/api/admin/retail-overview', denied: '/api/admin/employees' },
  ];
  for (const person of people) {
    const created = await page.request.post('/api/admin/employees', { headers: { Authorization: `Bearer ${ownerToken}` },
      data: { username: person.username, full_name: person.username, role: person.role, pin, is_active: true } });
    expect(created.status()).toBe(201);
  }
  for (const person of people) {
    await page.evaluate(() => { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); });
    await page.goto('/login');
    await page.getByRole('button', { name: person.username }).click();
    await page.locator('#admin-pin').fill(pin);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(person.landing);
    await expect(page.getByRole('heading', { name: person.heading }).first()).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('pos_token'));
    const allowed = await page.request.get(person.allowed, { headers: { Authorization: `Bearer ${token}` } });
    expect(allowed.status()).toBe(200);
    const denied = await page.request.get(person.denied, { headers: { Authorization: `Bearer ${token}` } });
    expect(denied.status(), `${person.role}: ${person.denied}`).toBe(403);
    if (person.role === 'accountant') {
      const reconciliation = await page.request.get('/api/admin/retail-reconciliation', { headers: { Authorization: `Bearer ${token}` } });
      expect(reconciliation.status()).toBe(200);
      for (const source of ['/api/admin/ledger?view=journal', '/api/admin/financial-reports?report=trial-balance',
        '/api/admin/accounts-payable', '/api/admin/bank?page_size=2', '/api/admin/retail-sales?page_size=2']) {
        const result = await page.request.get(source, { headers: { Authorization: `Bearer ${token}` } });
        expect(result.status(), `Accountant must be able to trace ${source}: ${await result.text()}`).toBe(200);
      }
      const settings = await page.request.get('/api/admin/retail-loyalty/settings', { headers: { Authorization: `Bearer ${token}` } });
      expect(settings.status()).toBe(403);
    }
  }
});
