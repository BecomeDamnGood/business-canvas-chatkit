import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Target Group Step', () => {
  async function navigateToTargetGroup(page: any) {
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
    await fillAndSend(page, 'Focus on strategic positioning');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Target Group step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToTargetGroup(page);
    await takeScreenshot(page, 'targetgroup-01-intro');

    const hasIntro = await page.getByText(/target group|audience|focus/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('EXPLAIN MORE (option 1)', async ({ page }) => {
    await navigateToTargetGroup(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'targetgroup-02-explain-more');

    const hasExplanation = await page.getByText(/target group|explain/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('ASK QUESTIONS (option 2)', async ({ page }) => {
    await navigateToTargetGroup(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'questions');
    await waitForResponse(page);
    await takeScreenshot(page, 'targetgroup-03-ask-questions');

    // Should show questions
    const hasQuestions = await page.getByText(/question|target/i).isVisible().catch(() => false);
    expect(hasQuestions).toBeTruthy();
  });

  test('POSTREFINE → CONFIRM/ASK QUESTIONS', async ({ page }) => {
    await navigateToTargetGroup(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Small businesses');
    await waitForResponse(page);
    await takeScreenshot(page, 'targetgroup-04-postrefine');

    // Should show refine options
    const hasRefineOptions = await page.getByText(/confirm|questions|refined/i).isVisible().catch(() => false);
    expect(hasRefineOptions).toBeTruthy();
  });

  test('CONFIRM flow', async ({ page }) => {
    await navigateToTargetGroup(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Purpose-driven companies in the Netherlands with significant marketing budgets');
    await waitForResponse(page);
    await takeScreenshot(page, 'targetgroup-05-confirm-input');

    await clickButtonContaining(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'targetgroup-06-confirmed');
  });
});
