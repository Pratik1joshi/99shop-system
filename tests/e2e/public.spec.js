import { test, expect } from '@playwright/test';

test.describe('Public storefront', () => {
  test('home renders the shop identity and contact links', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto('/');
    await expect(page).toHaveTitle(/99 Shop/i);
    await expect(page.getByText('99 Shop').first()).toBeVisible();

    const wa = page.getByRole('link', { name: /WhatsApp/i }).first();
    await expect(wa).toHaveAttribute('href', /wa\.me\/9779767896814/);

    const call = page.locator('a[href^="tel:+9779767896814"]:visible').first();
    await expect(call).toBeVisible();

    expect(errors.filter((e) => !/Failed to load resource|404/.test(e)), `console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('about, contact and categories pages load', async ({ page }) => {
    for (const [path, title] of [
      ['/about', /About 99 Shop/i],
      ['/contact', /Contact & Ordering/i],
      ['/categories', /All categories/i],
    ]) {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('no horizontal overflow on mobile home', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });

  test('staff pages require login when signed out', async ({ page }) => {
    for (const route of ['/admin/dashboard', '/cashier/dashboard']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
