import { test, expect } from '@playwright/test';

const adminPin = process.env.E2E_ADMIN_PIN || '123456';

async function signIn(page, username, pin) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`^${username}\\b`, 'i') }).click();
  await page.locator('#admin-pin').fill(pin);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(username === 'sita' ? /\/cashier\// : /\/admin\//);
}

test('admin retail sidebar uses the restaurant accordion, active links and a persistent compact rail', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await signIn(page, 'admin', adminPin);
  await expect(page.getByRole('heading', { name: 'Business at a glance' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Retail workspaces' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Billing' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'People' }).click();
  await expect(nav.getByRole('link', { name: 'Payroll' })).toBeVisible();
  await nav.getByRole('button', { name: 'Inventory' }).click();
  await expect(nav.getByRole('link', { name: 'Payroll' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Counts', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Counts', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/retail-stock-counts/);
  await expect(nav.getByRole('link', { name: 'Counts', exact: true })).toHaveAttribute('aria-current', 'page');
  const financeGroup = nav.getByRole('button', { name: 'Finance' });
  await financeGroup.focus();
  await page.keyboard.press('Enter');
  await expect(financeGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Business funding' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Counts', exact: true })).toHaveCount(0);
  expect(await nav.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.erp-sidebar')).toHaveCSS('width', '80px');
  await expect(nav.getByRole('link', { name: 'Counts', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.locator('.erp-sidebar')).toHaveCSS('width', '80px');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('.erp-sidebar')).toHaveCSS('width', '256px');
  await page.screenshot({ path: '.tmp/retail-sidebar-desktop.png', fullPage: false });
  await page.goto('/admin/accounts-payable');
  await expect(nav.getByRole('button', { name: 'Purchasing' })).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Payables' })).toHaveAttribute('aria-current', 'page');
});

test('cashier mobile drawer exposes permitted retail destinations and closes on navigation', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'sita', process.env.E2E_CASHIER_PIN || '7890');
  await expect(page.locator('.erp-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer).toBeVisible();
  const nav = drawer.getByRole('navigation', { name: 'Retail workspaces' });
  await expect(nav.getByRole('button', { name: 'Sell' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Control' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'General ledger' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Stock overview' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Sell' }).click();
  await expect(nav.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Billing' })).toBeVisible();
  await page.screenshot({ path: '.tmp/retail-sidebar-mobile.png', fullPage: false });
  await nav.getByRole('link', { name: 'Billing' }).click();
  await expect(page).toHaveURL(/\/cashier\/billing/);
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('inventory specialist sees stock destinations without finance or control links', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'admin', adminPin);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const username = `sidebar_inventory_${Date.now()}`;
  const pin = 'SidebarTest123';
  const created = await page.request.post('/api/admin/employees', { headers: { Authorization: `Bearer ${token}` },
    data: { username, full_name: 'Sidebar Inventory', role: 'inventory_staff', pin, is_active: true } });
  expect(created.status()).toBe(201);
  await page.evaluate(() => { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); });
  await signIn(page, username, pin);
  const nav = page.getByRole('navigation', { name: 'Retail workspaces' });
  await expect(nav.getByRole('button', { name: 'Inventory' })).toBeVisible();
  for (const group of ['Finance', 'Accounting', 'People']) await expect(nav.getByRole('button', { name: group })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Staff permissions' })).toHaveCount(0);
});
