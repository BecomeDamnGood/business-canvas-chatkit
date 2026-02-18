import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fillAndSend, waitForResponse } from './helpers';

type Action =
  | { type: 'click'; label: string; patterns: RegExp[]; optional?: boolean }
  | { type: 'fill'; label: string; text: string; optional?: boolean }
  | { type: 'fillScores'; label: string; defaultScore: number; lastScore: number; optional?: boolean };

interface ScenarioDef {
  id: string;
  description: string;
  actions: Action[];
}

interface ActionLog {
  index: number;
  label: string;
  type: string;
  value: string;
  ok: boolean;
  error: string;
  screenshot: string;
}

interface ScenarioResult {
  id: string;
  description: string;
  ok: boolean;
  issues: string[];
  finalPrompt: string;
  finalCardDesc: string;
  finalButtons: string[];
  logs: ActionLog[];
}

interface AuditReport {
  generatedAt: string;
  settleMs: number;
  scenarios: ScenarioResult[];
}

interface RunContext {
  page: Page;
  screenshotDir: string;
  logs: ActionLog[];
  shot: number;
}

const LIVE_SETTLE_MS = Number(process.env.PW_LIVE_SETTLE_MS || '7000');
const LIVE_TIMEOUT_MS = Number(process.env.PW_LIVE_TIMEOUT_MS || '45000');
const OFF_TOPIC_MODE = String(process.env.PW_LIVE_OFFTOPIC_MODE || 'single').toLowerCase();
const CLICK_RETRY_ROUNDS = Number(process.env.PW_LIVE_CLICK_RETRIES || '7');

const STEP0_PRIMARY_INPUT = 'Venture: advertising agency | Name: Mindd | Status: existing';
const STEP0_FALLBACK_INPUT = 'I run an advertising agency called Mindd';

const OFF_TOPIC_QUESTIONS = [
  'Who is Ben Steenstra?',
  "What's the time in London?",
  'Why is this step needed?',
];

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

const DREAM_BUILDER_STATEMENTS = [
  "I want my work to make a positive difference in people's lives.",
  'I want to build something that lasts beyond me.',
  'I want to create freedom in my time and choices.',
  'I want to feel proud when I talk about what I do.',
  'I want my business to reflect who I am and what I stand for.',
  'I want to help people solve a problem they truly care about.',
  'I want to bring clarity and simplicity to a confusing area.',
  'I want to create a safe space where people feel seen and supported.',
  'I want to challenge the status quo and improve how things are done.',
  'I want to grow into the best version of myself through this business.',
  'I want to build a community around a shared belief or movement.',
  'I want to create opportunities for others (customers, partners, team).',
  'I want to do meaningful work without sacrificing my health or relationships.',
  'I want to be financially secure while doing work that feels right.',
  'I want to create beauty, quality, or craftsmanship people can feel.',
  'I want to make a complex process easier, faster, or more human.',
  'I want to inspire people to take action and believe in themselves.',
  'I want to contribute to a future I would be proud to leave behind.',
  'I want my business to be known for honesty, trust, and integrity.',
  'De kloof tussen arm en rijk wordt groter en tech bedrijven nemen de wereld over',
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function settle(page: Page, ms: number = LIVE_SETTLE_MS): Promise<void> {
  await waitForResponse(page, ms);
}

async function visibleButtonsText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map((b) => b as HTMLButtonElement)
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.textContent || '').trim())
      .filter(Boolean)
  );
}

type ButtonCandidate = {
  text: string;
  enabled: boolean;
  visible: boolean;
  locator: ReturnType<Page['locator']>;
};

function normalizeText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectIntent(label: string): 'start' | 'continue' | 'exercise' | 'presentation' | 'adjust' | 'generic' {
  const l = normalizeText(label);
  if (/(^|\s)start(\s|$)|validation business name/.test(l)) return 'start';
  if (/exercise|dream builder|scoring|formulate/.test(l)) return 'exercise';
  if (/presentation|pptx|create/.test(l)) return 'presentation';
  if (/adjust|refine|improve/.test(l)) return 'adjust';
  if (/continue|next|ready|go to next step|off topic/.test(l)) return 'continue';
  return 'generic';
}

