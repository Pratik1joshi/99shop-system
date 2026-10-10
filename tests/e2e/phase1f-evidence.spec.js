import { test, expect } from '@playwright/test';

test('customer correction drills through paginated source evidence into a balanced journal', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const suffix = Date.now();
  const created = await page.request.post('/api/admin/customers', { headers, data: { name: `Evidence ${suffix}`, phone: `96${String(suffix).slice(-8)}` } });
  expect(created.status()).toBe(201);
  const customer = (await created.json()).customer;
  const correction = await page.request.post(`/api/admin/customers/${customer.id}/store-credit/adjust`, { headers,
    data: { amount: 25, reason: 'Evidence correction', idempotency_key: `phase1f-${suffix}` } });
  expect(correction.status(), await correction.text()).toBe(200);
  const transaction = (await correction.json()).transactionId;
  const timeline = await page.request.get(`/api/admin/retail-customers/${customer.id}/timeline`, { headers });
  expect(timeline.status()).toBe(200);
  expect((await timeline.json()).events.find(event => event.source_type === 'store_credit' && Number(event.id) === Number(transaction))).toBeTruthy();
  await page.goto(`/admin/retail-customers/${customer.id}`);
  const section = page.getByRole('region', { name: 'Commerce timeline' });
  await expect(section.getByText(/Store Credit Correction/)).toBeVisible();
  await section.locator(`#timeline-store_credit-${transaction}`).getByRole('link', { name: 'View source' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/timeline_source=store_credit/);
  await expect(page.getByRole('link', { name: 'Show complete timeline' })).toBeVisible();
  const entries = await page.request.get('/api/admin/ledger?view=journal', { headers });
  const journal = (await entries.json()).journals.find((row) => row.source_type === 'store_credit_adjustment' && Number(row.source_id) === Number(transaction));
  expect(journal).toBeTruthy();
  await page.goto(`/admin/retail-journals/${journal.id}`);
  await expect(page.getByRole('heading', { name: `Journal #${journal.id}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Store Credit Correction #${transaction}` })).toBeVisible();
  await expect(page.getByText('Evidence correction', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounting effect' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.commerce-tmp/phase1f/journal-${testInfo.project.name}.png`, fullPage: true });
});
