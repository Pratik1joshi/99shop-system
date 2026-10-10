import { test, expect } from '@playwright/test';

test('commerce workspaces remain usable across retail screen sizes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await expect(page.getByText('Signing in as admin')).toBeVisible();
  await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN || 'KmTestOnly123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [route, title] of [['/admin/billing', 'Billing'], ['/admin/products', 'Products'], ['/admin/retail-sales-history', 'Sales']]) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${route} at ${viewport.width}px should not overflow the page` }).toBeLessThanOrEqual(1);
    }
  }
});
