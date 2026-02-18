import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fillAndSend, waitForResponse } from './helpers';

type PathAction =
  | { type: 'fill'; text: string }
  | { type: 'click'; buttonText: RegExp[] };

const STRATEGY_INPUTS = [
  'Focus exclusively on clients in the Netherlands',
  'Focus on clients with an annual budget above 40,000 euros',
  'Work only for clients who are healthy and profitable',
  'Never take on one-off projects for a client who is angry',
  'Only create advertising for companies that are purpose-driven',
];

const RULES_INPUTS = [
  'We maintain a formal and respectful tone in all interactions',
  'We are punctual',
  'We always seek innovative solutions',
  'We act professionally and happy',
];

const DREAM_BUILDER_MINI_STATEMENTS = [
  'I want my work to create positive impact.',
  'I want to build long-term value for people.',
  'I want freedom and meaningful growth.',
];

const STEP0_PRIMARY_INPUT = 'Venture: advertising agency | Name: Mindd | Status: existing';
const STEP0_FALLBACK_INPUT = 'I run an advertising agency called Mindd';

const LIVE_FLOW_FROM_DREAM: PathAction[] = [
  { type: 'fill', text: 'A world where businesses thrive.' },
  { type: 'click', buttonText: [/continue to the Purpose step/i, /continue/i] },

  { type: 'fill', text: 'We help companies grow.' },
  { type: 'click', buttonText: [/continue to the Big Why/i, /continue/i] },

  { type: 'fill', text: 'Because growth matters.' },
  { type: 'click', buttonText: [/continue to the Role/i, /continue/i] },

  { type: 'fill', text: 'Strategic advisor' },
  { type: 'click', buttonText: [/continue to the Entity/i, /continue/i] },

  { type: 'fill', text: 'an advertising agency' },
  { type: 'fill', text: STRATEGY_INPUTS[0] },
  { type: 'fill', text: STRATEGY_INPUTS[1] },
  { type: 'fill', text: STRATEGY_INPUTS[2] },
  { type: 'click', buttonText: [/continue to step 7 Strategy/i, /continue to the Target Group/i, /continue/i] },

  { type: 'fill', text: STRATEGY_INPUTS[3] },
  { type: 'fill', text: STRATEGY_INPUTS[4] },
  { type: 'click', buttonText: [/continue to the Strategy step/i, /continue to the Target Group/i, /continue/i] },

  { type: 'fill', text: 'Purpose-driven companies' },
  { type: 'click', buttonText: [/continue to the Target Group/i, /continue to the Products/i, /continue/i] },

  { type: 'fill', text: 'Brand strategy, campaigns' },
  { type: 'click', buttonText: [/This is all what we offer/i, /continue to step Rules/i, /continue/i] },

  { type: 'fill', text: RULES_INPUTS[0] },
  { type: 'fill', text: RULES_INPUTS[1] },
  { type: 'click', buttonText: [/continue/i] },

  { type: 'fill', text: RULES_INPUTS[2] },
  { type: 'fill', text: RULES_INPUTS[3] },
  { type: 'click', buttonText: [/continue to Presentation/i, /These are all my rules/i, /Presentation/i] },
];

async function visibleButtonsText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map((b) => (b as HTMLButtonElement))
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.textContent || '').trim())
      .filter(Boolean)
  );
}

async function clickFirstVisibleMatching(page: Page, patterns: RegExp[]): Promise<string | null> {
  for (const pattern of patterns) {
    const button = page.getByRole('button').filter({ hasText: pattern }).first();
    const isVisible = await button.isVisible().catch(() => false);
    if (!isVisible) continue;
    const label = (await button.textContent().catch(() => ''))?.trim() || pattern.source;
    await button.click();
    return label;
  }
  return null;
}

async function resolveWordingChoiceIfPresent(
  page: Page,
  snap: (label: string) => Promise<void>,
  label: string
): Promise<boolean> {
  const suggestionBtn = page.locator('#wordingChoicePickSuggestion');
  const userBtn = page.locator('#wordingChoicePickUser');

  if (await suggestionBtn.isVisible().catch(() => false)) {
    await suggestionBtn.click();
    await waitForResponse(page, 1200);
    await snap(`${label}-wording-suggestion`);
    return true;
  }

  if (await userBtn.isVisible().catch(() => false)) {
    await userBtn.click();
    await waitForResponse(page, 1200);
    await snap(`${label}-wording-user`);
    return true;
  }

  return false;
}

async function refinementTextForVisibleStep(page: Page): Promise<string> {
  if (await page.getByText(/Refine the Dream/i).isVisible().catch(() => false)) {
    return 'Mindd dreams of a world where businesses grow by creating meaningful value for people and society.';
  }
  if (await page.getByText(/Refine the Purpose/i).isVisible().catch(() => false)) {
    return 'Mindd helps purpose-driven companies turn their ambition into clear strategy and measurable growth.';
  }
  if (await page.getByText(/Refine the Big Why/i).isVisible().catch(() => false)) {
    return 'Because purposeful growth creates long-term value for people, customers, and communities.';
  }
  if (await page.getByText(/Refine the Role/i).isVisible().catch(() => false)) {
    return 'Mindd is a strategic growth partner that helps companies make clear choices and create real value.';
  }
  if (await page.getByText(/Refine the Entity/i).isVisible().catch(() => false)) {
    return 'Mindd is an advertising and strategy agency for purpose-driven growth.';
  }
  return 'Please refine this to a stronger, clearer, and more concrete formulation.';
}

