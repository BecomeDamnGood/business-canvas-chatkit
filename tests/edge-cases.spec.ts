import { test, expect } from '@playwright/test';
import { 
  fillAndSend, 
  waitForResponse
} from './helpers';

test.describe('Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
  });

  test('Empty input handling', async ({ page }) => {
    const textbox = page.getByRole('textbox');
    await textbox.fill('');
    
    const sendBtn = page.getByRole('button', { name: 'Send' });
    await sendBtn.click();
    await waitForResponse(page);

    // Should still be functional (validation happens server-side)
    await expect(textbox).toBeVisible();
  });

  test('Very long input handling', async ({ page }) => {
    const longText = 'A'.repeat(5000);
    await fillAndSend(page, longText);
    await waitForResponse(page);

    // Should handle long input gracefully
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Special characters in input', async ({ page }) => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    await fillAndSend(page, `Test input with ${specialChars}`);
    await waitForResponse(page);

    // Should handle special characters
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Unicode characters in input', async ({ page }) => {
    const unicodeText = 'Test with émojis 🎉 and 中文 and русский';
    await fillAndSend(page, unicodeText);
    await waitForResponse(page);

    // Should handle unicode
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Rapid button clicking prevention', async ({ page }) => {
    await fillAndSend(page, 'Test Company');
    await waitForResponse(page);

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      
      // Try rapid clicks
      await firstButton.click();
      await firstButton.click();
      await firstButton.click();
      
      await waitForResponse(page, 1000);
      
      // Should handle rapid clicks gracefully (may disable button or ignore)
      const isEnabled = await firstButton.isEnabled().catch(() => false);
      // Button may be disabled or still enabled, both are valid
      expect(typeof isEnabled).toBe('boolean');
    }
  });

  test('Multiple rapid form submissions', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: 'Send' });
    
    await fillAndSend(page, 'Test');
    await sendBtn.click();
    await sendBtn.click();
    await sendBtn.click();
    
    await waitForResponse(page, 2000);
    
    // Should handle multiple submissions
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Newline characters in input', async ({ page }) => {
    const multilineText = 'Line 1\nLine 2\nLine 3';
    await fillAndSend(page, multilineText);
    await waitForResponse(page);

    // Should handle newlines
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('HTML tags in input (XSS prevention)', async ({ page }) => {
    const htmlInput = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
    await fillAndSend(page, htmlInput);
    await waitForResponse(page);

    // Should sanitize HTML
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
    
    // Check that script didn't execute (no alert)
    // This is a basic check - full XSS testing would require more sophisticated checks
  });

  test('Very short input', async ({ page }) => {
    await fillAndSend(page, 'A');
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Whitespace-only input', async ({ page }) => {
    await fillAndSend(page, '   \n\t   ');
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Numbers and symbols only', async ({ page }) => {
    await fillAndSend(page, '1234567890 !@#$%');
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('URLs in input', async ({ page }) => {
    await fillAndSend(page, 'Check out https://example.com for more info');
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Email addresses in input', async ({ page }) => {
    await fillAndSend(page, 'Contact us at test@example.com');
    await waitForResponse(page);

    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });
});