async function listButtonCandidates(page: Page): Promise<ButtonCandidate[]> {
  const buttons = page.locator('button');
  const count = await buttons.count();
  const out: ButtonCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const loc = buttons.nth(i);
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    const text = String((await loc.textContent().catch(() => '')) || '').trim();
    const enabled = await loc.isEnabled().catch(() => false);
    out.push({ text, enabled, visible, locator: loc });
  }
  return out;
}

function scoreCandidate(candidate: ButtonCandidate, intent: ReturnType<typeof detectIntent>): number {
  const t = normalizeText(candidate.text);
  if (!candidate.enabled) return -1000;
  let score = 0;
  if (/continue|next|go to next step/.test(t)) score += 35;
  if (/yes|ready|let s start|lets start|start/.test(t)) score += 20;
  if (/choose this version|pick one|use this input/.test(t)) score += 18;
  if (/presentation|create/.test(t)) score += 14;
  if (/adjust|refine|improve/.test(t)) score -= 10;

  if (intent === 'start') {
    if (/start|validation|business name/.test(t)) score += 90;
  } else if (intent === 'continue') {
    if (/continue|next|yes|ready|fit/.test(t)) score += 80;
    if (/adjust|refine|improve/.test(t)) score -= 25;
  } else if (intent === 'exercise') {
    if (/exercise|dream builder|formulate|choose this version/.test(t)) score += 90;
  } else if (intent === 'presentation') {
    if (/presentation|create|continue/.test(t)) score += 85;
  } else if (intent === 'adjust') {
    if (/adjust|refine|improve/.test(t)) score += 95;
  }

  return score;
}

async function promptText(page: Page): Promise<string> {
  return page.locator('#prompt').textContent().then((t) => String(t || '').trim()).catch(() => '');
}

async function cardDescText(page: Page): Promise<string> {
  return page.locator('#cardDesc').textContent().then((t) => String(t || '').trim()).catch(() => '');
}

async function takeStepShot(ctx: RunContext, label: string): Promise<string> {
  ctx.shot += 1;
  const file = `${String(ctx.shot).padStart(4, '0')}-${slugify(label)}.png`;
  await ctx.page.screenshot({ path: path.join(ctx.screenshotDir, file), fullPage: true });
  return file;
}

async function recordAction(
  ctx: RunContext,
  label: string,
  type: string,
  value: string,
  runner: () => Promise<void>
): Promise<boolean> {
  try {
    await runner();
    const shot = await takeStepShot(ctx, label);
    ctx.logs.push({
      index: ctx.logs.length + 1,
      label,
      type,
      value,
      ok: true,
      error: '',
      screenshot: shot,
    });
    return true;
  } catch (e) {
    const shot = await takeStepShot(ctx, `${label}-error`);
    ctx.logs.push({
      index: ctx.logs.length + 1,
      label,
      type,
      value,
      ok: false,
      error: (e as Error).message,
      screenshot: shot,
    });
    return false;
  }
}

async function clickFirstEnabledMatching(
  page: Page,
  patterns: RegExp[],
  labelHint: string
): Promise<{ ok: boolean; label: string; debug: string }> {
  const intent = detectIntent(labelHint);

  for (let round = 0; round < CLICK_RETRY_ROUNDS; round++) {
    // 1) Preferred path: direct pattern match.
    for (const pattern of patterns) {
      const button = page.getByRole('button').filter({ hasText: pattern }).first();
      const visible = await button.isVisible().catch(() => false);
      if (!visible) continue;
      await expect(button).toBeEnabled({ timeout: Math.min(LIVE_TIMEOUT_MS, 6000) }).catch(() => {});
      const enabled = await button.isEnabled().catch(() => false);
      if (!enabled) continue;
      const text = (await button.textContent().catch(() => ''))?.trim() || pattern.source;
      await button.click();
      return { ok: true, label: text, debug: '' };
    }

    // 2) Fallback path: pick best enabled visible button by semantic intent.
    const candidates = await listButtonCandidates(page);
    const enabledCandidates = candidates.filter((c) => c.enabled);
    if (enabledCandidates.length > 0) {
      let best = enabledCandidates[0];
      let bestScore = scoreCandidate(best, intent);
      for (let i = 1; i < enabledCandidates.length; i++) {
        const score = scoreCandidate(enabledCandidates[i], intent);
        if (score > bestScore) {
          best = enabledCandidates[i];
          bestScore = score;
        }
      }
      if (bestScore >= 55) {
        await best.locator.click();
        return { ok: true, label: best.text || '(button)', debug: `fallback-score=${bestScore}` };
      }
    }

    if (round < CLICK_RETRY_ROUNDS - 1) {
      await settle(page, Math.round(LIVE_SETTLE_MS * 0.6));
    }
  }

  const allButtons = (await listButtonCandidates(page))
    .map((b) => `${b.text || '(empty)'} [${b.enabled ? 'enabled' : 'disabled'}]`)
    .join(' | ');
  return { ok: false, label: '', debug: allButtons };
}