async function resolveAdjustIfPresent(
  page: Page,
  snap: (label: string) => Promise<void>
): Promise<boolean> {
  const adjustBtn = page.getByRole('button').filter({ hasText: /Adjust it|Refine|Improve/i }).first();
  const visible = await adjustBtn.isVisible().catch(() => false);
  if (!visible) return false;

  await adjustBtn.click();
  await waitForResponse(page, 1000);
  await snap(`${label}-click-adjust`);

  const refinement = await refinementTextForVisibleStep(page);
  await fillAndSend(page, refinement);
  await waitForResponse(page, 1200);
  await snap(`${label}-fill-adjust`);
  await resolveWordingChoiceIfPresent(page, snap, `${label}-after-adjust`);
  return true;
}

async function answerOpenQuestionIfPresent(
  page: Page,
  snap: (label: string) => Promise<void>,
  label: string
): Promise<boolean> {
  const input = page.locator('#input');
  const send = page.locator('#send');
  const hasInput = await input.isVisible().catch(() => false);
  if (!hasInput) return false;

  const hasSend = await send.isVisible().catch(() => false);
  if (!hasSend) return false;

  let text = 'Please refine this into a stronger and more concrete formulation.';

  if (await page.getByText(/belief or value under your Dream|drives the company/i).isVisible().catch(() => false)) {
    text =
      'We believe companies should grow by creating meaningful value for people, not only by increasing revenue.';
  } else if (await page.getByText(/Big Why|why this matters|even when it gets difficult/i).isVisible().catch(() => false)) {
    text = 'Because purposeful businesses create lasting value for customers, teams, and society.';
  } else if (await page.getByText(/Role of|role does/i).isVisible().catch(() => false)) {
    text = 'Mindd acts as a strategic growth partner that helps clients make clear, impactful decisions.';
  } else if (await page.getByText(/Entity of|what type of organization/i).isVisible().catch(() => false)) {
    text = 'Mindd is a purpose-driven advertising and strategy agency.';
  } else if (await page.getByText(/Strategy of|strategic choices/i).isVisible().catch(() => false)) {
    text = 'We focus on purpose-driven Dutch companies with healthy budgets and long-term partnerships.';
  }

  await fillAndSend(page, text);
  await waitForResponse(page, 1200);
  await snap(`${label}-open-question-answer`);
  await resolveWordingChoiceIfPresent(page, snap, `${label}-after-open-question`);
  await resolveAdjustIfPresent(page, snap, `${label}-after-open-question`);
  return true;
}

async function completeStep0ToDream(
  page: Page,
  snap: (label: string) => Promise<void>
): Promise<void> {
  const startBtn = page.getByRole('button', { name: /start/i }).first();
  await expect(startBtn).toBeVisible({ timeout: 15000 });
  await startBtn.click();
  await waitForResponse(page, 1000);
  await snap('step0-01-click-start');

  await fillAndSend(page, STEP0_PRIMARY_INPUT);
  await waitForResponse(page, 1200);
  await snap('step0-02-fill-primary');

  for (let retry = 0; retry < 6; retry++) {
    const clicked = await clickFirstVisibleMatching(page, [/Yes, I'm ready/i, /Let's start/i, /Continue/i]);
    if (clicked) {
      await waitForResponse(page, 1200);
      await snap(`step0-03-click-continue-${retry + 1}`);
      return;
    }

    const asksBusinessAndName = await page
      .getByText(/what type of business|what is the name of your business|what the name is|is it still tbd|TBD/i)
      .isVisible()
      .catch(() => false);

    if (asksBusinessAndName) {
      const answer = retry < 2 ? STEP0_PRIMARY_INPUT : STEP0_FALLBACK_INPUT;
      await fillAndSend(page, answer);
      await waitForResponse(page, 1200);
      await snap(`step0-04-fill-retry-${retry + 1}`);
      continue;
    }

    const asksReady = await page
      .getByText(/are you ready to start|ready to start with the first step|ready\?/i)
      .isVisible()
      .catch(() => false);

    if (asksReady) {
      await fillAndSend(page, 'Yes');
      await waitForResponse(page, 1200);
      await snap(`step0-05-fill-yes-${retry + 1}`);
      continue;
    }

    const buttons = await visibleButtonsText(page);
    throw new Error(
      `Step 0 did not reach Dream. Retry ${retry + 1}. Visible buttons: ${buttons.join(' | ')}`
    );
  }

  throw new Error('Step 0 did not reach Dream within retries.');
}

