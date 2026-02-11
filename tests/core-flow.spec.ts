import { test, expect } from '@playwright/test';

async function clickIfVisible(page, name: string) {
  const btn = page.getByRole('button', { name });
  if (await btn.isVisible()) {
    await btn.click();
    return true;
  }
  return false;
}

async function clickContinue(page) {
  // Try common labels in this UI
  if (await clickIfVisible(page, 'Continue')) return;
  if (await clickIfVisible(page, 'Go to next step')) return;
  if (await clickIfVisible(page, "I'm happy with this formulation, continue to the Purpose step")) return;
}

test('Core flow in English with screenshots', async ({ page }) => {
  await page.goto('/test');

  await page.screenshot({ path: 'tests/screenshots/01-start.png', fullPage: true });

  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/screenshots/02-step0-question.png', fullPage: true });

  await page.getByRole('textbox').fill('Marketing agency Nova');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/03-step0-confirm.png', fullPage: true });

  await clickContinue(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/04-dream-ask.png', fullPage: true });

  await page.getByRole('textbox').fill('People everywhere have fair access to meaningful work and learning.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/05-dream-response.png', fullPage: true });

  await clickContinue(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/06-purpose-ask.png', fullPage: true });

  await page.getByRole('textbox').fill('We believe talent is everywhere, opportunity is not.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/07-purpose-response.png', fullPage: true });

  await clickContinue(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/08-bigwhy-ask.png', fullPage: true });

  await page.getByRole('textbox').fill('Because a society is only fair when everyone’s potential is seen and used.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/09-bigwhy-response.png', fullPage: true });
});
