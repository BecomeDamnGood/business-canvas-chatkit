/**
 * Button Audit: systematically walks through all buttons and paths,
 * records what happens per button, and generates an analysis report.
 *
 * Run: npx playwright test button-audit.spec.ts
 * Run with visible browser (watch it run): npx playwright test button-audit.spec.ts --headed
 * With visible browser + slow motion: npx playwright test button-audit.spec.ts --project=headed
 * Debug mode (step through): npx playwright test button-audit.spec.ts --debug
 *
 * Report: tests/audit-reports/button-audit-*.md and .json
 * Screenshots: tests/audit-reports/screenshots/ (one per path + one per failed button click)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  getButtonsWithMetadata,
  capturePageState,
  stateFingerprint,
  waitForSettle,
  captureConsoleErrors,
  AUDIT_WAIT_MS,
  type ButtonInfo,
  type PageState,
  type ButtonClickResult,
} from './button-audit-helpers';
import { fillAndSend, waitForResponse } from './helpers';
import { getMockSequenceForPath, getMockAfterInputForPath } from './fixtures/run_step_mocks';

/** Action to reach a state in the flow */
type PathAction =
  | { type: 'click'; buttonText: string | RegExp }
  | { type: 'fill'; text: string }
  | { type: 'fillScores'; default: number; last: number };

/** A path = sequence of actions to reach a specific state */
interface AuditPath {
  id: string;
  description: string;
  actions: PathAction[];
}

/**
 * Strategy step: first 3 inputs, then 2 more (5 total).
 */
const STRATEGY_INPUTS = [
  'Focus exclusively on clients in the Netherlands',
  'Focus on clients with an annual budget above 40,000 euros',
  'Work only for clients who are healthy and profitable',
  'Never take on one-off projects for a client who is angry',
  'Only create advertising for companies that are purpose-driven',
];

/**
 * Rules of the Game step: first 2 inputs, then 2 more (4 total).
 */
const RULES_INPUTS = [
  'We maintain a formal and respectful tone in all interactions',
  'We are punctual',
  'We always seek innovative solutions',
  'We act professionally and happy',
];

/**
 * Default input values per path when the path has a textbox.
 * All steps with free-text input are covered. Customize if needed.
 */
const INPUT_VALUES: Record<string, string> = {
  'step0-initial': 'I run an advertising agency called Mindd',
  'step0-after-name': 'Yes',
  'dream-initial': 'A world where businesses thrive with purpose.',
  'dream-after-input': 'Continue',
  'purpose-initial': 'We help companies grow with strategic clarity.',
  'bigwhy-initial': 'Because businesses with clear purpose create lasting value.',
  'role-initial': 'Strategic partner and brand advisor',
  'entity-initial': 'an advertising agency',
  'strategy-with-choices': STRATEGY_INPUTS[0],
  'targetgroup-initial': 'Purpose-driven companies in the Netherlands',
  'productsservices-initial': 'Brand strategy, creative campaigns, digital design',
  'rules-initial': RULES_INPUTS[0],
  'presentation-initial': 'Please change the entity to: an advertising agency',
};

/** Dream Builder: 19 statements + 1 final statement (20 total) */
const DREAM_BUILDER_STATEMENTS = [
  "I want my work to make a positive difference in people's lives.",
  "I want to build something that lasts beyond me.",
  "I want to create freedom in my time and choices.",
  "I want to feel proud when I talk about what I do.",
  "I want my business to reflect who I am and what I stand for.",
  "I want to help people solve a problem they truly care about.",
  "I want to bring clarity and simplicity to a confusing area.",
  "I want to create a safe space where people feel seen and supported.",
  "I want to challenge the status quo and improve how things are done.",
  "I want to grow into the best version of myself through this business.",
  "I want to build a community around a shared belief or movement.",
  "I want to create opportunities for others (customers, partners, team).",
  "I want to do meaningful work without sacrificing my health or relationships.",
  "I want to be financially secure while doing work that feels right.",
  "I want to create beauty, quality, or craftsmanship people can feel.",
  "I want to make a complex process easier, faster, or more human.",
  "I want to inspire people to take action and believe in themselves.",
  "I want to contribute to a future I would be proud to leave behind.",
  "I want my business to be known for honesty, trust, and integrity.",
  "De kloof tussen arm en rijk wordt groter en tech bedrijven nemen de wereld over",
];

