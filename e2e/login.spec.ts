import { expect, test } from '@playwright/test';

test('shows the login screen on cold load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByTestId('login-submit')).toBeVisible();
  await expect(page.getByTestId('login-google')).toBeVisible();
});

test('login form accepts email input', async ({ page }) => {
  await page.goto('/');
  const email = page.getByTestId('login-email');
  await email.fill('alice@example.com');
  await expect(email).toHaveValue('alice@example.com');
});

test('unauthenticated /worlds redirects to /login', async ({ page }) => {
  await page.goto('/worlds');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('unauthenticated /worlds/:id/notes/:id redirects to /login', async ({ page }) => {
  await page.goto('/worlds/00000000-0000-0000-0000-000000000000/notes/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});
