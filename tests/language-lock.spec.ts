import { test, expect } from '@playwright/test';

test('language stays consistent after Start', async ({ page }) => {
  await page.goto('/test');

  // Start click
  await page.getByRole('button', { name: 'Start' }).click();

  // Check that UI is still English at this point
  await expect(page.getByText('Step 1: Validation & Business Name')).toBeVisible();

  // Type an English message and submit
  await page.getByRole('textbox').fill('I help entrepreneurs with the best tools the market knows.');
  await page.getByRole('button', { name: 'Send' }).click();

  // Expect no sudden switch to German UI labels (we check EN label still present)
  await expect(page.getByText('Step 1: Validation & Business Name')).toBeVisible();
});