/** Off-topic questions to test per step (app should handle these gracefully) */
const OFF_TOPIC_QUESTIONS = [
  'Who is Ben Steenstra?',
  "What's the time in London?",
  'Why is this step needed?',
];

/** Paths that cover different states of the app */
const AUDIT_PATHS: AuditPath[] = [
  {
    id: 'prestart',
    description: 'Initial state before Start',
    actions: [],
  },
  {
    id: 'step0-initial',
    description: 'Step 0 - just after Start',
    actions: [{ type: 'click', buttonText: 'Start' }],
  },
  {
    id: 'step0-after-name',
    description: 'Step 0 - after entering business name',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
    ],
  },
  {
    id: 'dream-initial',
    description: 'Dream step - initial',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
    ],
  },
  {
    id: 'dream-after-input',
    description: 'Dream step - after entering dream',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive with purpose.' },
    ],
  },
  {
    id: 'dream-builder-scoring',
    description: 'Dream Builder - 20 statements, scoring (2 everywhere, last 9), then formulate',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'click', buttonText: /exercise|Do a small exercise/i },
      { type: 'fill', text: 'Yes' },
      ...DREAM_BUILDER_STATEMENTS.map((s) => ({ type: 'fill' as const, text: s })),
      { type: 'fillScores', default: 2, last: 9 },
      { type: 'click', buttonText: /Formulate my dream|based on what I find important/i },
    ],
  },
  {
    id: 'purpose-initial',
    description: 'Purpose step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
    ],
  },
  {
    id: 'bigwhy-initial',
    description: 'Big Why step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
    ],
  },
  {
    id: 'role-initial',
    description: 'Role step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
    ],
  },
  {
    id: 'entity-initial',
    description: 'Entity step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
    ],
  },
  {
    id: 'strategy-with-choices',
    description: 'Strategy step - 5 inputs: first 3, then 2',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
      { type: 'fill', text: 'an advertising agency' },
      { type: 'fill', text: STRATEGY_INPUTS[0] },
      { type: 'fill', text: STRATEGY_INPUTS[1] },
      { type: 'fill', text: STRATEGY_INPUTS[2] },
      { type: 'click', buttonText: /continue to step 7 Strategy|continue to the Target Group|Continue/i },
      { type: 'fill', text: STRATEGY_INPUTS[3] },
      { type: 'fill', text: STRATEGY_INPUTS[4] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
    ],
  },
  {
    id: 'targetgroup-initial',
    description: 'Target Group step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
      { type: 'fill', text: 'an advertising agency' },
      { type: 'fill', text: STRATEGY_INPUTS[0] },
      { type: 'fill', text: STRATEGY_INPUTS[1] },
      { type: 'fill', text: STRATEGY_INPUTS[2] },
      { type: 'click', buttonText: /continue to step 7 Strategy|continue to the Target Group|Continue/i },
      { type: 'fill', text: STRATEGY_INPUTS[3] },
      { type: 'fill', text: STRATEGY_INPUTS[4] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
    ],
  },
  {
    id: 'productsservices-initial',
    description: 'Products and Services step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
      { type: 'fill', text: 'an advertising agency' },
      { type: 'fill', text: STRATEGY_INPUTS[0] },
      { type: 'fill', text: STRATEGY_INPUTS[1] },
      { type: 'fill', text: STRATEGY_INPUTS[2] },
      { type: 'click', buttonText: /continue to step 7 Strategy|continue to the Target Group|Continue/i },
      { type: 'fill', text: STRATEGY_INPUTS[3] },
      { type: 'fill', text: STRATEGY_INPUTS[4] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
      { type: 'fill', text: 'Purpose-driven companies' },
      { type: 'click', buttonText: /continue to the Target Group|continue to the Products|Continue/i },
    ],
  },
  {
    id: 'rules-initial',
    description: 'Rules of the Game step',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
      { type: 'fill', text: 'an advertising agency' },
      { type: 'fill', text: STRATEGY_INPUTS[0] },
      { type: 'fill', text: STRATEGY_INPUTS[1] },
      { type: 'fill', text: STRATEGY_INPUTS[2] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
      { type: 'fill', text: STRATEGY_INPUTS[3] },
      { type: 'fill', text: STRATEGY_INPUTS[4] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
      { type: 'fill', text: 'Purpose-driven companies' },
      { type: 'click', buttonText: /continue to the Target Group|continue to the Products|Continue/i },
      { type: 'fill', text: 'Brand strategy, campaigns' },
      { type: 'click', buttonText: /This is all what we offer|continue to step Rules|Continue/i },
    ],
  },
  {
    id: 'presentation-initial',
    description: 'Presentation step – recap and create',
    actions: [
      { type: 'click', buttonText: 'Start' },
      { type: 'fill', text: 'I run an advertising agency called Mindd' },
      { type: 'click', buttonText: /Yes, I'm ready|Continue/i },
      { type: 'fill', text: 'A world where businesses thrive.' },
      { type: 'click', buttonText: /continue to the Purpose step|Continue/i },
      { type: 'fill', text: 'We help companies grow.' },
      { type: 'click', buttonText: /continue to the Big Why|Continue/i },
      { type: 'fill', text: 'Because growth matters.' },
      { type: 'click', buttonText: /continue to the Role|Continue/i },
      { type: 'fill', text: 'Strategic advisor' },
      { type: 'click', buttonText: /continue to the Entity|Continue/i },
      { type: 'fill', text: 'an advertising agency' },
      { type: 'fill', text: STRATEGY_INPUTS[0] },
      { type: 'fill', text: STRATEGY_INPUTS[1] },
      { type: 'fill', text: STRATEGY_INPUTS[2] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
      { type: 'fill', text: STRATEGY_INPUTS[3] },
      { type: 'fill', text: STRATEGY_INPUTS[4] },
      { type: 'click', buttonText: /continue to the Strategy step|continue to the Target Group|Continue/i },
      { type: 'fill', text: 'Purpose-driven companies' },
      { type: 'click', buttonText: /continue to the Target Group|continue to the Products|Continue/i },
      { type: 'fill', text: 'Brand strategy, campaigns' },
      { type: 'click', buttonText: /This is all what we offer|continue to step Rules|Continue/i },
      { type: 'fill', text: RULES_INPUTS[0] },
      { type: 'fill', text: RULES_INPUTS[1] },
      { type: 'click', buttonText: /continue|Continue/i },
      { type: 'fill', text: RULES_INPUTS[2] },
      { type: 'fill', text: RULES_INPUTS[3] },
      { type: 'click', buttonText: /continue to Presentation|These are all my rules|Presentation/i },
    ],
  },
];

/**
 * Fill chat input and send. Uses smart discovery (helpers.fillAndSend).
 * Text is from path/step context (INPUT_VALUES, path actions, OFF_TOPIC_QUESTIONS)
 * so we preserve semantic knowledge of what goes where.
 */
async function fillChatInputAndSend(
  page: import('@playwright/test').Page,
  text: string
): Promise<void> {
  await page.locator('#inputWrap').waitFor({ state: 'visible', timeout: 20000 });
  await fillAndSend(page, text);
  await waitForSettle(page);
}

async function executePathAction(
  page: import('@playwright/test').Page,
  action: PathAction
): Promise<void> {
  if (action.type === 'click') {
    const btnText = typeof action.buttonText === 'string' ? action.buttonText : action.buttonText;
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/run_step') && r.request().method() === 'POST',
      { timeout: 60000 }
    );
    const btn = page.getByRole('button').filter({ hasText: btnText });
    await btn.first().click();
    try {
      await responsePromise;
    } catch (e) {
      console.warn('[AUDIT] executePathAction: run_step wait failed:', (e as Error).message);
    }
    await waitForSettle(page);
  } else if (action.type === 'fill') {
    await fillChatInputAndSend(page, action.text);
  } else if (action.type === 'fillScores') {
    const inputs = page.locator('.scoreInput');
    await inputs.first().waitFor({ state: 'visible', timeout: 20000 });
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const val = i === count - 1 ? String(action.last) : String(action.default);
      await inputs.nth(i).fill(val);
    }
    await waitForSettle(page, 500);
  }
}

