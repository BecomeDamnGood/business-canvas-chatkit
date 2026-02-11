import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Products and Services Step', () => {
  async function navigateToProductsServices(page: any) {
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
    // Now should be on Products and Services step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('Input flow met meerdere items', async ({ page }) => {
    await navigateToProductsServices(page);
    await takeScreenshot(page, 'productsservices-01-intro');

    await fillAndSend(page, 'Brand strategy, creative campaigns, digital design');
    await waitForResponse(page);
    await takeScreenshot(page, 'productsservices-02-input-multiple');

    // Should show all items
    const hasItems = await page.getByText(/brand|creative|digital|strategy/i).isVisible().catch(() => false);
    expect(hasItems).toBeTruthy();
  });

  test('CONFIRM flow ("This is all what we offer")', async ({ page }) => {
    await navigateToProductsServices(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Brand strategy, creative campaigns, digital design, visual identity');
    await waitForResponse(page);
    await takeScreenshot(page, 'productsservices-03-confirm-input');

    // Click confirm button
    await clickButtonContaining(page, 'This is all what we offer');
    await waitForResponse(page);
    await takeScreenshot(page, 'productsservices-04-confirmed');

    // Should continue to Rules of the Game
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('Continue naar Rules of the Game', async ({ page }) => {
    await navigateToProductsServices(page);
    await waitForResponse(page);

    await fillAndSend(page, 'Brand strategy, creative campaigns');
    await waitForResponse(page);
    await clickButtonContaining(page, 'This is all what we offer');
    await waitForResponse(page);
    await takeScreenshot(page, 'productsservices-05-continued');

    // Should be on Rules of the Game step
    const hasRulesStep = await page.getByText(/rules of the game/i).isVisible().catch(() => false);
    expect(hasRulesStep).toBeTruthy();
  });
});