async function resolveWordingChoiceIfPresent(ctx: RunContext, label: string): Promise<boolean> {
  const suggestionBtn = ctx.page.locator('#wordingChoicePickSuggestion');
  const userBtn = ctx.page.locator('#wordingChoicePickUser');

  if (await suggestionBtn.isVisible().catch(() => false)) {
    return recordAction(ctx, `${label}-wording-suggestion`, 'click', '#wordingChoicePickSuggestion', async () => {
      await expect(suggestionBtn).toBeEnabled({ timeout: LIVE_TIMEOUT_MS });
      await suggestionBtn.click();
      await settle(ctx.page);
    });
  }

  if (await userBtn.isVisible().catch(() => false)) {
    return recordAction(ctx, `${label}-wording-user`, 'click', '#wordingChoicePickUser', async () => {
      await expect(userBtn).toBeEnabled({ timeout: LIVE_TIMEOUT_MS });
      await userBtn.click();
      await settle(ctx.page);
    });
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

async function resolveAdjustIfPresent(ctx: RunContext, label: string): Promise<boolean> {
  const adjustBtn = ctx.page.getByRole('button').filter({ hasText: /Adjust it|Refine|Improve/i }).first();
  const visible = await adjustBtn.isVisible().catch(() => false);
  if (!visible) return false;
  const enabled = await adjustBtn.isEnabled().catch(() => false);
  if (!enabled) return false;

  const clicked = await recordAction(ctx, `${label}-click-adjust`, 'click', 'Adjust it', async () => {
    await adjustBtn.click();
    await settle(ctx.page);
  });
  if (!clicked) return false;

  const refinement = await refinementTextForVisibleStep(ctx.page);
  const filled = await recordAction(ctx, `${label}-fill-adjust`, 'fill', refinement, async () => {
    await fillAndSend(ctx.page, refinement);
    await settle(ctx.page);
  });
  if (!filled) return false;

  await resolveWordingChoiceIfPresent(ctx, `${label}-after-adjust`);
  return true;
}

async function answerOpenQuestionIfPresent(ctx: RunContext, label: string): Promise<boolean> {
  const input = ctx.page.locator('#input');
  const hasInput = await input.isVisible().catch(() => false);
  if (!hasInput) return false;

  const disabled = await input.isDisabled().catch(() => false);
  if (disabled) return false;

  let text = 'Please refine this into a stronger and more concrete formulation.';

  if (await ctx.page.getByText(/belief or value under your Dream|drives the company/i).isVisible().catch(() => false)) {
    text = 'We believe companies should grow by creating meaningful value for people, not only by increasing revenue.';
  } else if (await ctx.page.getByText(/Big Why|why this matters|even when it gets difficult/i).isVisible().catch(() => false)) {
    text = 'Because purposeful businesses create lasting value for customers, teams, and society.';
  } else if (await ctx.page.getByText(/Role of|role does/i).isVisible().catch(() => false)) {
    text = 'Mindd acts as a strategic growth partner that helps clients make clear, impactful decisions.';
  } else if (await ctx.page.getByText(/Entity of|what type of organization/i).isVisible().catch(() => false)) {
    text = 'Mindd is a purpose-driven advertising and strategy agency.';
  } else if (await ctx.page.getByText(/Strategy of|strategic choices/i).isVisible().catch(() => false)) {
    text = 'We focus on purpose-driven Dutch companies with healthy budgets and long-term partnerships.';
  }

  return recordAction(ctx, `${label}-open-question-answer`, 'fill', text, async () => {
    await fillAndSend(ctx.page, text);
    await settle(ctx.page);
    await resolveWordingChoiceIfPresent(ctx, `${label}-after-open-question`);
    await resolveAdjustIfPresent(ctx, `${label}-after-open-question`);
  });
}

async function runClickAction(ctx: RunContext, action: Extract<Action, { type: 'click' }>): Promise<void> {
  const clicked = await clickFirstEnabledMatching(ctx.page, action.patterns, action.label);
  if (clicked.ok) {
    const ok = await recordAction(ctx, action.label, 'click', clicked.label, async () => {
      await settle(ctx.page);
    });
    if (!ok && !action.optional) throw new Error(`Click failed for "${action.label}".`);
    return;
  }

  await settle(ctx.page, Math.round(LIVE_SETTLE_MS * 1.5));
  await resolveWordingChoiceIfPresent(ctx, `${action.label}-recover`);
  await resolveAdjustIfPresent(ctx, `${action.label}-recover`);
  await answerOpenQuestionIfPresent(ctx, `${action.label}-recover`);

  const retried = await clickFirstEnabledMatching(ctx.page, action.patterns, action.label);
  if (retried.ok) {
    const ok = await recordAction(ctx, `${action.label}-retry`, 'click', retried.label, async () => {
      await settle(ctx.page);
    });
    if (!ok && !action.optional) throw new Error(`Retry click failed for "${action.label}".`);
    return;
  }

  const buttons = await visibleButtonsText(ctx.page);
  const prompt = await promptText(ctx.page);
  const desc = await cardDescText(ctx.page);
  const message =
    `Could not click "${action.label}". Patterns: ${action.patterns.map((p) => p.toString()).join(' OR ')}. ` +
    `Visible buttons: ${buttons.join(' | ')}. ` +
    `Matcher debug first try: ${clicked.debug || '(none)'}. ` +
    `Matcher debug retry: ${retried.debug || '(none)'}. ` +
    `Prompt: ${prompt}. CardDesc: ${desc}`;
  if (action.optional) {
    await recordAction(ctx, `${action.label}-optional-miss`, 'click', 'optional', async () => {
      // no-op; we only want a screenshot + log row
    });
    return;
  }
  throw new Error(message);
}

async function runFillAction(ctx: RunContext, action: Extract<Action, { type: 'fill' }>): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ok = await recordAction(ctx, `${action.label}-try-${attempt + 1}`, 'fill', action.text, async () => {
      await fillAndSend(ctx.page, action.text);
      await settle(ctx.page);
      await resolveWordingChoiceIfPresent(ctx, `${action.label}-after-fill`);
      await resolveAdjustIfPresent(ctx, `${action.label}-after-fill`);
    });
    if (ok) return;

    // Recovery: UI may still be thinking or gated by a pending choice.
    await resolveWordingChoiceIfPresent(ctx, `${action.label}-recover-${attempt + 1}`);
    await resolveAdjustIfPresent(ctx, `${action.label}-recover-${attempt + 1}`);
    await settle(ctx.page, Math.round(LIVE_SETTLE_MS * 0.7));
  }

  if (!action.optional) throw new Error(`Fill failed for "${action.label}" after retries.`);
}