/** Mock queue for run_step - set before each navigateToPath */
let runStepMockQueue: Record<string, unknown>[] = [];

async function navigateToPath(
  page: import('@playwright/test').Page,
  pathDef: AuditPath,
  options?: { screenshotsDir: string; slug: string; extraMockForInput?: boolean }
): Promise<{ ok: boolean; stepScreenshots: string[] }> {
  const stepScreenshots: string[] = [];
  runStepMockQueue = [...getMockSequenceForPath(pathDef.id)];
  if (options?.extraMockForInput) {
    runStepMockQueue.push(getMockAfterInputForPath(pathDef.id));
  }
  await page.goto('/test');
  await waitForResponse(page, 1000);

  if (options && pathDef.actions.length === 0) {
    const name = `${options.slug}-${pathDef.id}-step0.png`;
    const p = path.join(options.screenshotsDir, name);
    await page.screenshot({ path: p, fullPage: true });
    stepScreenshots.push(name);
  }

  for (let i = 0; i < pathDef.actions.length; i++) {
    try {
      await executePathAction(page, pathDef.actions[i]);
      if (options) {
        const name = `${options.slug}-${pathDef.id}-step${i}.png`;
        const p = path.join(options.screenshotsDir, name);
        await page.screenshot({ path: p, fullPage: true });
        stepScreenshots.push(name);
      }
    } catch (e) {
      console.warn(`Path ${pathDef.id} failed at action:`, pathDef.actions[i], e);
      return { ok: false, stepScreenshots };
    }
  }
  return { ok: true, stepScreenshots };
}

