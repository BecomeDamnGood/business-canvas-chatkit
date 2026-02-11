import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Entity Step', () => {
  async function navigateToEntity(page: any) {
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
    await fillAndSend(page, 'Strategic partner and brand advisor');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Entity step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToEntity(page);
    await takeScreenshot(page, 'entity-01-intro');

    const hasIntro = await page.getByText(/entity|type|form/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('FORMULATE (option 1) → FORMULATE FOR ME', async ({ page }) => {
    await navigateToEntity(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Formulate');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-02-formulate');

    // Should show formulate option or ask for input
    const hasFormulate = await page.getByText(/formulate|entity/i).isVisible().catch(() => false);
    expect(hasFormulate).toBeTruthy();

    // Formulate for me
    await clickButtonContaining(page, 'Formulate for me');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-03-formulated');
  });

  test('EXPLAIN MORE (option 2)', async ({ page }) => {
    await navigateToEntity(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-04-explain-more');

    const hasExplanation = await page.getByText(/entity|explain/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('EXAMPLE → CONFIRM/REFINE', async ({ page }) => {
    await navigateToEntity(page);
    await waitForResponse(page);

    // Should show example or allow input
    await fillAndSend(page, 'B2B marketing agency');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-05-example-input');

    // Should show confirm or refine options
    const hasOptions = await page.getByText(/confirm|refine|continue/i).isVisible().catch(() => false);
    expect(hasOptions).toBeTruthy();
  });

  test('CONFIRM flow', async ({ page }) => {
    await navigateToEntity(page);
    await waitForResponse(page);

    await fillAndSend(page, 'B2B marketing agency');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-06-confirm-input');

    await clickButtonContaining(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-07-confirmed');
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToEntity(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'entity-08-escape');

    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
