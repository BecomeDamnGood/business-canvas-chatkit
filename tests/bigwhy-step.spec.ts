import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining,
  clickButtonByIndex
} from './helpers';

test.describe('Big Why Step', () => {
  async function navigateToBigWhy(page: any) {
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
    // Now should be on Big Why step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToBigWhy(page);
    await takeScreenshot(page, 'bigwhy-01-intro');

    const hasIntro = await page.getByText(/big why|meaning|roof/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('GIVE EXAMPLE (option 1) → REFINE → CONFIRM', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'example');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-02-example');

    // Should show example Big Why
    const hasExample = await page.getByText(/big why|should be/i).isVisible().catch(() => false);
    expect(hasExample).toBeTruthy();

    // Confirm example
    await clickButtonContaining(page, "I'm happy with this wording");
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-03-example-confirmed');
  });

  test('EXPLAIN IMPORTANCE (option 2) → 3 opties menu', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'importance');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-04-explain-importance');

    // Should show 3-option menu
    const buttons = await page.locator('.choiceBtn').count();
    expect(buttons).toBeGreaterThanOrEqual(2);
  });

  test('ASK 3 QUESTIONS (option 1) → alle 3 vragen doorlopen', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, '3 tough questions');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-05-question1');

    // Answer first question
    await fillAndSend(page, 'People deserve fair opportunities');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-06-question2');

    // Answer second question
    await fillAndSend(page, 'A fairer future where everyone can thrive');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-07-question3');

    // Answer third question
    await fillAndSend(page, 'We would prioritize fairness in all decisions');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-08-all-questions-answered');
  });

  test('GIVE 3 EXAMPLES (option 2)', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'importance');
    await waitForResponse(page);
    await clickButtonContaining(page, '3 examples');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-09-3-examples');

    // Should show 3 examples
    const hasExamples = await page.getByText(/example|should be/i).isVisible().catch(() => false);
    expect(hasExamples).toBeTruthy();
  });

  test('REFINE flow (policy → meaning-layer)', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    // Provide policy-level input
    await fillAndSend(page, 'We refuse unethical clients');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-10-refine-policy');

    // Should refine to meaning-layer
    const hasRefined = await page.getByText(/should be|meaning|world/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();
  });

  test('REDEFINE flow (option 2)', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'example');
    await waitForResponse(page);
    await clickButtonContaining(page, 'Redefine');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-11-redefine');

    // Should show different Big Why
    const hasNewExample = await page.getByText(/big why|should be/i).isVisible().catch(() => false);
    expect(hasNewExample).toBeTruthy();
  });

  test('CONFIRM flow', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Because businesses with clear purpose create lasting value');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-12-confirm-input');

    // Should show confirmation
    const hasConfirmation = await page.getByText(/capture|continue|role/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();

    // Confirm
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-13-confirmed');
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToBigWhy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'bigwhy-14-escape');

    // Should show escape menu
    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