async function runFillScoresAction(ctx: RunContext, action: Extract<Action, { type: 'fillScores' }>): Promise<void> {
  const ok = await recordAction(
    ctx,
    action.label,
    'fillScores',
    `default=${action.defaultScore}, last=${action.lastScore}`,
    async () => {
      const inputs = ctx.page.locator('.scoreInput');
      await inputs.first().waitFor({ state: 'visible', timeout: LIVE_TIMEOUT_MS });
      const count = await inputs.count();
      if (count === 0) throw new Error('No score inputs found.');
      for (let i = 0; i < count; i++) {
        const val = i === count - 1 ? String(action.lastScore) : String(action.defaultScore);
        await inputs.nth(i).fill(val);
      }
      await settle(ctx.page);
    }
  );
  if (!ok && !action.optional) {
    throw new Error(`fillScores failed for "${action.label}".`);
  }
}

async function runAction(ctx: RunContext, action: Action): Promise<void> {
  if (action.type === 'click') return runClickAction(ctx, action);
  if (action.type === 'fill') return runFillAction(ctx, action);
  return runFillScoresAction(ctx, action);
}

function clickAction(label: string, patterns: RegExp[], optional = false): Action {
  return { type: 'click', label, patterns, optional };
}

function fillAction(label: string, text: string, optional = false): Action {
  return { type: 'fill', label, text, optional };
}

