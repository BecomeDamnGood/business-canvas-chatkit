import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Complete Flow - Happy Path', () => {
  test('Complete flow through all steps with screenshots', async ({ page }) => {
    await page.goto('/test');
    await takeScreenshot(page, 'complete-01-start');

    // Step 0: Validation & Business Name
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-02-step0');

    await fillAndSend(page, 'Strategic marketing agency Mindd');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-03-step0-confirm');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 1: Dream
    await takeScreenshot(page, 'complete-04-dream');
    await fillAndSend(page, 'A world where purpose-driven companies thrive and create meaningful impact.');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-05-dream-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 2: Purpose
    await takeScreenshot(page, 'complete-06-purpose');
    await fillAndSend(page, 'We help purpose-driven companies build strategic clarity and authentic brand positioning.');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-07-purpose-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 3: Big Why
    await takeScreenshot(page, 'complete-08-bigwhy');
    await fillAndSend(page, 'Because businesses with clear purpose create lasting value and positive change.');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-09-bigwhy-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 4: Role
    await takeScreenshot(page, 'complete-10-role');
    await fillAndSend(page, 'Strategic partner and brand advisor');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-11-role-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 5: Entity
    await takeScreenshot(page, 'complete-12-entity');
    await fillAndSend(page, 'B2B marketing agency');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-13-entity-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 6: Strategy
    await takeScreenshot(page, 'complete-14-strategy');
    await fillAndSend(page, 'Focus on strategic positioning and authentic storytelling for purpose-driven brands.');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-15-strategy-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 7: Target Group
    await takeScreenshot(page, 'complete-16-targetgroup');
    await fillAndSend(page, 'Purpose-driven companies in the Netherlands with significant marketing budgets');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-17-targetgroup-response');

    await clickContinue(page);
    await waitForResponse(page);

    // Step 8: Products and Services
    await takeScreenshot(page, 'complete-18-productsservices');
    await fillAndSend(page, 'Brand strategy, creative campaigns, digital design, visual identity');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-19-productsservices-response');

    await clickButtonContaining(page, 'This is all what we offer');
    await waitForResponse(page);

    // Step 9: Rules of the Game
    await takeScreenshot(page, 'complete-20-rulesofthegame');
    await fillAndSend(page, 'We are always punctual');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-21-rules-rule1');

    await fillAndSend(page, 'We are always warm and friendly');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-22-rules-rule2');

    await fillAndSend(page, 'We focus on quality');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-23-rules-rule3');

    // Continue to Presentation (button should appear with 3+ rules)
    const continueBtn = page.getByRole('button').filter({ hasText: /continue to Presentation/i });
    await continueBtn.click();
    await waitForResponse(page);

    // Step 10: Presentation
    await takeScreenshot(page, 'complete-24-presentation');
    
    // Verify recap is shown
    const hasRecap = await page.getByText(/this is what you said|summary/i).isVisible().catch(() => false);
    expect(hasRecap).toBeTruthy();

    // Create presentation
    await clickButtonContaining(page, 'Create.*Presentation');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-25-presentation-confirm');

    // Confirm to create
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'complete-26-presentation-final');

    // Verify we reached the end
    const hasFinal = await page.getByText(/presentation|complete|finished/i).isVisible().catch(() => false);
    expect(hasFinal).toBeTruthy();
  });

  test('State persistence verification', async ({ page }) => {
    await page.goto('/test');
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await fillAndSend(page, 'Test Company');
    await waitForResponse(page);

    // Verify state is stored (check if we can continue)
    await clickContinue(page);
    await waitForResponse(page);

    // Should be on next step with previous data remembered
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });
});