test('Live path with screenshot after every click/input', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const slug = `live-path-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const outDir = path.join(__dirname, 'live-screenshots', slug);
  fs.mkdirSync(outDir, { recursive: true });

  let shot = 0;
  const snap = async (label: string) => {
    shot += 1;
    const name = `${String(shot).padStart(3, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  };

  await page.goto('/test');
  await waitForResponse(page, 800);
  await snap('open');

  await completeStep0ToDream(page, snap);

  for (let i = 0; i < LIVE_FLOW_FROM_DREAM.length; i++) {
    const action = LIVE_FLOW_FROM_DREAM[i];

    await resolveWordingChoiceIfPresent(page, snap, `pre-${i + 1}`);
    await resolveAdjustIfPresent(page, snap, `pre-${i + 1}`);

    if (action.type === 'fill') {
      await fillAndSend(page, action.text);
      await waitForResponse(page, 1200);
      await snap(`fill-${i + 1}`);
      await resolveWordingChoiceIfPresent(page, snap, `postfill-${i + 1}`);
      await resolveAdjustIfPresent(page, snap, `postfill-${i + 1}`);
      continue;
    }

    const clickedLabel = await clickFirstVisibleMatching(page, action.buttonText);
    if (!clickedLabel) {
      const handled = await resolveWordingChoiceIfPresent(page, snap, `retry-${i + 1}`);
      if (handled) {
        const clickedAfterPick = await clickFirstVisibleMatching(page, action.buttonText);
        if (clickedAfterPick) {
          await waitForResponse(page, 1200);
          await snap(`click-${i + 1}`);
          continue;
        }
      }
      const adjusted = await resolveAdjustIfPresent(page, snap, `retry-${i + 1}`);
      if (adjusted) {
        const clickedAfterAdjust = await clickFirstVisibleMatching(page, action.buttonText);
        if (clickedAfterAdjust) {
          await waitForResponse(page, 1200);
          await snap(`click-${i + 1}`);
          continue;
        }
      }
      const answeredOpenQuestion = await answerOpenQuestionIfPresent(page, snap, `retry-${i + 1}`);
      if (answeredOpenQuestion) {
        const clickedAfterAnswer = await clickFirstVisibleMatching(page, action.buttonText);
        if (clickedAfterAnswer) {
          await waitForResponse(page, 1200);
          await snap(`click-${i + 1}`);
          continue;
        }
      }
      const buttons = await visibleButtonsText(page);
      throw new Error(
        `Could not click action ${i + 1}. Wanted: ${action.buttonText
          .map((r) => r.toString())
          .join(' OR ')}. Visible buttons: ${buttons.join(' | ')}`
      );
    }

    await waitForResponse(page, 1200);
    await snap(`click-${i + 1}`);
  }
});

test('Live Dream side paths with screenshots (off-topic + exercise)', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);

  const slug = `live-dream-sidepaths-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const outDir = path.join(__dirname, 'live-screenshots', slug);
  fs.mkdirSync(outDir, { recursive: true });

  let shot = 0;
  const snap = async (label: string) => {
    shot += 1;
    const name = `${String(shot).padStart(3, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  };

  await page.goto('/test');
  await waitForResponse(page, 800);
  await snap('open');
  await completeStep0ToDream(page, snap);
  await snap('on-dream');

  await fillAndSend(page, 'Who is Ben Steenstra?');
  await waitForResponse(page, 1200);
  await snap('offtopic-ask');
  await resolveWordingChoiceIfPresent(page, snap, 'offtopic');
  await resolveAdjustIfPresent(page, snap, 'offtopic');

  const continuedAfterOffTopic = await clickFirstVisibleMatching(page, [/Continue Dream now/i, /continue/i]);
  if (continuedAfterOffTopic) {
    await waitForResponse(page, 1200);
    await snap('offtopic-continue');
  }

  const clickedExercise = await clickFirstVisibleMatching(page, [
    /Do a small exercise/i,
    /Start the exercise/i,
    /exercise/i,
  ]);
  if (!clickedExercise) {
    const buttons = await visibleButtonsText(page);
    throw new Error(`Could not open Dream exercise. Visible buttons: ${buttons.join(' | ')}`);
  }
  await waitForResponse(page, 1200);
  await snap('exercise-open');

  const asksReady = await page.getByText(/ready|start|exercise/i).isVisible().catch(() => false);
  if (asksReady) {
    await fillAndSend(page, 'Yes');
    await waitForResponse(page, 1200);
    await snap('exercise-ready-yes');
  }

  for (let i = 0; i < DREAM_BUILDER_MINI_STATEMENTS.length; i++) {
    await fillAndSend(page, DREAM_BUILDER_MINI_STATEMENTS[i]);
    await waitForResponse(page, 1200);
    await snap(`exercise-statement-${i + 1}`);
  }

  const hasDreamBuilderState = await page
    .getByText(/dream statements|exercise|dream/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(hasDreamBuilderState).toBeTruthy();
});