const TO_STEP0: Action[] = [
  clickAction('Start', [/^Start$/i, /start/i, /Validation\s*&\s*Business\s*Name/i]),
];
const TO_DREAM: Action[] = [
  ...TO_STEP0,
  fillAction('Step0 business input', STEP0_PRIMARY_INPUT),
  fillAction('Step0 fallback business input', STEP0_FALLBACK_INPUT, true),
  clickAction('Step0 continue to Dream', [/Yes, I'm ready/i, /Let'?s start/i, /Continue/i]),
];
const TO_PURPOSE: Action[] = [
  ...TO_DREAM,
  fillAction('Dream answer', 'A world where businesses thrive.'),
  clickAction('Dream continue to Purpose', [/continue to the Purpose step/i, /Continue/i]),
];
const TO_BIGWHY: Action[] = [
  ...TO_PURPOSE,
  fillAction('Purpose answer', 'We help companies grow.'),
  clickAction('Purpose continue to Big Why', [/continue to the Big Why/i, /Continue/i]),
];
const TO_ROLE: Action[] = [
  ...TO_BIGWHY,
  fillAction('Big Why answer', 'Because growth matters.'),
  clickAction('Big Why continue to Role', [/continue to the Role/i, /Continue/i]),
];
const TO_ENTITY: Action[] = [
  ...TO_ROLE,
  fillAction('Role answer', 'Strategic advisor'),
  clickAction('Role continue to Entity', [/continue to the Entity/i, /Continue/i]),
];
const TO_STRATEGY: Action[] = [...TO_ENTITY, fillAction('Entity answer', 'an advertising agency')];
const TO_TARGETGROUP: Action[] = [
  ...TO_STRATEGY,
  fillAction('Strategy item 1', STRATEGY_INPUTS[0]),
  fillAction('Strategy item 2', STRATEGY_INPUTS[1]),
  fillAction('Strategy item 3', STRATEGY_INPUTS[2]),
  clickAction('Strategy continue mid', [/continue to step 7 Strategy/i, /continue to the Target Group/i, /Continue/i]),
  fillAction('Strategy item 4', STRATEGY_INPUTS[3]),
  fillAction('Strategy item 5', STRATEGY_INPUTS[4]),
  clickAction('Strategy continue final', [/continue to the Strategy step/i, /continue to the Target Group/i, /Continue/i]),
];
const TO_PRODUCTS: Action[] = [
  ...TO_TARGETGROUP,
  fillAction('Target Group answer', 'Purpose-driven companies'),
  clickAction('Target Group continue', [/continue to the Target Group/i, /continue to the Products/i, /Continue/i]),
];
const TO_RULES: Action[] = [
  ...TO_PRODUCTS,
  fillAction('Products answer', 'Brand strategy, campaigns'),
  clickAction('Products continue', [/This is all what we offer/i, /continue to step Rules/i, /Continue/i]),
];
const TO_PRESENTATION: Action[] = [
  ...TO_RULES,
  fillAction('Rules item 1', RULES_INPUTS[0]),
  fillAction('Rules item 2', RULES_INPUTS[1]),
  clickAction('Rules continue mid', [/continue/i]),
  fillAction('Rules item 3', RULES_INPUTS[2]),
  fillAction('Rules item 4', RULES_INPUTS[3]),
  clickAction('Rules continue to Presentation', [/continue to Presentation/i, /These are all my rules/i, /Presentation/i]),
];