async function clickButtonAndRecord(
  page: import('@playwright/test').Page,
  btn: ButtonInfo,
  buttonIndex: number
): Promise<ButtonClickResult> {
  const stateBefore = await capturePageState(page);
  const stopCapture = captureConsoleErrors(page);

  let success = true;
  let errorMessage: string | null = null;

  try {
    const locator = btn.id
      ? page.locator(`button#${btn.id}`)
      : page.locator('button:visible').nth(buttonIndex);
    await locator.click();
    await waitForSettle(page);
  } catch (e) {
    success = false;
    errorMessage = (e as Error).message;
  }

  const consoleErrors = stopCapture();
  const stateAfter = await capturePageState(page);
  const stateChanged = stateFingerprint(stateBefore) !== stateFingerprint(stateAfter);

  return {
    button: btn,
    stateBefore,
    stateAfter,
    success,
    errorMessage,
    consoleErrors,
    stateChanged,
  };
}

interface InputFieldResult {
  valueUsed: string;
  stateBefore: PageState;
  stateAfter: PageState;
  success: boolean;
  errorMessage: string | null;
  stateChanged: boolean;
}

interface AuditReport {
  timestamp: string;
  paths: Array<{
    pathId: string;
    pathDescription: string;
    reached: boolean;
    stateAtPath: PageState | null;
    buttons: ButtonInfo[];
    results: ButtonClickResult[];
    inputFieldResult?: InputFieldResult | null;
    offTopicResults?: InputFieldResult[];
    issues: string[];
    screenshotPath?: string;
    stepScreenshots?: string[];
    failureScreenshots?: string[];
  }>;
}

