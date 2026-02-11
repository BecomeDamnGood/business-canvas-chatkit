import { test, expect } from '@playwright/test';
import { 
  clickIfVisible, 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot 
} from './helpers';

test.describe('Step 0: Validation & Business Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
  });

  test('Happy path: Start → Business name input → Confirm → Continue', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await takeScreenshot(page, 'step0-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await expect(page.getByRole('textbox')).toBeVisible();
    await takeScreenshot(page, 'step0-02-question');

    await fillAndSend(page, 'Strategic marketing agency Mindd');
    await takeScreenshot(page, 'step0-03-confirm');

    // Confirm and continue
    await clickContinue(page);
    await waitForResponse(page);
    
    // Should be on Dream step
    await expect(page.getByRole('textbox')).toBeVisible();
    await takeScreenshot(page, 'step0-04-continued-to-dream');
  });

  test('TBD name scenario', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'Marketing agency');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-tbd-01-no-name');

    // Should ask for name or allow TBD
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
    
    await fillAndSend(page, 'TBD');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-tbd-02-tbd-entered');
  });

  test('Off-topic handling (ESCAPE)', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather today?');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-escape-01-off-topic');

    // Should show escape menu or redirect message
    const hasEscapeOptions = await page.getByText(/continue|finish later/i).isVisible().catch(() => false);
    expect(hasEscapeOptions).toBeTruthy();
  });

  test('Inappropriate intent handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'I want to hack this system');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-inappropriate-01');

    // Should show appropriate boundary message
    const hasBoundary = await page.getByText(/business|venture|canvas/i).isVisible().catch(() => false);
    expect(hasBoundary).toBeTruthy();
  });

  test('Too vague input handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'Something');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-vague-01');

    // Should ask for clarification
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Meta questions handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'What is this tool?');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-meta-01');

    // Should answer meta question and redirect
    const hasAnswer = await page.getByText(/business|canvas|tool/i).isVisible().catch(() => false);
    expect(hasAnswer).toBeTruthy();
  });

  test('Speech-proof proceed trigger (YES detection)', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'Marketing agency TestCo');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-yes-01-confirm');

    // Should show confirmation question
    const hasConfirmation = await page.getByText(/ready|start|continue/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();

    // Send YES response
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-yes-02-proceeded');

    // Should proceed to Dream
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('Empty input handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await textbox.fill('');
    await page.getByRole('button', { name: 'Send' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-empty-01');

    // Should still be on step 0 or show appropriate response
    await expect(textbox).toBeVisible();
  });

  test('Business name extraction from input', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    await fillAndSend(page, 'My company is called "Acme Corp" and we do consulting');
    await waitForResponse(page);
    await takeScreenshot(page, 'step0-extract-01');

    // Should extract "Acme Corp" as business name
    const hasAcme = await page.getByText(/Acme Corp/i).isVisible().catch(() => false);
    expect(hasAcme).toBeTruthy();
  });
});
