// TASK-056 browser + accessibility QA against the Docker demo stack.
//
// The stack (frontend + backend + worker + PostgreSQL, all synthetic) is started
// by CI before Playwright runs. These journeys exercise the real keyboard and
// mobile surfaces a customer uses, and axe scans gate serious/critical WCAG
// A/AA violations. No production data or external services are involved.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

let bookingSlug = '';

async function expectNoSeriousViolations(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical');
  const summary = serious.map((violation) => ({
    id: violation.id, impact: violation.impact,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));
  expect(summary, `${label}: serious/critical axe violations`).toEqual([]);
}

async function tabUntilFocused(page, locator, limit = 30) {
  for (let presses = 0; presses < limit; presses += 1) {
    await page.keyboard.press('Tab');
    const focused = await locator
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (focused) return true;
  }
  return false;
}

async function signIn(page, surface) {
  await page.goto(surface === 'company' ? '/admin/login' : '/login');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(surface === 'company' ? /\/admin(\?|$)/ : /\/salon(\?|$)/);
}

test.describe.configure({ mode: 'serial' });

test('staff sign-in is keyboard-only; skip link and nav work from the keyboard', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expectNoSeriousViolations(page, '/login');

  const email = page.locator('input[name="email"]');
  expect(await tabUntilFocused(page, email), 'email field reachable by Tab').toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('input[name="password"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/salon(\?|$)/);
  await expect(page.getByRole('heading', { name: /Welcome to/ })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-main')).toBeFocused();

  await page.goto('/salon');
  const overview = page.getByRole('navigation', { name: 'Salon navigation' })
    .getByRole('link', { name: 'Overview' });
  expect(await tabUntilFocused(page, overview, 12), 'sidebar nav reachable by Tab').toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const appointments = page.getByRole('navigation', { name: 'Salon navigation' })
    .getByRole('link', { name: 'Appointments' });
  await expect(appointments).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/appointments(\?|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page, '/appointments');
});

test('platform admin signs in and stays on the admin surface', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  await expectNoSeriousViolations(page, '/admin/login');
  await signIn(page, 'company');
  await expect(page.getByText('PLATFORM ADMIN', { exact: true })).toBeVisible();

  await page.goto('/salon');
  await page.waitForURL(/\/login(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('guided setup opens bookings; public page passes axe with a mobile layout', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Finish setting up your salon/ })).toBeVisible();

  // Complete the owner-declared steps the demo seed leaves pending. The public
  // page refuses bookings until hours, services and the booking link are done.
  for (let clicks = 0; clicks < 6; clicks += 1) {
    const mark = page.getByRole('button', { name: 'Mark as done' }).first();
    if (await mark.count() === 0) break;
    await mark.click();
    await expect(page.getByRole('status').filter({ hasText: /marked as done/i })).toBeVisible();
  }
  await expect(page.getByText(/open and accepting bookings/i)).toBeVisible();
  await expectNoSeriousViolations(page, '/settings');

  const preview = page.getByRole('link', { name: /Preview public booking page/ });
  await expect(preview).toBeVisible();
  const href = await preview.getAttribute('href');
  bookingSlug = decodeURIComponent(href.split('/book/')[1] || '');
  expect(bookingSlug).not.toBe('');
  await preview.click();
  await page.waitForURL(/\/book\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Choose a service and time/ })).toBeVisible();
  await expectNoSeriousViolations(page, '/book/<slug>');
  await expect(page.locator('.slot-button').first()).toBeVisible();
});

test.describe('public booking on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a visitor books the first available slot and gets a receipt', async ({ page }) => {
    expect(bookingSlug, 'setup journey must publish the slug first').not.toBe('');
    await page.goto(`/book/${encodeURIComponent(bookingSlug)}`);
    await expect(page.getByRole('heading', { name: /Choose a service and time/ })).toBeVisible();

    const firstSlot = page.locator('.slot-button').first();
    await expect(firstSlot).toBeVisible();
    const box = await firstSlot.boundingBox();
    expect(box.height, 'slot targets are at least 44px tall').toBeGreaterThanOrEqual(44);
    await firstSlot.click();

    await expect(page.getByRole('heading', { name: 'Complete your booking' })).toBeVisible();
    await page.locator('#booker-name').fill('QA Mobile Booker');
    await page.locator('#booker-email').fill('qa-mobile-booker@example.invalid');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Confirm booking/ }).click();

    const receipt = page.locator('.receipt').first();
    await expect(receipt.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal overflow at 390px').toBeLessThanOrEqual(1);
  });
});
