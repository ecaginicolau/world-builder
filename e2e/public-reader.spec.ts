import { expect, test } from '@playwright/test';

test('public reader URL with bad token shows error, not login redirect', async ({ page }) => {
  // Reader routes must NOT trip the auth redirect even when there's no session.
  await page.goto('/r/badtokenbadtokenbadtokenbadtoken');
  // We expect to land on the reader shell with an error, not be bounced to /login.
  await expect(page).toHaveURL(/\/r\/badtoken/);
  await expect(page.getByTestId('reader-link-error')).toBeVisible();
});

test('public reader chapter URL with bad token shows error', async ({ page }) => {
  await page.goto('/r/badtokenbadtokenbadtokenbadtoken/c/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/r\/badtoken/);
  await expect(page.getByTestId('reader-chapter-error')).toBeVisible();
});
