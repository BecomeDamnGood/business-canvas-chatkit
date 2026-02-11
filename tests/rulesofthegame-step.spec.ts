import { test, expect } from '@playwright/test';
import { 
  clickContinue, 
  fillAndSend, 
  waitForResponse, 
  takeScreenshot,
  clickButtonContaining
} from './helpers';

test.describe('Rules of the Game Step', () => {
  async function navigateToRulesOfTheGame(page: any) {
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
    // Now should be on Rules of the Game step
    await expect(page.getByRole('textbox')).toBeVisible();
  }

  test('INTRO gate', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await takeScreenshot(page, 'rules-01-intro');

    const hasIntro = await page.getByText(/rules of the game|guidelines/i).isVisible().catch(() => false);
    expect(hasIntro).toBeTruthy();
  });

  test('EXPLAIN MORE (option 1)', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'Explain');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-02-explain-more');

    const hasExplanation = await page.getByText(/rules of the game|explain/i).isVisible().catch(() => false);
    expect(hasExplanation).toBeTruthy();
  });

  test('GIVE EXAMPLE (option 2)', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    await clickButtonContaining(page, 'example');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-03-give-example');

    const hasExample = await page.getByText(/example|rule|operational/i).isVisible().catch(() => false);
    expect(hasExample).toBeTruthy();
  });

  test('Multiple rules input (3+ rules)', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    // Add first rule
    await fillAndSend(page, 'We are always punctual');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-04-rule1');

    // Add second rule
    await fillAndSend(page, 'We are always warm and friendly');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-05-rule2');

    // Add third rule
    await fillAndSend(page, 'We focus on quality');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-06-rule3');

    // Should show all rules
    const hasAllRules = await page.getByText(/punctual|warm|quality/i).isVisible().catch(() => false);
    expect(hasAllRules).toBeTruthy();
  });

  test('Operational rule → abstract rule translation', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    // Provide operational rule
    await fillAndSend(page, 'We always start at 9:00');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-07-operational');

    // Should translate to abstract rule
    const hasAbstract = await page.getByText(/punctual|time|respect/i).isVisible().catch(() => false);
    expect(hasAbstract).toBeTruthy();
  });

  test('REFINE flow', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    await fillAndSend(page, 'We greet every client warmly');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-08-refine');

    // Should refine to broader rule
    const hasRefined = await page.getByText(/warm|friendly|refined/i).isVisible().catch(() => false);
    expect(hasRefined).toBeTruthy();
  });

  test('CONFIRM flow (met 3+ rules → continue button verschijnt)', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    // Add 3 rules
    await fillAndSend(page, 'We are always punctual');
    await waitForResponse(page);
    await fillAndSend(page, 'We are always warm and friendly');
    await waitForResponse(page);
    await fillAndSend(page, 'We focus on quality');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-09-3-rules-added');

    // Should show continue button when 3+ rules
    const continueBtn = page.getByRole('button').filter({ hasText: /continue to Presentation/i });
    const hasContinueBtn = await continueBtn.isVisible().catch(() => false);
    expect(hasContinueBtn).toBeTruthy();

    // Click continue
    await continueBtn.click();
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-10-continued-to-presentation');
  });

  test('ASK state met explain/example buttons', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    // Add one rule to get to ASK state
    await fillAndSend(page, 'We are always punctual');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-11-ask-state');

    // Should show explain/example buttons
    const explainBtn = page.getByRole('button').filter({ hasText: /explain/i });
    const exampleBtn = page.getByRole('button').filter({ hasText: /example/i });
    
    const hasExplain = await explainBtn.isVisible().catch(() => false);
    const hasExample = await exampleBtn.isVisible().catch(() => false);
    
    expect(hasExplain || hasExample).toBeTruthy();
  });

  test('eerste prompt gebruikt bedrijfsnaam in vraag', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    const prompt = page.locator('#prompt');
    await expect(prompt).toBeVisible();

    const text = (await prompt.textContent())?.trim() || '';
    expect(text.toLowerCase()).toContain('what are your rules of the game for');
    expect(text).toMatch(/TestCo/i);
  });

  test('ESCAPE routes', async ({ page }) => {
    await navigateToRulesOfTheGame(page);
    await waitForResponse(page);

    await fillAndSend(page, 'What is the weather?');
    await waitForResponse(page);
    await takeScreenshot(page, 'rules-12-escape');

    const escapeBtn = page.getByRole('button').filter({ hasText: /continue|finish later/i });
    await expect(escapeBtn.first()).toBeVisible();
  });
});
