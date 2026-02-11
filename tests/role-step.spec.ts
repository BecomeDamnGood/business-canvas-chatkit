import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Role Step', () => {
  async function navigateToRole(page: any) {
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
    await fillAndSend(page, 'We help purpose-driven companies build strategic clarity');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    await fillAndSend(page, 'Because businesses with clear purpose create lasting value');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Role step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToRole(page);
    await takeScreenshot(page, 'role-01-intro');

    const hasIntro = await page.getByText(/role|position|function/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('GIVE EXAMPLES (option 1) → CHOOSE FOR ME', async ({ page }) => {
    await navigateToRole(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'example');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-02-examples');

    // Should show examples
    const hasExamples = await page.getByText(/example|role/i).isVisible().catch(() => false);
    expect(hasExamples).toBeTruthy();

    // Choose for me
    await clickButtonContaining(page, 'Choose for me');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-03-chosen');
  });

  test('EXPLAIN MORE (option 2)', async ({ page }) => {
    await navigateToRole(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-04-explain-more');

    const hasExplanation = await page.getByText(/role|explain/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('REFINE flow', async ({ page }) => {
    await navigateToRole(page);
    await waitForResponse(page);

    await fillAndSend(page, 'We do marketing');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-05-refine');

    const hasRefined = await page.getByText(/role|refined/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();
  });

  test('CONFIRM flow', async ({ page }) => {
    await navigateToRole(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Strategic partner and brand advisor');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-06-confirm-input');

    const hasConfirmation = await page.getByText(/capture|continue|entity/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();

    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-07-confirmed');
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToRole(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'role-08-escape');

    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
