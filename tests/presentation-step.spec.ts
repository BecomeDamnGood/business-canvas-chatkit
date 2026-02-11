import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Presentation Step', () => {
  async function navigateToPresentation(page: any) {
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
    await fillAndSend(page, 'Purpose-driven companies in the Netherlands');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    await fillAndSend(page, 'Brand strategy, creative campaigns');
    await waitForResponse(page);
    await clickButtonContaining(page, 'This is all what we offer');
    await waitForResponse(page);
    await fillAndSend(page, 'We are always punctual');
    await waitForResponse(page);
    await fillAndSend(page, 'We are always warm and friendly');
    await waitForResponse(page);
    await fillAndSend(page, 'We focus on quality');
    await waitForResponse(page);
    await clickButtonContaining(page, 'continue to Presentation');
    await waitForResponse(page);
    // Now should be on Presentation step
    await expect(page.locator('.card')).toBeVisible();
  }

  test('INTRO gate met recap', async ({ page }) => {
    await navigateToPresentation(page);
    await takeScreenshot(page, 'presentation-01-intro');

    // Should show recap
    const hasRecap = await page.getByText(/this is what you said|summary|recap/i).isVisible().catch(() => false);
    expect(hasRecap).toBeTruthy();

    // Should show all steps in recap
    const hasSteps = await page.getByText(/dream|purpose|strategy|target|products|rules/i).isVisible().catch(() => false);
    expect(hasSteps).toBeTruthy();
  });

  test('ASK state met menu', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-02-ask-state');

    // Should show menu option
    const hasMenu = await page.getByRole('button').filter({ hasText: /Create.*Presentation/i }).isVisible().catch(() => false);
    expect(hasMenu).toBeTruthy();
  });

  test('REFINE flow (change summary)', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);

    // Request change
    await fillAndSend(page, 'I want to change the strategy');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-03-refine-request');

    // Should ask what to change
    const hasChangeQuestion = await page.getByText(/change|adjust|which part/i).isVisible().catch(() => false);
    expect(hasChangeQuestion).toBeTruthy();

    // Provide change
    await fillAndSend(page, 'Change strategy to: Focus on digital transformation');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-04-refined');
  });

  test('CONFIRM flow (create presentation)', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);

    // Click create presentation button
    await clickButtonContaining(page, 'Create.*Presentation');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-05-confirm');

    // Should show confirmation question
    const hasConfirmation = await page.getByText(/satisfied|proceed|create/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();
  });

  test('PROCEED READINESS (YES)', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);
    await clickButtonContaining(page, 'Create.*Presentation');
    await waitForResponse(page);

    // Send YES
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-06-proceed-yes');

    // Should proceed (proceed_to_next=true)
    // Note: Actual presentation creation would happen here
  });

  test('PROCEED READINESS (NO)', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);
    await clickButtonContaining(page, 'Create.*Presentation');
    await waitForResponse(page);

    // Send NO
    await fillAndSend(page, 'No');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-07-proceed-no');

    // Should ask what to adjust
    const hasAdjustQuestion = await page.getByText(/adjust|change|what/i).isVisible().catch(() => false);
    expect(hasAdjustQuestion).toBeTruthy();
  });

  test('PROCEED READINESS (AMBIGUOUS)', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);
    await clickButtonContaining(page, 'Create.*Presentation');
    await waitForResponse(page);

    // Send ambiguous response
    await fillAndSend(page, 'Maybe');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-08-proceed-ambiguous');

    // Should ask to clarify
    const hasClarify = await page.getByText(/choose|clarify|proceed|change/i).isVisible().catch(() => false);
    expect(hasClarify).toBeTruthy();
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToPresentation(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'presentation-09-escape');

    // Should show escape menu
    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
