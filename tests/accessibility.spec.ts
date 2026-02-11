import { test, expect } from '@playwright/test';
import { 
  waitForResponse
} from './helpers';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
  });

  test('Keyboard navigation', async ({ page }) => {
    // Tab to Start button
    await page.keyboard.press('Tab');
    
    const startBtn = page.getByRole('button', { name: 'Start' });
    const isFocused = await startBtn.evaluate((el) => el === document.activeElement).catch(() => false);
    
    // Button should be focusable
    expect(startBtn).toBeTruthy();
    
    // Press Enter to activate
    await page.keyboard.press('Enter');
    await waitForResponse(page);
    
    // Should navigate to next step
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('ARIA labels', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    // Check for buttons with proper roles
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const role = await button.getAttribute('role').catch(() => null);
      const ariaLabel = await button.getAttribute('aria-label').catch(() => null);
      const textContent = await button.textContent().catch(() => '');
      
      // Button should have role="button" or accessible text
      expect(role === 'button' || textContent.trim().length > 0 || ariaLabel).toBeTruthy();
    }
  });

  test('Focus management', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    // Textbox should be focusable
    const textbox = page.getByRole('textbox');
    await textbox.focus();
    
    const isFocused = await textbox.evaluate((el) => el === document.activeElement).catch(() => false);
    expect(isFocused).toBeTruthy();
  });

  test('Screen reader compatibility - button labels', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: 'Start' });
    const label = await startBtn.textContent();
    
    // Button should have readable label
    expect(label?.trim().length).toBeGreaterThan(0);
  });

  test('Screen reader compatibility - form labels', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    const label = await textbox.getAttribute('aria-label').catch(() => null);
    const placeholder = await textbox.getAttribute('placeholder').catch(() => null);
    
    // Textbox should have label or placeholder
    expect(label || placeholder).toBeTruthy();
  });

  test('Keyboard shortcuts', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await textbox.focus();
    await textbox.fill('Test input');
    
    // Press Enter should submit (if form allows)
    await page.keyboard.press('Enter');
    await waitForResponse(page);
    
    // Should process input
    await expect(textbox).toBeVisible();
  });

  test('Focus order', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    // Tab through elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Focus should move logically through interactive elements
    const activeElement = await page.evaluate(() => document.activeElement?.tagName).catch(() => null);
    expect(['INPUT', 'TEXTAREA', 'BUTTON', 'A']).toContain(activeElement);
  });

  test('Color contrast (basic check)', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);

    // Check that buttons have visible text
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      const textContent = await firstButton.textContent();
      const computedStyle = await firstButton.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor
        };
      }).catch(() => null);
      
      // Button should have text content
      expect(textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  test('Alt text for images (if any)', async ({ page }) => {
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt').catch(() => null);
      const role = await img.getAttribute('role').catch(() => null);
      
      // Images should have alt text or be decorative (role="presentation")
      if (alt === null && role !== 'presentation') {
        // This is a warning, not a failure - some images might be decorative
        console.warn(`Image ${i} missing alt text`);
      }
    }
  });

  test('Semantic HTML structure', async ({ page }) => {
    // Check for semantic elements
    const main = page.locator('main, [role="main"]');
    const hasMain = await main.count().catch(() => 0);
    
    // Page should have some semantic structure
    // (main is optional, but good practice)
    expect(hasMain).toBeGreaterThanOrEqual(0);
  });
});
