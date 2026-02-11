import { Page, expect } from '@playwright/test';

/**
 * Click a button if it's visible
 */
export async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name });
  if (await btn.isVisible()) {
    await btn.click();
    return true;
  }
  return false;
}

/**
 * Intelligently detect and click continue buttons
 */
export async function clickContinue(page: Page): Promise<boolean> {
  const continueButtons = [
    'Continue',
    'Go to next step',
    "I'm happy with this formulation, continue to the Purpose step",
    "I'm happy with this formulation, continue to the Big Why step",
    "I'm happy with this formulation, continue to the Role step",
    "I'm happy with this formulation, continue to the Entity step",
    "I'm happy with this formulation, continue to the Strategy step",
    "I'm happy with this formulation, continue to the Target Group step",
    "I'm happy with this formulation, continue to the Products and Services step",
    "I'm happy with this formulation, continue to the Rules of the Game step",
    "These are my Rules of the Games, continue to Presentation.",
    "These are all my rules of the game, continue to Presenation",
    "These are all my rules of the game, continue to Presentation",
    "Create the Business Strategy Canvas Presentation",
    "I'm satisfied with my Strategy. Let's go to Rules of the Game",
    "I'm happy with this wording, please continue to step 3 Purpose",
    "I'm happy with this wording, continue to step 5 Role",
    "This is all what we offer, continue to step Rules of the Game"
  ];
  
  for (const btnText of continueButtons) {
    if (await clickIfVisible(page, btnText)) {
      await waitForResponse(page, 500);
      return true;
    }
  }
  return false;
}

/**
 * Wait for server response
 */
export async function waitForResponse(page: Page, timeout: number = 2000): Promise<void> {
  await page.waitForTimeout(timeout);
}

/**
 * Fill textbox and send
 */
export async function fillAndSend(page: Page, text: string): Promise<void> {
  const textbox = page.getByRole('textbox');
  await expect(textbox).toBeVisible();
  await textbox.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await waitForResponse(page);
}

/**
 * Get all visible buttons on the page
 */
export async function getAllButtons(page: Page): Promise<string[]> {
  const buttons = await page.locator('button').all();
  const labels: string[] = [];
  for (const btn of buttons) {
    if (await btn.isVisible()) {
      const text = await btn.textContent();
      if (text) labels.push(text.trim());
    }
  }
  return labels;
}

/**
 * Take screenshot with consistent naming
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ 
    path: `tests/screenshots/${name}.png`, 
    fullPage: true 
  });
}

/**
 * Click button by index in choice menu
 */
export async function clickButtonByIndex(page: Page, index: number): Promise<boolean> {
  const buttons = page.locator('.choiceBtn');
  const count = await buttons.count();
  if (index >= 0 && index < count) {
    await buttons.nth(index).click();
    await waitForResponse(page);
    return true;
  }
  return false;
}

/**
 * Click button by text (partial match)
 */
export async function clickButtonContaining(page: Page, text: string): Promise<boolean> {
  const button = page.getByRole('button').filter({ hasText: text });
  if (await button.isVisible()) {
    await button.click();
    await waitForResponse(page);
    return true;
  }
  return false;
}

/**
 * Wait for text to appear on page
 */
export async function waitForText(page: Page, text: string, timeout: number = 5000): Promise<void> {
  await expect(page.getByText(text)).toBeVisible({ timeout });
}

/**
 * Check if text is visible
 */
export async function isTextVisible(page: Page, text: string): Promise<boolean> {
  try {
    return await page.getByText(text).isVisible();
  } catch {
    return false;
  }
}

/**
 * Get current step from page
 */
export async function getCurrentStep(page: Page): Promise<string | null> {
  try {
    const stepText = await page.locator('[class*="step"], [id*="step"]').first().textContent();
    return stepText?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Wait for loading to complete
 */
export async function waitForLoading(page: Page): Promise<void> {
  // Wait for loading indicator to disappear if present
  const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"]');
  if (await loadingIndicator.isVisible()) {
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
  }
  await waitForResponse(page, 500);
}