const MAIN_SCENARIOS: ScenarioDef[] = [
  { id: 'step0-initial', description: 'Step 0 open state', actions: TO_STEP0 },
  { id: 'dream-initial', description: 'Reach Dream', actions: TO_DREAM },
  { id: 'purpose-initial', description: 'Reach Purpose', actions: TO_PURPOSE },
  { id: 'bigwhy-initial', description: 'Reach Big Why', actions: TO_BIGWHY },
  { id: 'role-initial', description: 'Reach Role', actions: TO_ROLE },
  { id: 'entity-initial', description: 'Reach Entity', actions: TO_ENTITY },
  { id: 'strategy-initial', description: 'Reach Strategy', actions: TO_STRATEGY },
  { id: 'targetgroup-initial', description: 'Reach Target Group', actions: TO_TARGETGROUP },
  { id: 'productsservices-initial', description: 'Reach Products & Services', actions: TO_PRODUCTS },
  { id: 'rules-initial', description: 'Reach Rules of the Game', actions: TO_RULES },
  { id: 'presentation-initial', description: 'Reach Presentation', actions: TO_PRESENTATION },
  {
    id: 'presentation-create',
    description: 'Presentation create path',
    actions: [
      ...TO_PRESENTATION,
      clickAction('Create Presentation', [/Create.*Presentation/i, /Create the Business Strategy Canvas Presentation/i], true),
      fillAction('Presentation confirm yes', 'Yes', true),
    ],
  },
  {
    id: 'dream-builder-scoring',
    description: 'Dream Builder full side path with scoring and formulate',
    actions: [
      ...TO_DREAM,
      clickAction('Dream open exercise', [/Do a small exercise/i, /Start the exercise/i, /exercise/i]),
      fillAction('Dream exercise ready', 'Yes', true),
      ...DREAM_BUILDER_STATEMENTS.map((s, i) => fillAction(`Dream Builder statement ${i + 1}`, s)),
      { type: 'fillScores', label: 'Dream Builder scoring', defaultScore: 2, lastScore: 9, optional: true },
      clickAction('Dream Builder formulate', [/Formulate my dream/i, /based on what I find important/i], true),
    ],
  },
];

const OFFTOPIC_PATHS: Array<{ id: string; description: string; setup: Action[] }> = [
  { id: 'offtopic-step0', description: 'Off-topic at Step 0', setup: TO_STEP0 },
  { id: 'offtopic-dream', description: 'Off-topic at Dream', setup: TO_DREAM },
  { id: 'offtopic-purpose', description: 'Off-topic at Purpose', setup: TO_PURPOSE },
  { id: 'offtopic-bigwhy', description: 'Off-topic at Big Why', setup: TO_BIGWHY },
  { id: 'offtopic-role', description: 'Off-topic at Role', setup: TO_ROLE },
  { id: 'offtopic-entity', description: 'Off-topic at Entity', setup: TO_ENTITY },
  { id: 'offtopic-strategy', description: 'Off-topic at Strategy', setup: TO_STRATEGY },
  { id: 'offtopic-targetgroup', description: 'Off-topic at Target Group', setup: TO_TARGETGROUP },
  { id: 'offtopic-productsservices', description: 'Off-topic at Products & Services', setup: TO_PRODUCTS },
  { id: 'offtopic-rules', description: 'Off-topic at Rules', setup: TO_RULES },
  { id: 'offtopic-presentation', description: 'Off-topic at Presentation', setup: TO_PRESENTATION },
];

function buildOfftopicScenarios(): ScenarioDef[] {
  const questions = OFF_TOPIC_MODE === 'single' ? [OFF_TOPIC_QUESTIONS[0]] : OFF_TOPIC_QUESTIONS;
  const scenarios: ScenarioDef[] = [];
  for (const pathDef of OFFTOPIC_PATHS) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      scenarios.push({
        id: `${pathDef.id}-q${i + 1}`,
        description: `${pathDef.description} – ${q}`,
        actions: [
          ...pathDef.setup,
          fillAction(`Off-topic question ${i + 1}`, q),
          clickAction('Optional continue after off-topic', [/Continue Dream now/i, /Continue/i], true),
        ],
      });
    }
  }
  return scenarios;
}

function buildAllScenarios(): ScenarioDef[] {
  return [...MAIN_SCENARIOS, ...buildOfftopicScenarios()];
}

async function runScenario(page: Page, scenario: ScenarioDef, screenshotDir: string): Promise<ScenarioResult> {
  const ctx: RunContext = {
    page,
    screenshotDir,
    logs: [],
    shot: 0,
  };

  const issues: string[] = [];
  await page.goto('/test');
  await settle(page, Math.round(LIVE_SETTLE_MS * 0.8));
  await takeStepShot(ctx, `${scenario.id}-open`);

  for (let i = 0; i < scenario.actions.length; i++) {
    const action = scenario.actions[i];
    try {
      await runAction(ctx, action);
    } catch (e) {
      issues.push(`Action ${i + 1} (${action.label}) failed: ${(e as Error).message}`);
      break;
    }
  }

  const finalPrompt = await promptText(page);
  const finalCardDesc = await cardDescText(page);
  const finalButtons = await visibleButtonsText(page);

  return {
    id: scenario.id,
    description: scenario.description,
    ok: issues.length === 0,
    issues,
    finalPrompt,
    finalCardDesc,
    finalButtons,
    logs: ctx.logs,
  };
}

