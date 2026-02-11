import { test, expect } from '@playwright/test';
import { 
  takeScreenshot,
  waitForResponse
} from './helpers';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
  });

  test('Mobile viewport (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await takeScreenshot(page, 'responsive-mobile-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-mobile-02-step0');

    // Verify elements are visible and accessible on mobile
    const startBtn = page.getByRole('button', { name: 'Start' });
    const isVisible = await startBtn.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });

  test('Tablet viewport (768x1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await takeScreenshot(page, 'responsive-tablet-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-tablet-02-step0');

    // Verify layout works on tablet
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Desktop viewport (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await takeScreenshot(page, 'responsive-desktop-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-desktop-02-step0');

    // Verify layout works on desktop
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Small mobile viewport (320x568)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await takeScreenshot(page, 'responsive-small-mobile-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-small-mobile-02-step0');

    // Verify elements fit on small screen
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Large desktop viewport (2560x1440)', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await takeScreenshot(page, 'responsive-large-desktop-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-large-desktop-02-step0');

    // Verify layout scales properly
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Landscape tablet (1024x768)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await takeScreenshot(page, 'responsive-landscape-tablet-01-start');

    await page.getByRole('button', { name: 'Start' }).click();
    await waitForResponse(page);
    await takeScreenshot(page, 'responsive-landscape-tablet-02-step0');

    // Verify landscape orientation works
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible();
  });

  test('Element visibility across viewports', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1920, height: 1080, name: 'desktop' }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/test');
      
      const startBtn = page.getByRole('button', { name: 'Start' });
      await expect(startBtn).toBeVisible();
      
      await startBtn.click();
      await waitForResponse(page);
      
      const textbox = page.getByRole('textbox');
      await expect(textbox).toBeVisible();
      
      await takeScreenshot(page, `responsive-${viewport.name}-elements`);
    }
  });
});