function generateMarkdownReport(
  report: AuditReport,
  screenshotsDir?: string,
  slug?: string
): string {
  const totalIssues = report.paths.reduce((s, p) => s + p.issues.length, 0);
  const lines: string[] = [
    '# Button Audit Report',
    '',
    `Generated: ${report.timestamp}`,
    '',
    '## Summary',
    '',
    `- Paths explored: ${report.paths.length}`,
    `- Paths reached: ${report.paths.filter(p => p.reached).length}`,
    `- Total buttons audited: ${report.paths.reduce((s, p) => s + p.results.length, 0)}`,
    `- Input fields tested: ${report.paths.filter(p => p.inputFieldResult).length}`,
    `- **Total issues found: ${totalIssues}**`,
    '',
    '---',
    '',
  ];

  if (totalIssues > 0) {
    lines.push('## All issues (quick reference)');
    lines.push('');
    for (const path of report.paths) {
      for (const issue of path.issues) {
        lines.push(`- **[${path.pathId}]** ${issue}`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const path of report.paths) {
    lines.push(`## Path: ${path.pathId}`);
    lines.push('');
    lines.push(`**Description:** ${path.pathDescription}`);
    lines.push(`**Reached:** ${path.reached ? 'Yes' : 'No'}`);
    if (path.stateAtPath) {
      lines.push(`**Step:** ${path.stateAtPath.stepIndicator ?? 'N/A'}`);
      lines.push(`**Section:** ${path.stateAtPath.sectionTitle ?? 'N/A'}`);
    }
    const screenshotName = path.screenshotPath
      ? path.screenshotPath.split(/[/\\]/).pop()
      : null;
    if (screenshotName && screenshotsDir) {
      lines.push(`**Screenshot:** [${screenshotName}](./screenshots/${screenshotName})`);
    }
    if (path.stepScreenshots && path.stepScreenshots.length > 1 && screenshotsDir) {
      lines.push(`**Step screenshots:** ${path.stepScreenshots.map((s, i) => `[step${i}](./screenshots/${s})`).join(', ')}`);
    }
    if (path.failureScreenshots && path.failureScreenshots.length > 0) {
      lines.push(`**Failure screenshots:** ${path.failureScreenshots.map(f => `[${f}](./screenshots/${f})`).join(', ')}`);
    }
    lines.push('');

    if (path.issues.length > 0) {
      lines.push('### Issues');
      for (const issue of path.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    lines.push('### Buttons and outcomes');
    lines.push('');
    lines.push('| Button | ID | Disabled | Click OK | State changed | Error |');
    lines.push('|--------|-----|----------|-----------|---------------|-------|');

    for (const r of path.results) {
      const err = r.errorMessage ? r.errorMessage.slice(0, 50) + '...' : (r.consoleErrors[0]?.slice(0, 30) ?? '-');
      lines.push(
        `| ${r.button.text.replace(/\|/g, '\\|').slice(0, 40)} | ${r.button.id ?? '-'} | ${r.button.disabled} | ${r.success} | ${r.stateChanged} | ${err} |`
      );
    }
    if (path.inputFieldResult) {
      lines.push('');
      lines.push('### Input field test');
      lines.push('');
      const ir = path.inputFieldResult;
      lines.push(`- **Value used:** \`${ir.valueUsed}\``);
      lines.push(`- **Success:** ${ir.success}`);
      lines.push(`- **State changed:** ${ir.stateChanged}`);
      if (ir.errorMessage) lines.push(`- **Error:** ${ir.errorMessage}`);
    }
    if (path.offTopicResults && path.offTopicResults.length > 0) {
      lines.push('');
      lines.push('### Off-topic questions test');
      lines.push('');
      for (const ot of path.offTopicResults) {
        lines.push(`- **"${ot.valueUsed}"** → Success: ${ot.success}, State changed: ${ot.stateChanged}`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

test.describe('Button Audit', () => {
  test('Run full button audit and generate report', async ({ page }) => {
    test.setTimeout(600000); // 10 min – many paths + server calls

    // Mock /run_step to avoid LLM calls – fast, deterministic
    await page.route('**/run_step', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const next = runStepMockQueue.shift();
      if (next) await route.fulfill({ json: next });
      else await route.fulfill({ status: 500, json: { error: 'No mock for run_step' } });
    });

    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      paths: [],
    };
    const slug = `button-audit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const reportsDir = path.join(__dirname, 'audit-reports');
    const screenshotsDir = path.join(reportsDir, 'screenshots');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

    for (const pathDef of AUDIT_PATHS) {
      const pathResult = {
        pathId: pathDef.id,
        pathDescription: pathDef.description,
        reached: false,
        stateAtPath: null as PageState | null,
        buttons: [] as ButtonInfo[],
        results: [] as ButtonClickResult[],
        inputFieldResult: undefined as InputFieldResult | undefined,
        offTopicResults: [] as InputFieldResult[],
        issues: [] as string[],
        screenshotPath: undefined as string | undefined,
        stepScreenshots: [] as string[],
        failureScreenshots: [] as string[],
      };

      const { ok, stepScreenshots } = await navigateToPath(page, pathDef, {
        screenshotsDir,
        slug,
      });
      pathResult.reached = ok;
      pathResult.stepScreenshots = stepScreenshots;

      if (!ok) {
        pathResult.issues.push(`Could not reach this path (failed during navigation)`);
        report.paths.push(pathResult);
        continue;
      }

      pathResult.stateAtPath = await capturePageState(page);
      pathResult.buttons = await getButtonsWithMetadata(page);

      // Final state screenshot (last step screenshot, or state.png if no steps)
      const stateScreenshotName =
        stepScreenshots.length > 0
          ? stepScreenshots[stepScreenshots.length - 1]
          : `${slug}-${pathDef.id}-state.png`;
      pathResult.screenshotPath = path.join(screenshotsDir, stateScreenshotName);
      if (stepScreenshots.length === 0) {
        await page.screenshot({ path: pathResult.screenshotPath, fullPage: true });
      }

      if (pathResult.buttons.length === 0 && pathDef.actions.length > 0) {
        pathResult.issues.push('No visible buttons found at this state');
      }

      for (let i = 0; i < pathResult.buttons.length; i++) {
        const btn = pathResult.buttons[i];
        // Re-navigate to this path before each button click (each click may change state)
        await navigateToPath(page, pathDef);
        const result = await clickButtonAndRecord(page, btn, i);
        pathResult.results.push(result);

        if (!result.success) {
          pathResult.issues.push(`Button "${btn.text}" (${btn.id ?? 'no-id'}): click failed - ${result.errorMessage}`);
          const failName = `${slug}-${pathDef.id}-btn${i}-fail.png`;
          const failPath = path.join(screenshotsDir, failName);
          await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
          pathResult.failureScreenshots?.push(failName);
        }
        if (result.consoleErrors.length > 0) {
          pathResult.issues.push(`Button "${btn.text}": console errors: ${result.consoleErrors.join('; ')}`);
        }
        if (btn.disabled && !pathResult.stateAtPath?.isLoading) {
          pathResult.issues.push(`Button "${btn.text}" is disabled (expected to be clickable?)`);
        }
      }

      // Test input field when this path has a textbox
      if (pathResult.reached && pathResult.stateAtPath?.hasTextbox) {
        const inputValue = INPUT_VALUES[pathDef.id] ?? 'Test input';
        await navigateToPath(page, pathDef, { extraMockForInput: true });
        const stateBeforeInput = await capturePageState(page);
        const stopCapture = captureConsoleErrors(page);
        let inputSuccess = true;
        let inputError: string | null = null;
        try {
          await fillChatInputAndSend(page, inputValue);
        } catch (e) {
          inputSuccess = false;
          inputError = (e as Error).message;
        }
        const inputConsoleErrors = stopCapture();
        const stateAfterInput = await capturePageState(page);
        pathResult.inputFieldResult = {
          valueUsed: inputValue,
          stateBefore: stateBeforeInput,
          stateAfter: stateAfterInput,
          success: inputSuccess,
          errorMessage: inputError,
          stateChanged: stateFingerprint(stateBeforeInput) !== stateFingerprint(stateAfterInput),
        };
        if (!inputSuccess) {
          pathResult.issues.push(`Input field: fill/send failed - ${inputError}`);
        }
        if (inputConsoleErrors.length > 0) {
          pathResult.issues.push(`Input field: console errors: ${inputConsoleErrors.join('; ')}`);
        }

        // Test off-topic questions per step
        for (const offTopicQ of OFF_TOPIC_QUESTIONS) {
          await navigateToPath(page, pathDef, { extraMockForInput: true });
          const stateBeforeOT = await capturePageState(page);
          const stopOT = captureConsoleErrors(page);
          let otSuccess = true;
          let otError: string | null = null;
          try {
            await fillChatInputAndSend(page, offTopicQ);
          } catch (e) {
            otSuccess = false;
            otError = (e as Error).message;
          }
          const otConsoleErrors = stopOT();
          const stateAfterOT = await capturePageState(page);
          pathResult.offTopicResults!.push({
            valueUsed: offTopicQ,
            stateBefore: stateBeforeOT,
            stateAfter: stateAfterOT,
            success: otSuccess,
            errorMessage: otError,
            stateChanged: stateFingerprint(stateBeforeOT) !== stateFingerprint(stateAfterOT),
          });
          if (!otSuccess) {
            pathResult.issues.push(`Off-topic "${offTopicQ.slice(0, 30)}...": ${otError}`);
          }
        }
      }

      report.paths.push(pathResult);
    }

    const jsonPath = path.join(reportsDir, `${slug}.json`);
    const mdPath = path.join(reportsDir, `${slug}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    fs.writeFileSync(mdPath, generateMarkdownReport(report, screenshotsDir, slug), 'utf-8');

    console.log(`\nButton audit report written to:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Markdown: ${mdPath}`);
    console.log(`  Screenshots: ${screenshotsDir}`);

    const totalIssues = report.paths.reduce((s, p) => s + p.issues.length, 0);
    expect(totalIssues).toBeDefined(); // Test always passes; report is the deliverable
  });
});
