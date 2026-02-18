/**
 * Helpers for the button audit: capture page state, enumerate buttons, record outcomes.
 */

import { Page } from '@playwright/test';

/** Wait for server/UI to settle after an action */
export const AUDIT_WAIT_MS = 2500;

export interface ButtonInfo {
  text: string;
  id: string | null;
  className: string;
  disabled: boolean;
  visible: boolean;
}

export interface PageState {
  /** Step indicator text (e.g. "Step 1", "Dream") */
  stepIndicator: string | null;
  /** Section title if visible */
  sectionTitle: string | null;
  /** First 200 chars of main card content */
  cardPreview: string;
  /** Visible button texts */
  buttonTexts: string[];
  /** Has textbox visible */
  hasTextbox: boolean;
  /** Error/alert visible */
  hasError: boolean;
  /** Loading state */
  isLoading: boolean;
}

export interface ButtonClickResult {
  button: ButtonInfo;
  stateBefore: PageState;
  stateAfter: PageState;
  success: boolean;
  errorMessage: string | null;
  consoleErrors: string[];
  /** Did the page change meaningfully? */
  stateChanged: boolean;
}

/**
 * Get all visible buttons with metadata
 */
export async function getButtonsWithMetadata(page: Page): Promise<ButtonInfo[]> {
  const buttons = await page.locator('button').all();
  const result: ButtonInfo[] = [];
  for (const btn of buttons) {
    const visible = await btn.isVisible();
    if (!visible) continue;
    const text = (await btn.textContent())?.trim() ?? '';
    const id = await btn.getAttribute('id');
    const className = (await btn.getAttribute('class')) ?? '';
    const disabled = await btn.isDisabled();
    result.push({ text, id, className, disabled, visible });
  }
  return result;
}

/**
 * Capture a fingerprint of the current page state
 */
export async function capturePageState(page: Page): Promise<PageState> {
  const stepIndicator = await page.locator('.step.active, [class*="step"].active').first().textContent().catch(() => null);
  const sectionTitle = await page.locator('#sectionTitle').textContent().catch(() => null);
  const cardDesc = await page.locator('#cardDesc').textContent().catch(() => null);
  const cardPreview = (cardDesc ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const buttons = await page.locator('button:visible').allTextContents();
  const buttonTexts = buttons.map(b => b.trim()).filter(Boolean);
  const hasTextbox = await page.locator('#input').isVisible().catch(() => false);
  const hasError = await page.locator('[class*="error"], [role="alert"], #inlineNotice').filter({ hasNotText: '' }).first().isVisible().catch(() => false);
  const isLoading = await page.locator('.badge.loading, [class*="loading"]').first().isVisible().catch(() => false);

  return {
    stepIndicator: stepIndicator?.trim() ?? null,
    sectionTitle: sectionTitle?.trim() ?? null,
    cardPreview,
    buttonTexts,
    hasTextbox,
    hasError,
    isLoading,
  };
}

/**
 * Create a short fingerprint string for state comparison
 */
export function stateFingerprint(state: PageState): string {
  return [
    state.stepIndicator ?? '',
    state.sectionTitle ?? '',
    state.buttonTexts.join('|'),
    state.hasTextbox ? '1' : '0',
  ].join('::');
}

/**
 * Wait for loading to finish
 */
export async function waitForSettle(page: Page, ms: number = AUDIT_WAIT_MS): Promise<void> {
  // Wait for loading badge to disappear
  const loading = page.locator('.badge.loading');
  try {
    await loading.waitFor({ state: 'hidden', timeout: 15000 });
  } catch {
    // Timeout ok, continue
  }
  await page.waitForTimeout(ms);
}

/**
 * Listen for console errors during an action
 */
export function captureConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  const handler = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('console', handler);
  return () => {
    page.off('console', handler);
    return errors;
  };
}
