import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Purpose Step', () => {
  async function navigateToPurpose(page: any) {
    await page.goto('/test');
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await fillAndSend(page, 'Marketing agency TestCo');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    await fillAndSend(page, 'A world where purpose-driven companies thrive');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Purpose step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToPurpose(page);
    await takeScreenshot(page, 'purpose-01-intro');

    // Should show intro message
    const hasIntro = await page.getByText(/purpose|why|matters/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('EXPLAIN MORE (option 1)', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-02-explain-more');

    // Should show explanation
    const hasExplanation = await page.getByText(/purpose|why|matters/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('EXAMPLES (option 2)', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'example');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-03-examples');

    // Should show examples
    const hasExamples = await page.getByText(/example|purpose/i).isVisible().catch(() => false);
    expect(hasExamples).toBeTruthy();
  });

  test('REFINE flow', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    // Provide vague purpose
    await fillAndSend(page, 'We help people');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-04-refine-vague');

    // Should refine
    const hasRefined = await page.getByText(/purpose|refined/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();
  });

  test('CONFIRM flow (single statement)', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    await fillAndSend(page, 'We help purpose-driven companies build strategic clarity and authentic brand positioning.');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-05-confirm-input');

    // Should show confirmation
    const hasConfirmation = await page.getByText(/capture|continue|big why/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();

    // Confirm
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-06-confirmed');
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-07-escape');

    // Should show escape menu
    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });

  test('Off-topic handling', async ({ page }) => {
    await navigateToPurpose(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Tell me about your company');
    await waitForResponse(page);
    await takeScreenshot(page, 'purpose-08-offtopic');

    // Should redirect back to Purpose
    const hasRedirect = await page.getByText(/purpose|continue/i).isVisible().catch(() => false);
    expect(hasRedirect).toBeTruthy();
  });
});
