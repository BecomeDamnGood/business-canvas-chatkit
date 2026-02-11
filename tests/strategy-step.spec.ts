import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Strategy Step', () => {
  async function navigateToStrategy(page: any) {
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
    await fillAndSend(page, 'B2B marketing agency');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Strategy step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToStrategy(page);
    await takeScreenshot(page, 'strategy-01-intro');

    const hasIntro = await page.getByText(/strategy|approach|way/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('EXPLAIN MORE (option 1)', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-02-explain-more');

    const hasExplanation = await page.getByText(/strategy|explain/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('ASK flow → ASK 3 QUESTIONS → GIVE EXAMPLES', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'questions');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-03-ask-questions');

    // Answer questions
    await fillAndSend(page, 'Focus on strategic positioning');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-04-answered');

    // Should eventually show examples or confirm
    const hasNext = await page.getByText(/example|continue|strategy/i).isVisible().catch(() => false);
    expect(hasNext).toBeTruthy();
  });

  test('REFINE flow', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'We do marketing');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-05-refine');

    const hasRefined = await page.getByText(/strategy|refined/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();
  });

  test('CONFIRM flow (satisfied → continue)', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Focus on strategic positioning and authentic storytelling');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-06-confirm-input');

    await clickButtonContaining(page, "I'm satisfied");
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-07-confirmed');
  });

  test('FINAL CONFIRM', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Focus on strategic positioning');
    await waitForResponse(page);
    await clickButtonContaining(page, "I'm satisfied");
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-08-final-confirm');

    // Should show final confirm button
    const hasFinalConfirm = await page.getByText(/continue|rules of the game/i).isVisible().catch(() => false);
    expect(hasFinalConfirm).toBeTruthy();
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToStrategy(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'strategy-09-escape');

    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