function generateReportMarkdown(report: AuditReport): string {
  const total = report.scenarios.length;
  const passed = report.scenarios.filter((s) => s.ok).length;
  const failed = total - passed;
  const lines: string[] = [
    '# Live Full Audit Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Settle wait per action: ${report.settleMs} ms`,
    '',
    '## Summary',
    '',
    `- Scenarios: ${total}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    '',
    '---',
    '',
  ];

  if (failed > 0) {
    lines.push('## Failed Scenarios');
    lines.push('');
    for (const s of report.scenarios.filter((x) => !x.ok)) {
      lines.push(`- **${s.id}**: ${s.issues.join(' | ')}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const s of report.scenarios) {
    lines.push(`## ${s.id}`);
    lines.push('');
    lines.push(`- Description: ${s.description}`);
    lines.push(`- Status: ${s.ok ? 'PASS' : 'FAIL'}`);
    lines.push(`- Final prompt: ${s.finalPrompt || '(empty)'}`);
    lines.push(`- Final card text: ${s.finalCardDesc || '(empty)'}`);
    lines.push(`- Final visible buttons: ${s.finalButtons.join(' | ') || '(none)'}`);
    if (s.issues.length > 0) {
      lines.push(`- Issues: ${s.issues.join(' | ')}`);
    }
    lines.push('');
    lines.push('| # | Label | Type | Value | OK | Screenshot |');
    lines.push('|---|-------|------|-------|----|-----------|');
    for (const log of s.logs) {
      const screenLink = `[${log.screenshot}](./screenshots/${log.screenshot})`;
      lines.push(
        `| ${log.index} | ${log.label.replace(/\|/g, '\\|')} | ${log.type} | ${log.value.replace(/\|/g, '\\|')} | ${log.ok ? 'yes' : 'no'} | ${screenLink} |`
      );
      if (!log.ok && log.error) {
        lines.push(`|  | error |  | ${log.error.replace(/\|/g, '\\|')} |  |  |`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

test.describe('Live Full Audit', () => {
  test('Run all steps + side paths with screenshots and markdown report', async ({ page }) => {
    test.setTimeout(Number(process.env.PW_LIVE_AUDIT_TIMEOUT_MS || 120 * 60 * 1000));

    const slug = `live-full-audit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const rootDir = path.join(__dirname, 'live-audit-reports', slug);
    const screenshotDir = path.join(rootDir, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    const allScenarios = buildAllScenarios();
    const limitRaw = Number(process.env.PW_LIVE_SCENARIO_LIMIT || '0');
    const scenarios =
      Number.isFinite(limitRaw) && limitRaw > 0 ? allScenarios.slice(0, Math.floor(limitRaw)) : allScenarios;
    const results: ScenarioResult[] = [];
    const reportPath = path.join(rootDir, 'report.md');
    const reportJsonPath = path.join(rootDir, 'report.json');
    const latestPath = path.join(__dirname, 'live-audit-reports', 'LATEST.md');

    const writeProgress = () => {
      const report: AuditReport = {
        generatedAt: new Date().toISOString(),
        settleMs: LIVE_SETTLE_MS,
        scenarios: results,
      };
      fs.writeFileSync(reportPath, generateReportMarkdown(report), 'utf-8');
      fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf-8');
      fs.writeFileSync(
        latestPath,
        `# Latest Live Audit\n\n- Report: [${slug}/report.md](./${slug}/report.md)\n- JSON: [${slug}/report.json](./${slug}/report.json)\n`,
        'utf-8'
      );
    };

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`[live-audit] ${i + 1}/${scenarios.length} ${scenario.id} ...`);
      const result = await runScenario(page, scenario, screenshotDir);
      results.push(result);
      writeProgress();
      console.log(`[live-audit] ${scenario.id}: ${result.ok ? 'PASS' : 'FAIL'}`);
    }

    // Ensure final artifacts are present even when scenario loop ends early due limit.
    writeProgress();
    console.log('\nLive full audit written to:');
    console.log(`  Report: ${reportPath}`);
    console.log(`  JSON: ${reportJsonPath}`);
    console.log(`  Latest: ${latestPath}`);

    expect(results.length).toBeGreaterThan(0);
  });
});
