import { test, expect } from '@playwright/test';
import { 
  clickIfVisible, 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonByIndex,
  clickButtonContaining
} from './helpers';

test.describe('Dream Step', () => {
  async function navigateToDream(page: any) {
    await page.goto('/test');
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await fillAndSend(page, 'Marketing agency TestCo');
    await waitForResponse(page);
    await clickContinue(page);
    await waitForResponse(page);
    // Now should be on Dream step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToDream(page);
    await takeScreenshot(page, 'dream-01-intro');

    // Should show intro message
    const hasIntro = await page.getByText(/dream|future|image/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('WHY DREAM MATTERS (option 1)', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Click "Tell me more about why a dream matters" or similar
    await clickButtonContaining(page, 'Tell me more');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-02-why-matters');

    // Should show explanation about why dream matters
    const hasExplanation = await page.getByText(/dream|future|image|ambassadors/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('DREAM SUGGESTIONS (option 1 → pick one)', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Click "Give me a few dream suggestions"
    await clickButtonContaining(page, 'dream suggestions');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-03-suggestions');

    // Should show dream suggestions
    const hasSuggestions = await page.getByText(/dream|suggestion/i).isVisible().catch(() => false);
    expect(hasSuggestions).toBeTruthy();

    // Pick one suggestion
    await clickButtonContaining(page, 'Pick one');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-04-picked-suggestion');
  });

  test('EXERCISE HANDSHAKE (DreamExplainer flow)', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Click exercise option
    await clickButtonContaining(page, 'exercise');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-05-exercise-start');

    // Should ask if ready to start exercise
    const hasReadyQuestion = await page.getByText(/ready|start|exercise/i).isVisible().catch(() => false);
    expect(hasReadyQuestion).toBeTruthy();

    // Confirm ready
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-06-exercise-confirmed');

    // Should trigger DreamExplainer (suggest_dreambuilder=true)
    // Note: Actual DreamExplainer UI testing would require more specific selectors
  });

  test('REFINE flow (operational → abstract)', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Provide operational dream
    await fillAndSend(page, 'We want to make 1 million in revenue');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-07-refine-operational');

    // Should refine to more abstract dream
    const hasRefined = await page.getByText(/dream|future|image/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();

    // Confirm refined version
    await clickButtonContaining(page, "I'm happy with this wording");
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-08-refine-confirmed');
  });

  test('CONFIRM flow', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Provide concrete dream
    await fillAndSend(page, 'A world where purpose-driven companies thrive and create meaningful impact.');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-09-confirm-input');

    // Should show confirmation question
    const hasConfirmation = await page.getByText(/capture|continue|purpose/i).isVisible().catch(() => false);
    expect(hasConfirmation).toBeTruthy();

    // Confirm
    await fillAndSend(page, 'Yes');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-10-confirmed');

    // Should proceed to Purpose
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('ESCAPE routes (continue/finish later)', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Send off-topic message
    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-11-escape-offtopic');

    // Should show escape menu
    const continueBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(continueBtn.first()).toBeVisible();

    // Click continue
    await clickButtonContaining(page, 'Continue Dream now');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-12-escape-continued');
  });

  test('Recap questions handling', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Ask for recap
    await fillAndSend(page, 'What have we discussed?');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-13-recap');

    // Should show recap
    const hasRecap = await page.getByText(/discussed|summary|recap/i).isVisible().catch(() => false);
    expect(hasRecap).toBeTruthy();
  });

  test('Direct dream input without menu', async ({ page }) => {
    await navigateToDream(page);
    await waitForResponse(page);

    // Type dream directly
    await fillAndSend(page, 'People everywhere have fair access to meaningful work and learning.');
    await waitForResponse(page);
    await takeScreenshot(page, 'dream-14-direct-input');

    // Should process and show confirmation or refine
    const hasResponse = await page.getByText(/dream|capture|continue/i).isVisible().catch(() => false);
    expect(hasResponse).toBeTruthy();
  });
});
