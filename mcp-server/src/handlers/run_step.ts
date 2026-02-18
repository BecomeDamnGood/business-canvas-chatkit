// mcp-server/src/handlers/run_step.ts
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { callStrictJson, type LLMUsage } from "../core/llm.js";
import { resolveModelForCall } from "../core/model_routing.js";
import { appendSessionTokenLog } from "../core/session_token_log.js";
import {
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  CanvasStateZod,
  type CanvasState,
  type BoolString,
} from "../core/state.js";
import {
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
  type OrchestratorOutput,
} from "../core/orchestrator.js";
import {
  getPresentationTemplatePath,
  hasPresentationTemplate,
} from "../core/presentation_paths.js";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_INSTRUCTIONS,
  DreamJsonSchema,
  DreamZodSchema,
  buildDreamSpecialistInput,
  type DreamOutput,
} from "../steps/dream.js";

import {
  DREAM_EXPLAINER_SPECIALIST,
  DREAM_EXPLAINER_INSTRUCTIONS,
  DreamExplainerJsonSchema,
  DreamExplainerZodSchema,
  buildDreamExplainerSpecialistInput,
  type DreamExplainerOutput,
} from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  PURPOSE_INSTRUCTIONS,
  PurposeJsonSchema,
  PurposeZodSchema,
  buildPurposeSpecialistInput,
  type PurposeOutput,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  BIGWHY_INSTRUCTIONS,
  BigWhyJsonSchema,
  BigWhyZodSchema,
  buildBigWhySpecialistInput,
  type BigWhyOutput,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ROLE_INSTRUCTIONS,
  RoleJsonSchema,
  RoleZodSchema,
  buildRoleSpecialistInput,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  ENTITY_INSTRUCTIONS,
  EntityJsonSchema,
  EntityZodSchema,
  buildEntitySpecialistInput,
  type EntityOutput,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  STRATEGY_INSTRUCTIONS,
  StrategyJsonSchema,
  StrategyZodSchema,
  buildStrategySpecialistInput,
  type StrategyOutput,
} from "../steps/strategy.js";

import {
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
  TARGETGROUP_INSTRUCTIONS,
  TargetGroupJsonSchema,
  TargetGroupZodSchema,
  buildTargetGroupSpecialistInput,
  type TargetGroupOutput,
} from "../steps/targetgroup.js";

import {
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
  PRODUCTSSERVICES_INSTRUCTIONS,
  ProductsServicesJsonSchema,
  ProductsServicesZodSchema,
  buildProductsServicesSpecialistInput,
  type ProductsServicesOutput,
} from "../steps/productsservices.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  RULESOFTHEGAME_INSTRUCTIONS,
  RulesOfTheGameJsonSchema,
  RulesOfTheGameZodSchema,
  buildRulesOfTheGameSpecialistInput,
  type RulesOfTheGameOutput,
  postProcessRulesOfTheGame,
  postProcessRulesOfTheGameFromBullets,
  buildRulesOfTheGameBullets,
  buildUserFeedbackForRulesProcessing,
} from "../steps/rulesofthegame.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  PRESENTATION_INSTRUCTIONS,
  PresentationJsonSchema,
  PresentationZodSchema,
  buildPresentationSpecialistInput,
  type PresentationOutput,
} from "../steps/presentation.js";
import { loadModule as loadCld3 } from "cld3-asm";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { renderFreeTextTurnPolicy, type TurnPolicyRenderResult } from "../core/turn_policy_renderer.js";
import { UI_CONTRACT_VERSION } from "../core/ui_contract_matrix.js";
import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import type { RenderedAction } from "../contracts/ui_actions.js";

/**
 * Incoming tool args
 * NOTE: Some tool callers include current_step_id ("start") — accepted but not relied on.
 */
const RunStepArgsSchema = z.object({
  current_step_id: z.string().optional().default("step_0"),
  user_message: z.string().default(""),
  input_mode: z.enum(["widget", "chat"]).optional().default("chat"),
  // Use CanvasStateZod schema for type safety and validation
  // .partial() makes all fields optional (for empty/partial state)
  // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
  state: CanvasStateZod.partial().passthrough().optional(),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

const STEP0_CARDDESC_EN = "Just to set the context, we'll start with the basics.";
const STEP0_QUESTION_EN =
  "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?";
function step0QuestionForLang(_lang: string): string {
  return STEP0_QUESTION_EN;
}

function yesTokenForLang(_lang: string): string {
  return "yes";
}

const PRESTART_WELCOME_DEFAULT =
  `Build a complete Business Model and Strategy Canvas step by step.

<strong>The Proven Standard</strong>
A globally implemented strategy canvas used by teams worldwide, built through Ben Steenstra's unique step-by-step method of questioning and structured development.

<strong>By the end you'll have</strong><ul>
<li>A focused canvas that fits on one page</li>
<li>A presentation you can use immediately (PPTX)</li>
<li>A plan your team can align around</li>
</ul><strong>How it works</strong>
One question at a time. Clear input, structured output.

<strong>Time</strong>
Estimated time: 10–15 minutes.`;


const UI_STRINGS_DEFAULT: Record<string, string> = {
  "title.step_0": "Step 1: Validation & Business Name",
  "title.dream": "Step 2: Dream",
  "title.purpose": "Step 3: Purpose",
  "title.bigwhy": "Step 4: Big Why",
  "title.role": "Step 5: Role",
  "title.entity": "Step 6: Entity",
  "title.strategy": "Step 7: Strategy",
  "title.targetgroup": "Step 8: Target Group",
  "title.productsservices": "Step 9: Products and Services",
  "title.rulesofthegame": "Step 10: Rules of the game",
  "title.presentation": "Step 11: Presentation",
  prestartWelcome: PRESTART_WELCOME_DEFAULT,
  uiSubtitle: "Use The Business Strategy Canvas Builder widget to continue (not the chat box)",
  uiUseWidgetToContinue: "Use The Business Strategy Canvas Builder widget to continue (not the chat box).",
  btnGoToNextStep: "Go to next step",
  byText: "A business model by:",
  startHint: "Click Start to begin.",
  inputPlaceholder: "Type your answer here (use The Business Strategy Canvas Builder widget, not the chat box)…",
  thinking: "Thinking…",
  btnStart: "Start the process with Validation & Business Name",
  btnDreamConfirm: "I'm happy with this formulation, continue to the Purpose step",
  wordingChoiceHeading: "This is your input:",
  wordingChoiceSuggestionLabel: "This would be my suggestion:",
  wordingChoiceInstruction: "Please click what suits you best.",
  "dreamBuilder.startExercise": "Start the exercise",
  "dreamBuilder.statements.title": "Your Dream statements",
  "dreamBuilder.statements.count": "N statements out of a minimum of 20 so far",
  "dreamBuilder.statements.empty": "No statements yet.",
  btnSwitchToSelfDream: "Switch back to self-formulate the dream",
  sendTitle: "Send",
  errorMessage: "Something went wrong while processing your message. Please try again.",
  scoringIntro1: "You now have more than 20 statements, so I've clustered them for you. You can still edit and add statements, but please give them a score.",
  scoringIntro2: "",
  scoringIntro3: "The average per cluster updates immediately while you type.",
  scoringDreamQuestion: "You can see above, based on your scores, which topics matter most to you. Do you now have a clearer idea of what your Dream could be about, and can you say something about it? Or would you prefer that I formulate a Dream for you based on what you find important?",
  btnScoringContinue: "Formulate my dream for me based on what I find important.",
  scoringFilled: "N/M",
  scoringAvg: "Average: X",
  purposeInstructionHint: "Answer the question, formulate your own Purpose, or choose an option",
  "sectionTitle.dream": "Your Dream",
  "sectionTitle.purposeOf": "The Purpose of {0}",
  "sectionTitle.purposeOfFuture": "The Purpose of your future company",
  "sectionTitle.bigwhyOf": "The Big Why of {0}",
  "sectionTitle.bigwhyOfFuture": "The Big Why of your future company",
  "sectionTitle.roleOf": "The Role of {0}",
  "sectionTitle.roleOfFuture": "The Role of your future company",
  "sectionTitle.entityOf": "The Entity of {0}",
  "sectionTitle.entityOfFuture": "The Entity of your future company",
  "sectionTitle.strategyOf": "The Strategy of {0}",
  "sectionTitle.strategyOfFuture": "The Strategy of your future company",
  "sectionTitle.targetgroupOf": "The Target Group of {0}",
  "sectionTitle.targetgroupOfFuture": "The Target Group of your future company",
  "sectionTitle.productsservicesOf": "The Products and Services of {0}",
  "sectionTitle.productsservicesOfFuture": "The Products and Services of your future company",
  "sectionTitle.rulesofthegameOf": "The Rules of the game of {0}",
  "sectionTitle.rulesofthegameOfFuture": "The Rules of the game of your future company",
  "sectionTitle.presentation": "Create your Presentation",
};

const UI_STRINGS_KEYS = Object.keys(UI_STRINGS_DEFAULT);
const UiStringsZodSchema = z.object(
  UI_STRINGS_KEYS.reduce<Record<string, z.ZodString>>((acc, k) => {
    acc[k] = z.string();
    return acc;
  }, {})
);
const UiStringsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: UI_STRINGS_KEYS,
  properties: UI_STRINGS_KEYS.reduce<Record<string, { type: "string" }>>((acc, k) => {
    acc[k] = { type: "string" };
    return acc;
  }, {}),
} as const;

const UI_STRINGS_CACHE = new Map<string, Record<string, string>>();

function langFromState(state: CanvasState): string {
  if (isForceEnglishLanguageMode()) return "en";
  const l = String((state as any).language ?? "").trim().toLowerCase();
  return l || "en";
}

function shouldLogLocalDevDiagnostics(): boolean {
  return process.env.LOCAL_DEV === "1" || process.env.MENU_POLICY_DEBUG === "1";
}

type HolisticPolicyFlags = {
  holisticPolicyV2: boolean;
  offtopicV2: boolean;
  bulletRenderV2: boolean;
  wordingChoiceV2: boolean;
  timeoutGuardV2: boolean;
};

type MigrationFlags = {
  intentsV1: boolean;
  structuredActionsV1: boolean;
};

type CallUsageSnapshot = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  provider_available: boolean;
};

type TurnLlmAccumulator = {
  calls: number;
  attempts: number;
  input_tokens_sum: number;
  output_tokens_sum: number;
  total_tokens_sum: number;
  input_unknown: boolean;
  output_unknown: boolean;
  total_unknown: boolean;
  provider_available: boolean;
  models: Set<string>;
};

type TurnLlmCallMeta = {
  model: string;
  attempts: number;
  usage: CallUsageSnapshot;
};

const WIDGET_ESCAPE_MENU_SUFFIX = "_MENU_ESCAPE";
const DREAM_EXPLAINER_ESCAPE_MENU_ID = "DREAM_EXPLAINER_MENU_ESCAPE";
const DREAM_EXPLAINER_SWITCH_SELF_MENU_ID = "DREAM_EXPLAINER_MENU_SWITCH_SELF";
const WIDGET_ESCAPE_LABEL_PATTERNS: RegExp[] = [
  /\bfinish\s+later\b/i,
  /\bcontinue\b[^\n\r]{0,80}\bnow\b/i,
];
const DREAM_EXPLAINER_ESCAPE_ACTION_CODES = new Set(
  (ACTIONCODE_REGISTRY.menus[DREAM_EXPLAINER_ESCAPE_MENU_ID] || [])
    .map((code) => String(code || "").trim())
    .filter(Boolean)
);
const WIDGET_ESCAPE_ACTION_CODE_BAN = new Set<string>(
  Object.entries(ACTIONCODE_REGISTRY.menus)
    .filter(([menuId]) => String(menuId || "").trim().endsWith(WIDGET_ESCAPE_MENU_SUFFIX))
    .flatMap(([, actionCodes]) => (Array.isArray(actionCodes) ? actionCodes : []))
    .map((code) => String(code || "").trim())
    .filter(Boolean)
    .filter((code) => !DREAM_EXPLAINER_ESCAPE_ACTION_CODES.has(code))
);

function envFlagEnabled(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveHolisticPolicyFlags(): HolisticPolicyFlags {
  // In local development we keep the holistic policy stack enabled by default
  // so `LOCAL_DEV=1 npm run dev` is sufficient and consistent.
  const localDevDefaults = process.env.LOCAL_DEV === "1";
  const holisticPolicyV2 = envFlagEnabled("BSC_HOLISTIC_POLICY_V2", localDevDefaults);
  return {
    holisticPolicyV2,
    offtopicV2: holisticPolicyV2 && envFlagEnabled("BSC_OFFTOPIC_V2", localDevDefaults),
    bulletRenderV2: holisticPolicyV2 && envFlagEnabled("BSC_BULLET_RENDER_V2", localDevDefaults),
    wordingChoiceV2: holisticPolicyV2 && envFlagEnabled("BSC_WORDING_CHOICE_V2", localDevDefaults),
    timeoutGuardV2: holisticPolicyV2 && envFlagEnabled("BSC_TIMEOUT_GUARD_V2", localDevDefaults),
  };
}

function resolveMigrationFlags(): MigrationFlags {
  const localDevDefaults = process.env.LOCAL_DEV === "1";
  return {
    intentsV1: envFlagEnabled("BSC_INTENTS_V1", true),
    structuredActionsV1: envFlagEnabled("BSC_STRUCTURED_ACTIONS_V1", localDevDefaults),
  };
}

function createTurnLlmAccumulator(): TurnLlmAccumulator {
  return {
    calls: 0,
    attempts: 0,
    input_tokens_sum: 0,
    output_tokens_sum: 0,
    total_tokens_sum: 0,
    input_unknown: false,
    output_unknown: false,
    total_unknown: false,
    provider_available: false,
    models: new Set<string>(),
  };
}

function normalizeUsage(usage?: LLMUsage | null): CallUsageSnapshot {
  return {
    input_tokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
    output_tokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    total_tokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
    provider_available: Boolean(usage?.provider_available),
  };
}

function registerTurnLlmCall(acc: TurnLlmAccumulator, meta: TurnLlmCallMeta): void {
  const usage = normalizeUsage(meta.usage);
  const model = String(meta.model || "").trim();
  if (model) acc.models.add(model);
  acc.calls += 1;
  acc.attempts += Number.isFinite(meta.attempts) ? Math.max(0, Math.trunc(meta.attempts)) : 0;
  acc.provider_available = acc.provider_available || usage.provider_available;

  if (usage.input_tokens === null) acc.input_unknown = true;
  else acc.input_tokens_sum += usage.input_tokens;

  if (usage.output_tokens === null) acc.output_unknown = true;
  else acc.output_tokens_sum += usage.output_tokens;

  if (usage.total_tokens === null) acc.total_unknown = true;
  else acc.total_tokens_sum += usage.total_tokens;
}

function turnUsageFromAccumulator(acc: TurnLlmAccumulator): CallUsageSnapshot {
  if (acc.calls === 0) {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      provider_available: true,
    };
  }
  return {
    input_tokens: acc.input_unknown ? null : acc.input_tokens_sum,
    output_tokens: acc.output_unknown ? null : acc.output_tokens_sum,
    total_tokens: acc.total_unknown ? null : acc.total_tokens_sum,
    provider_available: acc.provider_available,
  };
}

function isEscapeMenuId(menuId: string): boolean {
  return String(menuId || "").trim().endsWith(WIDGET_ESCAPE_MENU_SUFFIX);
}

function isWidgetSuppressedEscapeMenuId(menuId: string): boolean {
  const id = String(menuId || "").trim();
  return isEscapeMenuId(id) && id !== DREAM_EXPLAINER_ESCAPE_MENU_ID;
}

function hasEscapeLabelPhrase(input: string): boolean {
  const text = String(input || "");
  if (!text) return false;
  return WIDGET_ESCAPE_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeEscapeInWidget(specialist: any): any {
  const safe = specialist && typeof specialist === "object" ? { ...specialist } : {};
  const menuId = String(safe.menu_id || "").trim();
  if (menuId === DREAM_EXPLAINER_ESCAPE_MENU_ID) return safe;
  const action = String(safe.action || "").trim().toUpperCase();
  const question = String(safe.question || "");
  const message = String(safe.message || "");
  const hasEscapeSignal =
    isWidgetSuppressedEscapeMenuId(menuId) ||
    action === "ESCAPE" ||
    hasEscapeLabelPhrase(question) ||
    hasEscapeLabelPhrase(message);
  if (!hasEscapeSignal) return safe;

  safe.is_offtopic = true;
  safe.action = "ASK";
  safe.menu_id = "";
  if (isWidgetSuppressedEscapeMenuId(menuId) || action === "ESCAPE" || hasEscapeLabelPhrase(question)) {
    safe.question = "";
  }
  if (hasEscapeLabelPhrase(message)) {
    safe.message = String(message || "")
      .split(/\r?\n/)
      .filter((line) => !hasEscapeLabelPhrase(line))
      .join("\n")
      .trim();
  }
  safe.wording_choice_pending = "false";
  safe.wording_choice_selected = "";
  return safe;
}

function detectLegacySessionMarkers(state: Record<string, unknown> | CanvasState): string[] {
  const reasons: string[] = [];
  const stateVersion = String((state as any).state_version || "").trim();
  if (stateVersion && stateVersion !== CURRENT_STATE_VERSION) {
    reasons.push("state_version_mismatch");
  }
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  const action = String(last.action || "").trim().toUpperCase();
  if (action === "CONFIRM") {
    reasons.push("legacy_action_confirm");
  }
  if (String(last.confirmation_question || "").trim()) {
    reasons.push("legacy_confirmation_question");
  }
  for (const key of ["proceed_to_dream", "proceed_to_purpose", "proceed_to_next"]) {
    if (String((last as any)[key] || "").trim().toLowerCase() === "true") {
      reasons.push(`legacy_${key}`);
    }
  }
  if (String((state as any).__ui_phase || "").trim()) {
    reasons.push("legacy_ui_phase_marker");
  }
  return reasons;
}

function validateRenderedContractTurn(stepId: string, rendered: TurnPolicyRenderResult): string | null {
  const specialist = (rendered.specialist || {}) as Record<string, unknown>;
  const action = String(specialist.action || "").trim().toUpperCase();
  const contractId = String(rendered.contractId || specialist.ui_contract_id || "").trim();
  const menuId = String(specialist.menu_id || "").trim();
  const actionCodes = Array.isArray(rendered.uiActionCodes)
    ? rendered.uiActionCodes.map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const uiActions = Array.isArray(rendered.uiActions) ? rendered.uiActions : [];
  const question = String(specialist.question || "").trim();
  const numberedCount = countNumberedOptions(question);

  if (action !== "ASK") return "rendered_action_not_ask";
  if (!contractId) return "missing_contract_id";
  if (menuId && !ACTIONCODE_REGISTRY.menus[menuId]) return "unknown_menu_id";
  if (menuId && actionCodes.length === 0) return "menu_without_action_codes";
  if (actionCodes.length !== uiActions.length) return "ui_action_count_mismatch";
  if (actionCodes.length > 0 && numberedCount !== actionCodes.length) return "numbered_prompt_action_count_mismatch";

  for (const code of actionCodes) {
    if (!ACTIONCODE_REGISTRY.actions[code]) return `unknown_action_code:${code}`;
  }
  if (menuId) {
    const allowed = new Set((ACTIONCODE_REGISTRY.menus[menuId] || []).map((code) => String(code || "").trim()));
    if (allowed.size === 0) return "menu_has_no_registry_actions";
    for (const code of actionCodes) {
      if (!allowed.has(code)) return `action_code_not_in_menu:${code}`;
    }
  }

  if (
    stepId !== STEP_0_ID &&
    rendered.status !== "no_output" &&
    actionCodes.length === 0
  ) {
    return "missing_action_codes_for_interactive_step";
  }

  if (
    rendered.status === "valid_output" &&
    rendered.confirmEligible &&
    menuId &&
    menuHasConfirmAction(menuId)
  ) {
    const hasConfirm = actionCodes.some((code) => isConfirmActionCode(code));
    if (!hasConfirm) return "missing_confirm_action_for_valid_output";
  }

  return null;
}

function sanitizeWidgetActionCodes(actionCodes: string[]): string[] {
  return actionCodes.filter((code) => !WIDGET_ESCAPE_ACTION_CODE_BAN.has(String(code || "").trim()));
}

function languageModeFromEnv(): string {
  return String(process.env.LANGUAGE_MODE || "").trim().toLowerCase();
}

function isForceEnglishLanguageMode(): boolean {
  const mode = languageModeFromEnv();
  if (mode === "force_en") return true;
  if (mode === "detect_once") return false;
  return process.env.LOCAL_DEV === "1";
}

function baseUrlFromEnv(): string {
  const explicit = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.LOCAL_DEV === "1") {
    const port = String(process.env.PORT || "3000").trim();
    return `http://localhost:${port}`;
  }
  return "";
}

function normalizePresentationTextSingle(input: string): string {
  return String(input || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function presentationLines(input: string): string[] {
  const raw = String(input || "").replace(/\r/g, "");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[•\-]\s+/, "").trim())
    .filter((line) => line.length > 0);
  return lines.length ? lines : [""];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SectionKey = "strategy" | "targetgroup" | "productsservices" | "rulesofthegame";

const SECTION_LABELS: Record<SectionKey, string[]> = {
  strategy: ["strategy", "strategie"],
  targetgroup: ["target group", "doelgroep"],
  productsservices: ["products and services", "products & services", "producten en diensten"],
  rulesofthegame: ["rules of the game", "spelregels"],
};

function detectSectionLabel(line: string): { section: SectionKey; rest: string } | null {
  const trimmed = line.trim();
  for (const [section, labels] of Object.entries(SECTION_LABELS) as [SectionKey, string[]][]) {
    for (const label of labels) {
      const re = new RegExp(`^${escapeRegExp(label)}\\s*[:\\-–]?\\s*(.*)$`, "i");
      const match = trimmed.match(re);
      if (match) {
        const rest = String(match[1] || "").trim();
        return { section, rest };
      }
    }
  }
  return null;
}

function sanitizeLinesForSection(lines: string[], section: SectionKey): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned || /^[.\-•]+$/.test(cleaned)) continue;
    const detected = detectSectionLabel(cleaned);
    if (detected) {
      if (detected.section !== section) break;
      if (detected.rest) out.push(detected.rest);
      continue;
    }
    out.push(cleaned);
  }
  return out.length ? out : [""];
}

function extractFirstTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>|<${tag}[^>]*/>`);
  const m = xml.match(re);
  return m ? m[0] : "";
}

function hasNumberedLines(lines: string[]): boolean {
  if (!lines || lines.length === 0) return false;
  const firstLine = lines[0].trim();
  return /^\d+[.)]\s/.test(firstLine);
}

function removeBulletsFromPPr(pPr: string): string {
  if (!pPr) return pPr;
  // Remove bullet-related tags
  return pPr
    .replace(/<a:buFont[^>]*>[\s\S]*?<\/a:buFont>/g, "")
    .replace(/<a:buNone\/>/g, "")
    .replace(/<a:buAutoNum[^>]*\/>/g, "")
    .replace(/<a:buChar[^>]*\/>/g, "")
    .replace(/<a:buBlip[^>]*\/>/g, "");
}

function buildParagraphXml(params: {
  pPr: string;
  rPr: string;
  endParaRPr: string;
  text: string;
}): string {
  const { pPr, rPr, endParaRPr, text } = params;
  const parts: string[] = ["<a:p>"];
  if (pPr) parts.push(pPr);
  parts.push("<a:r>");
  if (rPr) parts.push(rPr);
  parts.push(`<a:t>${escapeXml(text)}</a:t>`);
  parts.push("</a:r>");
  if (endParaRPr) parts.push(endParaRPr);
  parts.push("</a:p>");
  return parts.join("");
}

function replacePlaceholderParagraphs(xml: string, placeholder: string, lines: string[]): string {
  const paraRe = /<a:p\b[\s\S]*?<\/a:p>/g;
  return xml.replace(paraRe, (paraXml) => {
    if (!paraXml.includes(`<a:t>${placeholder}</a:t>`)) return paraXml;
    let pPr = extractFirstTag(paraXml, "a:pPr");
    const rPr = extractFirstTag(paraXml, "a:rPr");
    const endParaRPr = extractFirstTag(paraXml, "a:endParaRPr");
    const safeLines = lines && lines.length ? lines : [""];
    
    // Remove bullets from pPr for Strategy when lines are numbered
    if (placeholder === "{{STRATEGY}}" && hasNumberedLines(safeLines)) {
      pPr = removeBulletsFromPPr(pPr);
    }
    
    return safeLines
      .map((line) =>
        buildParagraphXml({
          pPr,
          rPr,
          endParaRPr,
          text: line,
        })
      )
      .join("");
  });
}

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseStep0Final(step0Final: string, fallbackName: string): { venture: string; name: string; status: string } {
  const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
  const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
  const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

  const venture = (ventureMatch?.[1] || "venture").trim();
  const name = (nameMatch?.[1] || fallbackName || "TBD").trim();
  const status = (statusMatch?.[1] || "starting").trim();
  return { venture, name, status };
}

function collectXmlFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectXmlFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xml")) {
      files.push(full);
    }
  }
  return files;
}

function replacePlaceholdersInDir(
  rootDir: string,
  replacements: Record<string, string>,
  paragraphReplacements: Record<string, string[]>
): void {
  const xmlFiles = collectXmlFiles(rootDir);
  for (const filePath of xmlFiles) {
    const original = fs.readFileSync(filePath, "utf-8");
    let updated = original;
    for (const [placeholder, lines] of Object.entries(paragraphReplacements)) {
      if (!placeholder) continue;
      updated = replacePlaceholderParagraphs(updated, placeholder, lines);
    }
    for (const [placeholder, value] of Object.entries(replacements)) {
      if (!placeholder) continue;
      updated = updated.split(placeholder).join(value);
    }
    // Prevent auto-resize changing font size
    updated = updated.replace(/<a:normAutofit\/>/g, "<a:noAutofit/>");
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf-8");
    }
  }
}

function headingLabelsForLang(lang: string): Record<string, string> {
  const isNl = String(lang || "").toLowerCase().startsWith("nl");
  if (isNl) {
    return {
      PURPOSEH: "Doel",
      ROLEH: "Rol",
      STRATEGYH: "Strategie",
      ENTITYH: "Entiteit",
      DREAMH: "Droom",
      TARGET_GROUPH: "Doelgroep",
      PRODUCTS_SERVICESH: "Producten en Diensten",
      RULES_OF_THE_GAMEH: "Spelregels",
    };
  }
  return {
    PURPOSEH: "Purpose",
    ROLEH: "Role",
    STRATEGYH: "Strategy",
    ENTITYH: "Entity",
    DREAMH: "Dream",
    TARGET_GROUPH: "Target Group",
    PRODUCTS_SERVICESH: "Products and Services",
    RULES_OF_THE_GAMEH: "Rules of the Game",
  };
}

function generatePresentationPptx(state: CanvasState, lang: string): { fileName: string; filePath: string } {
  const templatePath = getPresentationTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error("Presentation template not found");
  }

  const step0Final = String((state as any).step_0_final ?? "").trim();
  const fallbackName = String((state as any).business_name ?? "").trim();
  const { name } = parseStep0Final(step0Final, fallbackName);

  const labels = headingLabelsForLang(lang);

  const strategyLines = sanitizeLinesForSection(
    presentationLines(String((state as any).strategy_final ?? "")),
    "strategy"
  );
  const targetGroupLines = sanitizeLinesForSection(
    presentationLines(String((state as any).targetgroup_final ?? "")),
    "targetgroup"
  );
  const productsServicesLines = sanitizeLinesForSection(
    presentationLines(String((state as any).productsservices_final ?? "")),
    "productsservices"
  );
  const rulesLines = sanitizeLinesForSection(
    presentationLines(String((state as any).rulesofthegame_final ?? "")),
    "rulesofthegame"
  );

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": escapeXml(normalizePresentationTextSingle(name || "TBD")),
    "{{BIG_WHY}}": escapeXml(normalizePresentationTextSingle(String((state as any).bigwhy_final ?? ""))),
    "{{BIGWHY}}": escapeXml(normalizePresentationTextSingle(String((state as any).bigwhy_final ?? ""))),
    "{{PURPOSE}}": escapeXml(normalizePresentationTextSingle(String((state as any).purpose_final ?? ""))),
    "{{ROLE}}": escapeXml(normalizePresentationTextSingle(String((state as any).role_final ?? ""))),
    "{{ENTITY}}": escapeXml(normalizePresentationTextSingle(String((state as any).entity_final ?? ""))),
    "{{DREAM}}": escapeXml(normalizePresentationTextSingle(String((state as any).dream_final ?? ""))),
    // fallback for bullet fields (only used if paragraph replacement fails)
    "{{STRATEGY}}": escapeXml(strategyLines.join("\n")),
    "{{TARGET_GROUP}}": escapeXml(targetGroupLines.join("\n")),
    "{{PRODUCTS_SERVICES}}": escapeXml(productsServicesLines.join("\n")),
    "{{RULES_OF_THE_GAME}}": escapeXml(rulesLines.join("\n")),
    "{{PURPOSEH}}": escapeXml(labels.PURPOSEH),
    "{{ROLEH}}": escapeXml(labels.ROLEH),
    "{{STRATEGYH}}": escapeXml(labels.STRATEGYH),
    "{{ENTITYH}}": escapeXml(labels.ENTITYH),
    "{{DREAMH}}": escapeXml(labels.DREAMH),
    "{{TARGET_GROUPH}}": escapeXml(labels.TARGET_GROUPH),
    "{{PRODUCTS_SERVICESH}}": escapeXml(labels.PRODUCTS_SERVICESH),
    "{{RULES_OF_THE_GAMEH}}": escapeXml(labels.RULES_OF_THE_GAMEH),
  };

  const paragraphReplacements: Record<string, string[]> = {
    "{{STRATEGY}}": strategyLines,
    "{{TARGET_GROUP}}": targetGroupLines,
    "{{PRODUCTS_SERVICES}}": productsServicesLines,
    "{{RULES_OF_THE_GAME}}": rulesLines,
  };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsc-pptx-"));
  const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
  fs.mkdirSync(outDir, { recursive: true });

  try {
    execFileSync("unzip", ["-q", templatePath, "-d", workDir]);
    const pptDir = path.join(workDir, "ppt");
    replacePlaceholdersInDir(pptDir, replacements, paragraphReplacements);

    const fileName = `presentation-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pptx`;
    const filePath = path.join(outDir, fileName);
    execFileSync("zip", ["-qr", filePath, "."], { cwd: workDir });
    return { fileName, filePath };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function cleanupOldPresentationFiles(dir: string, maxAgeMs: number): void {
  try {
    const now = Date.now();
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function convertPptxToPdf(pptxPath: string, outDir: string): string {
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptxPath]);
  const base = path.basename(pptxPath, ".pptx");
  return path.join(outDir, `${base}.pdf`);
}

function convertPdfToPng(pdfPath: string, outDir: string): string {
  const base = path.basename(pdfPath, ".pdf");
  const outPrefix = path.join(outDir, base);
  execFileSync("pdftoppm", ["-png", "-f", "1", "-singlefile", pdfPath, outPrefix]);
  return `${outPrefix}.png`;
}

/**
 * Render order (strict):
 * message -> refined_formulation; if both empty, fallback to question.
 * Only append refined_formulation if it is not already contained in message (prevents duplicate display e.g. Rules REFINE).
 */
export function buildTextForWidget(params: { specialist: any; hasWidgetActions?: boolean }): string {
  const { specialist } = params;
  const parts: string[] = [];

  const wordingPending = String(specialist?.wording_choice_pending || "") === "true";
  const wordingMode = String(specialist?.wording_choice_mode || "text") === "list" ? "list" : "text";
  const wordingSuggestion = String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim();
  const normalizeLine = (value: string): string =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "")
      .trim();
  const suggestionNorm = normalizeLine(wordingSuggestion);

  let msg = String(specialist?.message ?? "").trim();
  if (Array.isArray(specialist?.statements) && specialist.statements.length > 0 && msg) {
    const statementKeys = new Set(
      (specialist.statements as string[])
        .map((line) => canonicalizeComparableText(String(line || "")))
        .filter(Boolean)
    );
    const stripMarkers = (line: string): string =>
      String(line || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "")
        .trim();
    const cleanedLines = msg
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((lineRaw) => {
        const line = String(lineRaw || "").trim();
        if (!line) return true;
        const stripped = stripMarkers(line);
        const lineKey = canonicalizeComparableText(stripped);
        if (lineKey && statementKeys.has(lineKey)) return false;
        if (/^your dream statements$/i.test(stripped)) return false;
        if (/^your current dream for\b.*\bis:?$/i.test(stripped)) return false;
        if (
          /^\d+\s+statements?\b/i.test(stripped) &&
          /(minimum|so far|out of|at least)/i.test(stripped)
        ) {
          return false;
        }
        const colonIdx = line.indexOf(":");
        if (colonIdx <= 0) return true;
        const prefix = stripMarkers(line.slice(0, colonIdx));
        const suffix = stripMarkers(line.slice(colonIdx + 1));
        const suffixKey = canonicalizeComparableText(suffix);
        if (!suffixKey || !statementKeys.has(suffixKey)) return true;
        return tokenizeWords(prefix).length > 8;
      });
    msg = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (wordingPending && wordingMode === "text" && suggestionNorm) {
    const paragraphs = msg
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const filtered = paragraphs.filter((p) => normalizeLine(p) !== suggestionNorm);
    msg = filtered.join("\n\n").trim();
  }
  if (wordingPending && wordingMode === "list" && msg) {
    const userItems = Array.isArray(specialist?.wording_choice_user_items)
      ? (specialist.wording_choice_user_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const suggestionItems = Array.isArray(specialist?.wording_choice_suggestion_items)
      ? (specialist.wording_choice_suggestion_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const knownItems = mergeListItems(userItems, suggestionItems);
    const fallbackItems = knownItems.length > 0 ? knownItems : splitSentenceItems(wordingSuggestion);
    msg = sanitizePendingListMessage(msg, fallbackItems);
  }
  const refined = String(specialist?.refined_formulation ?? "").trim();
  const menuId = String(specialist?.menu_id || "").trim().toUpperCase();
  if (msg) msg = stripChoiceInstructionNoise(msg);
  const prompt = String(specialist?.question ?? "").trim();
  if (msg && prompt) msg = stripPromptEchoFromMessage(msg, prompt);
  const statementLines = Array.isArray(specialist?.statements)
    ? (specialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const dreamBuilderRenderContext =
    statementLines.length > 0 &&
    (
      String(specialist?.suggest_dreambuilder || "").trim() === "true" ||
      menuId.startsWith("DREAM_EXPLAINER_MENU_")
    );
  const normalizeForDedupe = (value: string): string =>
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .replace(/^\s*(?:[-*•]|\d+[\).])\s*/gm, "")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  const normalizedLines = (value: string): string[] =>
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean)
      .map((line) => normalizeForDedupe(line))
      .filter(Boolean);
  if (msg) parts.push(msg);
  if (refined && !wordingPending) {
    const statementComparable = statementLines
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const refinedComparableLines = normalizedLines(refined)
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const refinedMatchesStatements =
      statementComparable.length > 0 &&
      refinedComparableLines.length === statementComparable.length &&
      refinedComparableLines.every((line, idx) => line === statementComparable[idx]);
    const refinedNormalized = canonicalizeComparableText(refined);
    const messageNormalized = canonicalizeComparableText(msg);
    const messageLineSet = new Set(normalizedLines(msg).map((line) => canonicalizeComparableText(line)).filter(Boolean));
    const refinedLineSet = normalizedLines(refined);
    const duplicateByWhole = Boolean(refinedNormalized) && messageNormalized.includes(refinedNormalized);
    const duplicateByLines =
      refinedLineSet.length > 0 &&
      refinedLineSet.every((line) => {
        const normalized = canonicalizeComparableText(line);
        return Boolean(normalized) && messageLineSet.has(normalized);
      });
    if (!(dreamBuilderRenderContext && refinedMatchesStatements) && !duplicateByWhole && !duplicateByLines) {
      parts.push(refined);
    }
  }
  if (parts.length === 0) {
    const q = prompt;
    if (q) parts.push(q);
  }

  return parts.join("\n\n").trim();
}

function stripChoiceInstructionNoise(value: string): string {
  const fullLineChoicePatterns = [
    /^(please\s+)?(choose|pick|select)\s+(one|an?)\s+option(s)?(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+between\s+\d+\s+and\s+\d+\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+an?\s+option(\s+below)?(\s+by\s+typing\s+\d+(?:\s*(?:or|\/|,|and)\s*\d+)*)?\.?$/i,
    /^choose\s+an?\s+option\s+by\s+typing\s+.+$/i,
    /^(kies|selecteer)\s+\d+(?:\s*(?:,|\/|of|en)\s*\d+)*\.?$/i,
    /^(kies|selecteer)\s+een\s+optie(\s+hieronder)?\.?$/i,
  ];
  const inlineNoisePatterns = [
    /\s*choose\s+an?\s+option\s+below\.?/gi,
    /\s*choose\s+an?\s+option\.?/gi,
    /\s*choose\s+one\s+of\s+the\s+options(\s+below)?\.?/gi,
    /\s*choose\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?/gi,
    /\s*choose\s+between\s+\d+\s+and\s+\d+\.?/gi,
    /\s*choose\s+an?\s+option\s+by\s+typing\s+\d+(?:\s*(?:or|\/|,|and)\s*\d+)*(?:,\s*or\s*write\s+your\s+own\s+statement)?\.?/gi,
  ];
  const lines = String(value || "").replace(/\r/g, "\n").split("\n");
  const kept = lines
    .map((line) => {
      const normalized = String(line || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[*_`~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) return "";
      if (fullLineChoicePatterns.some((pattern) => pattern.test(normalized))) return "";
      let candidate = String(line || "");
      for (const pattern of inlineNoisePatterns) {
        candidate = candidate.replace(pattern, "");
      }
      return candidate
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();
    })
    .filter(Boolean);
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripPromptEchoFromMessage(messageRaw: string, promptRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n");
  const prompt = String(promptRaw || "").replace(/\r/g, "\n");
  if (!message.trim() || !prompt.trim()) return message.trim();

  const optionLabels = new Set<string>();
  const promptLines = prompt
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  for (const line of promptLines) {
    const numbered = line.match(/^[1-9][\)\.]\s+(.+)$/);
    if (!numbered) continue;
    const label = canonicalizeComparableText(String(numbered[1] || ""));
    if (label) optionLabels.add(label);
  }

  const promptTextLines = new Set<string>(
    promptLines
      .filter((line) => !/^[1-9][\)\.]\s+/.test(line))
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean)
  );

  const stripped = message
    .split("\n")
    .map((line) => String(line || ""))
    .filter((lineRaw) => {
      const line = String(lineRaw || "").trim();
      if (!line) return true;
      const withoutNumbering = line.replace(/^[1-9][\)\.]\s+/, "").trim();
      const normalized = canonicalizeComparableText(withoutNumbering);
      if (!normalized) return true;
      if (optionLabels.has(normalized)) return false;
      if (promptTextLines.has(normalized)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return stripped;
}

export function pickPrompt(specialist: any): string {
  const q = String(specialist?.question ?? "").trim();
  return q || "";
}

function countNumberedOptions(prompt: string): number {
  const lines = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const match = line.match(/^([1-9])[\)\.]\s+/);
    if (!match) continue;
    const n = Number(match[1]);
    if (n !== count + 1) break;
    count += 1;
  }
  return count;
}

function extractNumberedLabels(prompt: string): string[] {
  const lines = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^([1-9])[\)\.]\s+(.+)$/);
    if (!match) continue;
    const idx = Number(match[1]);
    if (idx !== out.length + 1) break;
    out.push(String(match[2] || "").trim());
  }
  return out;
}

function buildRenderedActions(actionCodes: string[], labels: string[]): RenderedAction[] {
  const safeCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  return safeCodes.map((actionCode, idx) => {
    const entry = ACTIONCODE_REGISTRY.actions[actionCode];
    const label = String(labels[idx] || actionCode).trim() || actionCode;
    const route = String(entry?.route || actionCode).trim();
    return {
      id: `${actionCode}:${idx + 1}`,
      label,
      action_code: actionCode,
      intent: actionCodeToIntent({ actionCode, route }),
      primary: idx === 0,
    };
  });
}

function buildNumberedPrompt(labels: string[], headline: string): string {
  const numbered = labels.map((label, idx) => `${idx + 1}) ${label}`);
  if (!numbered.length) return headline;
  return `${numbered.join("\n")}\n\n${headline}`.trim();
}

function stripNumberedOptions(prompt: string): string {
  const kept = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s+/.test(line));
  return kept.join("\n").trim();
}

function buildQuestionTextFromActions(prompt: string, actions: RenderedAction[]): string {
  if (!Array.isArray(actions) || actions.length === 0) return String(prompt || "").trim();
  const labels = actions
    .map((action) => String(action?.label || "").trim())
    .filter(Boolean);
  if (labels.length !== actions.length) return String(prompt || "").trim();
  const headline = stripNumberedOptions(prompt) || "Please choose an option.";
  return buildNumberedPrompt(labels, headline);
}

function hasValidMenuContract(menuIdRaw: string, questionRaw: string): boolean {
  const menuId = String(menuIdRaw || "").trim();
  if (!menuId || isWidgetSuppressedEscapeMenuId(menuId)) return false;
  const expected = ACTIONCODE_REGISTRY.menus[menuId]?.length ?? 0;
  if (expected <= 0) return false;
  return countNumberedOptions(String(questionRaw || "")) === expected;
}

function sanitizeMenuContractPayload(payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  const menuId = String(payload.menu_id || "").trim();
  const question = String(payload.question || "").trim();
  if (hasValidMenuContract(menuId, question)) return payload;
  return {
    ...payload,
    menu_id: "",
  };
}

const WORDING_POST_PICK_MENU_BY_STEP: Record<string, string> = {
  [DREAM_STEP_ID]: "DREAM_MENU_REFINE",
  [PURPOSE_STEP_ID]: "PURPOSE_MENU_REFINE",
  [BIGWHY_STEP_ID]: "BIGWHY_MENU_REFINE",
  [ROLE_STEP_ID]: "ROLE_MENU_REFINE",
  [ENTITY_STEP_ID]: "ENTITY_MENU_EXAMPLE",
  [STRATEGY_STEP_ID]: "STRATEGY_MENU_CONFIRM",
  [TARGETGROUP_STEP_ID]: "TARGETGROUP_MENU_POSTREFINE",
  [PRODUCTSSERVICES_STEP_ID]: "PRODUCTSSERVICES_MENU_CONFIRM",
  [RULESOFTHEGAME_STEP_ID]: "RULES_MENU_CONFIRM",
  [PRESENTATION_STEP_ID]: "PRESENTATION_MENU_ASK",
};

const WORDING_POST_PICK_MENU_LABELS: Record<string, string[]> = {
  DREAM_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 3 Purpose",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_EXPLAINER_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 3 Purpose",
    "Refine this formulation",
  ],
  PURPOSE_MENU_REFINE: [
    "I'm happy with this wording, please continue to next step Big Why.",
    "Refine the wording",
  ],
  BIGWHY_MENU_REFINE: [
    "I'm happy with this wording, continue to step 5 Role",
    "Redefine the Big Why for me please",
  ],
  ROLE_MENU_REFINE: [
    "Yes, this fits.",
    "I want to adjust it.",
  ],
  ENTITY_MENU_EXAMPLE: [
    "I'm happy with this wording, go to the next step Strategy.",
    "Refine the wording for me please",
  ],
  STRATEGY_MENU_CONFIRM: [
    "I'm satisfied with my Strategy. Let's go to Rules of the Game",
  ],
  TARGETGROUP_MENU_POSTREFINE: [
    "I'm happy with this wording, continue to next step Products and Services",
    "Ask me some questions to define my specific Target Group",
  ],
  PRODUCTSSERVICES_MENU_CONFIRM: [
    "This is all what we offer, continue to step Rules of the Game",
  ],
  RULES_MENU_CONFIRM: [
    "These are all my rules of the game, continue to Presentation",
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  PRESENTATION_MENU_ASK: [
    "Create my presentation now",
  ],
};

function hasMeaningfulDreamCandidateText(rawValue: unknown): boolean {
  const value = String(rawValue || "").replace(/\r/g, "\n").trim();
  if (!value) return false;
  const numberedLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+[\).]\s+/.test(line));
  if (numberedLines.length >= 3) return false;
  const bulletLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^[\-*•]\s+/.test(line));
  if (bulletLines.length >= 3) return false;
  const words = tokenizeWords(value);
  if (words.length < 5) return false;
  if (words.length > 70) return false;
  const sentenceCount = value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
  if (sentenceCount > 3) return false;
  return true;
}

function pickDreamCandidateFromState(state: CanvasState): string {
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  const candidates = [
    String((state as any).dream_final || "").trim(),
    String(last.dream || "").trim(),
    String(last.refined_formulation || "").trim(),
  ];
  for (const candidate of candidates) {
    if (hasMeaningfulDreamCandidateText(candidate)) return candidate;
  }
  return "";
}

function resolveWordingPostPickMenuId(stepId: string, state: CanvasState): string {
  if (stepId === DREAM_STEP_ID && String((state as any)?.active_specialist || "") === DREAM_EXPLAINER_SPECIALIST) {
    return pickDreamCandidateFromState(state) ? "DREAM_MENU_REFINE" : "DREAM_MENU_INTRO";
  }
  return WORDING_POST_PICK_MENU_BY_STEP[stepId] || "";
}

function buildWordingPostPickFallbackQuestion(menuId: string, stepId: string, state: CanvasState): string {
  const expected = ACTIONCODE_REGISTRY.menus[menuId]?.length ?? 0;
  if (expected <= 0) return "";
  const labels = (WORDING_POST_PICK_MENU_LABELS[menuId] || []).slice(0, expected);
  if (labels.length !== expected) return "";
  const headline = `Refine your ${wordingStepLabel(stepId)} for ${wordingCompanyName(state)} or choose an option.`;
  return buildNumberedPrompt(labels, headline);
}

const DREAM_DEFINE_MENU_IDS = new Set(["DREAM_MENU_INTRO", "DREAM_MENU_WHY", "DREAM_MENU_SUGGESTIONS"]);

function dreamDefineTail(businessName: string): string {
  return `Define the Dream of ${businessName || "your future company"} or choose an option.`;
}

function normalizeDreamDefineTail(menuId: string, question: string, businessName: string): string {
  if (!DREAM_DEFINE_MENU_IDS.has(menuId)) return question;
  const raw = String(question || "").trim();
  if (!raw) return raw;
  let next = raw;
  if (/refine the dream of/i.test(next)) {
    next = next.replace(/refine the dream of/gi, "Define the Dream of");
  }
  if (!/define the dream of/i.test(next)) {
    next = `${next}\n\n${dreamDefineTail(businessName)}`;
  }
  return next;
}

const DREAM_MENU_QUESTIONS: Record<string, (businessName: string) => string> = {
  DREAM_MENU_INTRO: (businessName) =>
    `1) Tell me more about why a dream matters\n2) Do a small exercise that helps to define your dream.\n\n${dreamDefineTail(businessName)}`,
  DREAM_MENU_WHY: (businessName) =>
    `1) Give me a few dream suggestions\n2) Do a small exercise that helps to define your dream.\n\n${dreamDefineTail(businessName)}`,
  DREAM_MENU_SUGGESTIONS: (businessName) =>
    `1) Pick one for me and continue\n2) Do a small exercise that helps to define your dream.\n\n${dreamDefineTail(businessName)}`,
  DREAM_MENU_REFINE: (businessName) =>
    `1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.\n\nRefine the Dream of ${businessName || "your future company"} or choose an option.`,
};

export function enforceDreamMenuContract(specialist: any, state: CanvasState): any {
  const menuId = String(specialist?.menu_id ?? "").trim();
  if (!menuId.startsWith("DREAM_MENU_")) return specialist;
  if (menuId === "DREAM_MENU_ESCAPE") return specialist;
  const expectedCount = ACTIONCODE_REGISTRY.menus[menuId]?.length ?? 0;
  if (expectedCount <= 0) return specialist;

  const rawQuestion = String(specialist?.question ?? "").trim();
  const rawBusinessName = String((state as any).business_name ?? "").trim();
  const businessName = rawBusinessName && rawBusinessName !== "TBD" ? rawBusinessName : "your future company";
  const normalizedQuestion = normalizeDreamDefineTail(menuId, rawQuestion, businessName);

  const hasExpectedCount = countNumberedOptions(normalizedQuestion) === expectedCount;
  if (hasExpectedCount) {
    if (normalizedQuestion === rawQuestion) return specialist;
    return {
      ...specialist,
      question: normalizedQuestion,
    };
  }

  const builder = DREAM_MENU_QUESTIONS[menuId];
  if (!builder) return specialist;

  if (shouldLogLocalDevDiagnostics()) {
    console.log("[dream_menu_contract_rewrite]", {
      menu_id: menuId,
      previous_choice_count: countNumberedOptions(rawQuestion),
      expected_choice_count: expectedCount,
      current_step: String((state as any).current_step ?? ""),
      request_id: String((state as any).__request_id ?? ""),
      client_action_id: String((state as any).__client_action_id ?? ""),
    });
  }

  return {
    ...specialist,
    action: specialist?.action,
    question: builder(businessName),
  };
}

/**
 * Process ActionCode: deterministic switch/case for all ActionCodes.
 * Returns explicit route token or "yes" for the specialist.
 * No LLM routing, no context-dependent logic.
 */
function processActionCode(
  actionCode: string,
  currentStep: string,
  state: CanvasState,
  lastSpecialistResult: any
): string {
  const entry = ACTIONCODE_REGISTRY.actions[actionCode];
  if (entry) return entry.route;
  if (actionCode.startsWith("ACTION_")) {
    console.warn("[actioncode] Unknown ActionCode", { actionCode, currentStep });
  }
  return actionCode;
}

type WordingChoiceMode = "text" | "list";

type WordingChoiceUiPayload = {
  enabled: boolean;
  mode: WordingChoiceMode;
  user_text: string;
  suggestion_text: string;
  user_items: string[];
  suggestion_items: string[];
  instruction: string;
};

export function isWordingChoiceEligibleStep(stepId: string): boolean {
  return String(stepId || "").trim() !== STEP_0_ID;
}

function isDreamBuilderContext(
  stepId: string,
  activeSpecialist: string,
  specialist?: Record<string, unknown> | null,
  previousSpecialist?: Record<string, unknown> | null
): boolean {
  const step = String(stepId || "").trim().toLowerCase();
  if (step !== DREAM_STEP_ID) return false;
  const specialistName = String(activeSpecialist || "").trim().toLowerCase();
  if (specialistName === "dreamexplainer") return true;

  const current = specialist && typeof specialist === "object" ? specialist : {};
  const previous = previousSpecialist && typeof previousSpecialist === "object" ? previousSpecialist : {};
  const currentMenu = String((current as any).menu_id || "").trim().toUpperCase();
  const previousMenu = String((previous as any).menu_id || "").trim().toUpperCase();
  const suggestFlag =
    String((current as any).suggest_dreambuilder || (previous as any).suggest_dreambuilder || "").trim();
  const scoringFlag = String((current as any).scoring_phase || (previous as any).scoring_phase || "").trim();
  const hasStatements =
    (Array.isArray((current as any).statements) && (current as any).statements.length > 0) ||
    (Array.isArray((previous as any).statements) && (previous as any).statements.length > 0);

  if (suggestFlag === "true") return true;
  if (scoringFlag === "true") return true;
  if (hasStatements) return true;
  if (currentMenu.startsWith("DREAM_EXPLAINER_MENU_")) return true;
  if (previousMenu.startsWith("DREAM_EXPLAINER_MENU_")) return true;
  return false;
}

export function isWordingChoiceEligibleContext(
  stepId: string,
  activeSpecialist: string,
  specialist?: Record<string, unknown> | null,
  previousSpecialist?: Record<string, unknown> | null
): boolean {
  if (!isWordingChoiceEligibleStep(stepId)) return false;
  if (isDreamBuilderContext(stepId, activeSpecialist, specialist, previousSpecialist)) {
    const current = specialist && typeof specialist === "object" ? specialist : {};
    const previous = previousSpecialist && typeof previousSpecialist === "object" ? previousSpecialist : {};
    const scoringPhase = String((current as any).scoring_phase || (previous as any).scoring_phase || "").trim();
    if (scoringPhase === "true") return false;
  }
  return true;
}

function isConfirmActionCode(actionCode: string): boolean {
  const entry = ACTIONCODE_REGISTRY.actions[actionCode];
  if (!entry) return false;
  if (Array.isArray(entry.flags) && entry.flags.includes("confirm")) return true;
  if (entry.route === "yes") return true;
  const upper = actionCode.toUpperCase();
  return upper.includes("_CONFIRM") || upper.includes("FINAL_CONTINUE");
}

function menuHasConfirmAction(menuId: string): boolean {
  const actionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId]
    : [];
  return actionCodes.some((code) => isConfirmActionCode(String(code || "").trim()));
}

function filterConfirmActionCodes(actionCodes: string[], allowConfirm: boolean): string[] {
  if (allowConfirm) return actionCodes;
  return actionCodes.filter((code) => !isConfirmActionCode(code));
}

function normalizeLightUserInput(input: string): string {
  const collapsed = String(input || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return "";
  const normalized = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function normalizeListUserInput(input: string): string {
  const raw = String(input || "").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return normalizeLightUserInput(raw);
  return lines.map((line) => normalizeLightUserInput(line)).join("\n");
}

function normalizeEntityPhrase(raw: string): string {
  let next = String(raw || "").replace(/\r/g, "\n").trim();
  if (!next) return "";
  next = next.split(/\n{2,}/)[0].trim();
  next = next.replace(/\s+/g, " ").trim();
  next = next.replace(/\s*How does that sound to you\?.*$/i, "").trim();
  next = next.replace(/^we\s+are\s+/i, "");
  next = next.replace(/^we['’]re\s+/i, "");
  next = next.replace(/^it\s+is\s+/i, "");
  next = next.replace(/^it['’]s\s+/i, "");
  next = next.replace(/[“”"']+/g, "").trim();
  next = next.replace(/[.!?]+$/g, "").trim();
  return next;
}

function normalizeEntitySpecialistResult(stepId: string, specialist: any): any {
  if (stepId !== ENTITY_STEP_ID || !specialist || typeof specialist !== "object") return specialist;
  const normalizedRefined = normalizeEntityPhrase(String(specialist.refined_formulation || ""));
  const normalizedEntity = normalizeEntityPhrase(String(specialist.entity || ""));
  const canonical = normalizedEntity || normalizedRefined;
  if (!canonical) return specialist;
  const next = { ...specialist };
  if (normalizedRefined) next.refined_formulation = normalizedRefined;
  next.entity = canonical;
  return next;
}

export function normalizeStep0AskDisplayContract(stepId: string, specialist: any, state: CanvasState, userInput = ""): any {
  if (stepId !== STEP_0_ID || !specialist || typeof specialist !== "object") return specialist;
  const action = String(specialist.action || "").trim().toUpperCase();
  const next = { ...specialist };
  const hasStep0Final = String((state as any).step_0_final || "").trim().length > 0;
  const hasStep0Draft = String(next.step_0 || "").trim().length > 0;
  const normalizedInput = String(userInput || "").trim();
  const hasRawInput = normalizedInput.length > 0;
  const isLikelyStepContributing = hasRawInput && shouldTreatAsStepContributingInput(normalizedInput, STEP_0_ID);
  if (action === "INTRO") {
    next.action = "ASK";
    next.message = "";
    next.question = step0QuestionForLang(langFromState(state));
    next.menu_id = "";
  }
  const isOfftopic = next.is_offtopic === true || String(next.is_offtopic || "").trim().toLowerCase() === "true";
  const mustForceAskWithoutFinal =
    !hasStep0Final &&
    !hasStep0Draft &&
    hasRawInput &&
    !isLikelyStepContributing &&
    (action === "ESCAPE" || isOfftopic || isClearlyGeneralOfftopicInput(normalizedInput));
  if (mustForceAskWithoutFinal) {
    return normalizeStep0OfftopicToAsk(next, state, normalizedInput);
  }
  if (hasStep0Final && action === "ASK" && !String(next.menu_id || "").trim()) {
    const parsed = parseStep0Final(String((state as any).step_0_final || ""), String((state as any).business_name || "TBD"));
    const statement =
      String(parsed.status || "").toLowerCase() === "existing"
        ? `You have a ${parsed.venture} called ${parsed.name}.`
        : `You want to start a ${parsed.venture} called ${parsed.name}.`;
    next.action = "ASK";
    next.question = `1) Yes, I'm ready. Let's start!\n\n${statement} Are you ready to start with the first step: the Dream?`;
    next.business_name = parsed.name || "TBD";
    next.step_0 = String((state as any).step_0_final || "");
    next.menu_id = "STEP0_MENU_READY_START";
    next.wording_choice_pending = "false";
    next.wording_choice_selected = "";
    return next;
  }
  if (
    hasStep0Final &&
    String(next.action || "").trim() === "ASK" &&
    String(next.menu_id || "").trim() === "STEP0_MENU_READY_START"
  ) {
    return next;
  }
  if (String(next.action || "").trim() !== "ASK") return next;
  next.message = STEP0_CARDDESC_EN;
  next.question = step0QuestionForLang(langFromState(state));
  next.menu_id = "";
  return next;
}

export function normalizeStep0OfftopicToAsk(specialist: any, state: CanvasState, userInput = ""): any {
  const next = specialist && typeof specialist === "object" ? { ...specialist } : {};
  void userInput;
  const rawMessage = String(next.message || "").trim();
  const cleanedMessage = stripChoiceInstructionNoise(rawMessage);
  const hasMessage = Boolean(cleanedMessage);
  return {
    ...next,
    action: "ASK",
    message: hasMessage ? cleanedMessage : STEP0_CARDDESC_EN,
    question: step0QuestionForLang(langFromState(state)),
    menu_id: "",
    wording_choice_pending: "false",
    wording_choice_selected: "",
    step_0: "",
    is_offtopic: true,
  };
}

function stripNumberedChoiceLines(prompt: string): string {
  return String(prompt || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s+/.test(line))
    .join("\n")
    .trim();
}

function buildDreamBuilderSwitchSelfQuestion(previousQuestion: string, fallbackQuestion: string): string {
  const restoredPrompt = stripChoiceInstructionNoise(
    stripNumberedChoiceLines(previousQuestion) ||
      stripNumberedChoiceLines(fallbackQuestion)
  );
  const headline = restoredPrompt || "Now let's get back to the Dream Exercise.";
  return `1) Switch back to self-formulate the dream\n\n${headline}`.trim();
}

function copyPendingWordingChoiceState(current: any, previous: Record<string, unknown>): any {
  const pending = String(previous.wording_choice_pending || "") === "true";
  if (!pending) return current;
  return {
    ...current,
    wording_choice_pending: "true",
    wording_choice_selected: "",
    wording_choice_user_raw: String(previous.wording_choice_user_raw || ""),
    wording_choice_user_normalized: String(previous.wording_choice_user_normalized || ""),
    wording_choice_user_items: Array.isArray(previous.wording_choice_user_items)
      ? previous.wording_choice_user_items
      : [],
    wording_choice_suggestion_items: Array.isArray(previous.wording_choice_suggestion_items)
      ? previous.wording_choice_suggestion_items
      : [],
    wording_choice_base_items: Array.isArray(previous.wording_choice_base_items)
      ? previous.wording_choice_base_items
      : [],
    wording_choice_agent_current: String(previous.wording_choice_agent_current || ""),
    wording_choice_mode: String(previous.wording_choice_mode || ""),
    wording_choice_target_field: String(previous.wording_choice_target_field || ""),
  };
}

function tokenizeWords(input: string): string[] {
  const normalized = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row: number[] = Array.from({ length: n + 1 }, (_, idx) => idx);
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = row[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
}

function tokenJaccardSimilarity(a: string, b: string): number {
  const left = new Set(tokenizeWords(a));
  const right = new Set(tokenizeWords(b));
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function normalizeSurfaceSignature(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpellingOnlyCorrection(userRaw: string, suggestionRaw: string): boolean {
  const user = normalizeLightUserInput(userRaw);
  const suggestion = normalizeLightUserInput(suggestionRaw);
  if (!user || !suggestion) return false;

  const normalizedUser = normalizeSurfaceSignature(user);
  const normalizedSuggestion = normalizeSurfaceSignature(suggestion);
  if (!normalizedUser || !normalizedSuggestion) return false;
  if (normalizedUser === normalizedSuggestion) return true;

  const userTokens = tokenizeWords(normalizedUser);
  const suggestionTokens = tokenizeWords(normalizedSuggestion);
  if (userTokens.length === 0 || suggestionTokens.length === 0) return false;
  if (userTokens.length !== suggestionTokens.length) return false;

  let changedCount = 0;
  for (let i = 0; i < userTokens.length; i += 1) {
    const left = String(userTokens[i] || "");
    const right = String(suggestionTokens[i] || "");
    if (!left || !right) return false;
    if (left === right) continue;
    if (/^\d+$/.test(left) || /^\d+$/.test(right)) return false;
    if (left.length <= 3 || right.length <= 3) return false;
    const distance = levenshteinDistance(left, right);
    const allowedDistance = Math.max(1, Math.floor(Math.min(left.length, right.length) / 5));
    if (distance > allowedDistance) return false;
    changedCount += 1;
  }

  if (changedCount === 0) return true;
  const maxChangedTokens = Math.max(1, Math.ceil(userTokens.length * 0.25));
  return changedCount <= maxChangedTokens;
}

export function isMaterialRewriteCandidate(userRaw: string, suggestionRaw: string): boolean {
  const user = normalizeLightUserInput(userRaw);
  const suggestion = normalizeLightUserInput(suggestionRaw);
  if (!user || !suggestion) return false;
  if (isSpellingOnlyCorrection(user, suggestion)) return false;
  return true;
}

export function isClearlyGeneralOfftopicInput(input: string): boolean {
  const text = String(input || "").trim();
  if (!text) return false;
  if (/\?/.test(text)) return true;
  if (/https?:\/\//i.test(text)) return true;
  const letters = (text.match(/[^\W\d_]/g) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  if (letters > 0 && digits > letters * 0.6) return true;
  return false;
}

export function shouldTreatAsStepContributingInput(input: string, stepId: string): boolean {
  const text = String(input || "").trim();
  void stepId;
  if (!text) return false;
  if (text.startsWith("ACTION_") || text.startsWith("__ROUTE__") || text.startsWith("choice:")) return false;
  if (isClearlyGeneralOfftopicInput(text)) return false;

  const letters = (text.match(/[^\W\d_]/g) || []).length;
  const words = tokenizeWords(text);
  if (letters < 8 || words.length < 3) return false;
  if (text.length >= 20) return true;
  return words.length >= 5;
}

export function isMetaOfftopicFallbackTurn(params: {
  stepId: string;
  userMessage: string;
  specialistResult: any;
}): boolean {
  const stepId = String(params.stepId || "").trim();
  if (!stepId || stepId === STEP_0_ID) return false;
  const specialist = params.specialistResult && typeof params.specialistResult === "object"
    ? params.specialistResult
    : {};
  const offTopicFlag = specialist.is_offtopic === true || String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
  if (offTopicFlag) return false;

  const user = String(params.userMessage || "").trim().toLowerCase();
  const message = String(specialist.message || "").trim().toLowerCase();
  if (!user && !message) return false;

  const benSignals = [
    "ben steenstra",
    "bensteenstra.com",
    "for more information visit",
  ];
  if (benSignals.some((token) => user.includes(token) || message.includes(token))) return true;

  if (/you are in the .+ step now/.test(message)) return true;
  if (/you are in the dream exercise step now/.test(message)) return true;
  if (message.includes("that's a bit off-topic for this step")) return true;
  if (message.includes("a quick detour")) return true;

  return false;
}

function extractSuggestionFromMessage(message: string): string {
  const raw = String(message || "").trim();
  if (!raw) return "";
  const blocked = [
    /^you are in the\b/i,
    /^we have not yet defined\b/i,
    /^define your\b/i,
    /^refine your\b/i,
    /^choose an option\b/i,
    /^please click what suits you best\b/i,
    /^for more information\b/i,
  ];
  const genericAcknowledgements = [
    /^i think i understand\b/i,
    /^i understand\b/i,
    /^thank you for sharing\b/i,
    /^thanks for sharing\b/i,
    /^that'?s a strong\b/i,
    /^great (point|start|insight)\b/i,
    /^good (point|start|insight)\b/i,
  ];

  const paragraphs = raw
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    const paragraph = paragraphs[i];
    if (blocked.some((re) => re.test(paragraph))) continue;
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let j = sentences.length - 1; j >= 0; j -= 1) {
      const sentence = sentences[j];
      if (blocked.some((re) => re.test(sentence))) continue;
      if (genericAcknowledgements.some((re) => re.test(sentence))) continue;
      if (/off-?topic/i.test(sentence)) continue;
      if (/choose an option/i.test(sentence)) continue;
      if (sentence.length < 18) continue;
      return sentence;
    }
    if (genericAcknowledgements.some((re) => re.test(paragraph))) continue;
    if (paragraph.length >= 18) return paragraph;
  }
  return "";
}

export function pickDualChoiceSuggestion(stepId: string, specialistResult: any, previousSpecialist: any, userRaw = ""): string {
  const candidates: string[] = [];
  const pushCandidate = (value: string) => {
    const raw = String(value || "").trim();
    const trimmed = stepId === ENTITY_STEP_ID ? normalizeEntityPhrase(raw) : raw;
    if (!trimmed) return;
    if (candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };
  const isAcceptableSuggestionForStep = (candidate: string): boolean => {
    const text = String(candidate || "").replace(/\r/g, "\n").trim();
    if (!text) return false;
    if (stepId !== ENTITY_STEP_ID) return true;
    // Entity must be a short phrase (not an explanatory sentence).
    const singleLine = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" ");
    const words = tokenizeWords(singleLine);
    if (words.length < 2 || words.length > 8) return false;
    if (/[!?]/.test(singleLine)) return false;
    if (/[.]/.test(singleLine)) return false;
    return true;
  };

  const field = fieldForStep(stepId);
  if (field) pushCandidate(String(specialistResult?.[field] || ""));
  pushCandidate(String(specialistResult?.refined_formulation || ""));

  if (Array.isArray(specialistResult?.statements) && specialistResult.statements.length > 0) {
    pushCandidate(
      (specialistResult.statements as string[])
        .map((line) => String(line || "").trim())
        .filter(Boolean)
        .join("\n")
    );
  }

  pushCandidate(String(previousSpecialist?.wording_choice_agent_current || previousSpecialist?.refined_formulation || ""));
  const messageCandidate = extractSuggestionFromMessage(String(specialistResult?.message || ""));
  const userComparableForMessage = String(userRaw || "").trim();
  if (messageCandidate) {
    const overlap = tokenJaccardSimilarity(userComparableForMessage, messageCandidate);
    const candidateWordCount = tokenizeWords(messageCandidate).length;
    if (!userComparableForMessage || (candidateWordCount >= 6 && overlap >= 0.2)) {
      pushCandidate(messageCandidate);
    }
  }

  const user = String(userRaw || "").trim();
  const userComparable = canonicalizeComparableText(user);
  if (user) {
    for (const candidate of candidates) {
      if (!isAcceptableSuggestionForStep(candidate)) continue;
      const comparable = canonicalizeComparableText(candidate);
      if (!comparable || comparable === userComparable) continue;
      if (isMaterialRewriteCandidate(user, candidate)) return candidate;
    }
    for (const candidate of candidates) {
      if (!isAcceptableSuggestionForStep(candidate)) continue;
      const comparable = canonicalizeComparableText(candidate);
      if (!comparable || comparable === userComparable) continue;
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (isAcceptableSuggestionForStep(candidate)) return candidate;
  }
  return "";
}

function parseListItems(input: string): string[] {
  const raw = String(input || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;
  const parts = raw
    .split(/[;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : [raw];
}

function splitSentenceItems(input: string): string[] {
  const raw = String(input || "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .trim();
  if (!raw) return [];
  const items = raw
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return items.length >= 2 ? items : [];
}

function parseUserListItemsForStep(stepId: string, userRaw: string, suggestionItems: string[]): string[] {
  const items = parseListItems(userRaw)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (stepId !== DREAM_STEP_ID || items.length !== 1) return items;
  const sentenceItems = splitSentenceItems(userRaw);
  if (sentenceItems.length < 2) return items;
  // DreamBuilder often receives paragraph-style input with multiple statements.
  // Splitting sentences keeps the list-choice cards readable and consistent with bullet steps.
  if (suggestionItems.length > 0) return sentenceItems;
  return items;
}

function extractCommittedListItems(stepId: string, previousSpecialist: any): string[] {
  if (Array.isArray(previousSpecialist?.wording_choice_base_items)) {
    return (previousSpecialist.wording_choice_base_items as string[])
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }
  if (Array.isArray(previousSpecialist?.statements)) {
    return (previousSpecialist.statements as string[])
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }
  const field = fieldForStep(stepId);
  const raw = field ? String(previousSpecialist?.[field] || "").trim() : "";
  return parseListItems(raw);
}

function canonicalizeComparableText(input: string): string {
  return normalizeSurfaceSignature(normalizeLightUserInput(input));
}

export function areEquivalentWordingVariants(params: {
  mode: WordingChoiceMode;
  userRaw: string;
  suggestionRaw: string;
  userItems: string[];
  suggestionItems: string[];
}): boolean {
  const { mode, userRaw, suggestionRaw, userItems, suggestionItems } = params;
  if (mode === "list") {
    const userCanonicalItems = userItems
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const suggestionCanonicalItems = suggestionItems
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    if (userCanonicalItems.length > 0 || suggestionCanonicalItems.length > 0) {
      if (userCanonicalItems.length !== suggestionCanonicalItems.length) return false;
      return userCanonicalItems.every((line, idx) => {
        if (line === suggestionCanonicalItems[idx]) return true;
        const userItem = String(userItems[idx] || "");
        const suggestionItem = String(suggestionItems[idx] || "");
        return isSpellingOnlyCorrection(userItem, suggestionItem);
      });
    }
  }
  const userCanonical = canonicalizeComparableText(userRaw);
  const suggestionCanonical = canonicalizeComparableText(suggestionRaw);
  if (Boolean(userCanonical) && userCanonical === suggestionCanonical) return true;
  return isSpellingOnlyCorrection(userRaw, suggestionRaw);
}

function diffListItems(baseItems: string[], candidateItems: string[]): string[] {
  const base = baseItems.map((line) => canonicalizeComparableText(line));
  const used = new Array(base.length).fill(false);
  const delta: string[] = [];
  for (const rawCandidate of candidateItems) {
    const candidate = String(rawCandidate || "").trim();
    if (!candidate) continue;
    const normalized = canonicalizeComparableText(candidate);
    let matchedIndex = -1;
    for (let i = 0; i < base.length; i += 1) {
      if (used[i]) continue;
      if (base[i] !== normalized) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex >= 0) {
      used[matchedIndex] = true;
      continue;
    }
    delta.push(candidate);
  }
  return delta;
}

function mergeListItems(baseItems: string[], candidateItems: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...baseItems, ...candidateItems]) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const key = canonicalizeComparableText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(line);
  }
  return merged;
}

function sanitizePendingListMessage(messageRaw: string, knownItems: string[]): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n");
  if (!message.trim()) return "";
  const known = new Set(
    knownItems
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean)
  );
  const lines = message.split("\n");
  const kept: string[] = [];
  for (const lineRaw of lines) {
    const line = String(lineRaw || "");
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    if (/^<\/?strong>/i.test(trimmed) && /so far/i.test(trimmed)) continue;
    if (/^so far\b/i.test(trimmed)) continue;
    if (/^<\/?strong>/i.test(trimmed) && /established so far/i.test(trimmed)) continue;
    if (/^(this is your input|this would be my suggestion)\s*:?\s*$/i.test(trimmed.replace(/<[^>]+>/g, "").trim())) continue;
    const withoutMarker = trimmed.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim();
    const directKey = canonicalizeComparableText(withoutMarker);
    if (known.has(directKey)) continue;
    const sentenceItems = splitSentenceItems(withoutMarker);
    if (sentenceItems.length >= 2) {
      const sentenceKeys = sentenceItems
        .map((line) => canonicalizeComparableText(line))
        .filter(Boolean);
      if (sentenceKeys.length >= 2 && sentenceKeys.every((key) => known.has(key))) continue;
    }
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizePendingTextMessage(messageRaw: string, suggestionRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
  const suggestion = String(suggestionRaw || "").trim();
  if (!message || !suggestion) return message;
  const suggestionComparable = canonicalizeComparableText(suggestion);
  if (!suggestionComparable) return message;
  const paragraphs = message
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  const kept = paragraphs.filter((paragraph) => {
    const comparable = canonicalizeComparableText(paragraph);
    return comparable && comparable !== suggestionComparable && !comparable.includes(suggestionComparable);
  });
  return kept.join("\n\n").trim();
}

export function isListChoiceScope(stepId: string, activeSpecialist: string): boolean {
  if (
    stepId === DREAM_STEP_ID &&
    String(activeSpecialist || "").trim() === DREAM_EXPLAINER_SPECIALIST
  ) {
    return true;
  }
  if (
    stepId === STRATEGY_STEP_ID ||
    stepId === PRODUCTSSERVICES_STEP_ID ||
    stepId === RULESOFTHEGAME_STEP_ID
  ) {
    return true;
  }
  return false;
}

function isBulletChoiceStep(stepId: string): boolean {
  return stepId === STRATEGY_STEP_ID || stepId === RULESOFTHEGAME_STEP_ID;
}

function isBulletConsistencyStep(stepId: string): boolean {
  return (
    stepId === STRATEGY_STEP_ID ||
    stepId === PRODUCTSSERVICES_STEP_ID ||
    stepId === RULESOFTHEGAME_STEP_ID
  );
}

function isInformationalContextPolicyStep(stepId: string): boolean {
  return (
    stepId === DREAM_STEP_ID ||
    stepId === PURPOSE_STEP_ID ||
    stepId === BIGWHY_STEP_ID ||
    stepId === ROLE_STEP_ID ||
    stepId === ENTITY_STEP_ID ||
    stepId === STRATEGY_STEP_ID ||
    stepId === TARGETGROUP_STEP_ID ||
    stepId === PRODUCTSSERVICES_STEP_ID ||
    stepId === RULESOFTHEGAME_STEP_ID
  );
}

const INFORMATIONAL_CONTEXT_ACTION_CODES = new Set<string>([
  "ACTION_DREAM_INTRO_EXPLAIN_MORE",
  "ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
  "ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS",
  "ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES",
  "ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS",
  "ACTION_BIGWHY_INTRO_GIVE_EXAMPLE",
  "ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE",
  "ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS",
  "ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLES",
  "ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLE",
  "ACTION_ROLE_INTRO_GIVE_EXAMPLES",
  "ACTION_ROLE_INTRO_EXPLAIN_MORE",
  "ACTION_ROLE_ASK_GIVE_EXAMPLES",
  "ACTION_ENTITY_INTRO_FORMULATE",
  "ACTION_ENTITY_INTRO_EXPLAIN_MORE",
  "ACTION_STRATEGY_INTRO_EXPLAIN_MORE",
  "ACTION_STRATEGY_REFINE_EXPLAIN_MORE",
  "ACTION_STRATEGY_QUESTIONS_EXPLAIN_MORE",
  "ACTION_STRATEGY_ASK_3_QUESTIONS",
  "ACTION_STRATEGY_ASK_GIVE_EXAMPLES",
  "ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE",
  "ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS",
  "ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS",
  "ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS",
  "ACTION_RULES_INTRO_EXPLAIN_MORE",
  "ACTION_RULES_INTRO_GIVE_EXAMPLE",
  "ACTION_RULES_ASK_EXPLAIN_MORE",
  "ACTION_RULES_ASK_GIVE_EXAMPLE",
]);

function isInformationalContextActionCode(actionCode: string): boolean {
  const code = String(actionCode || "").trim().toUpperCase();
  return code !== "" && INFORMATIONAL_CONTEXT_ACTION_CODES.has(code);
}

function extractBulletedItemsFromMessage(messageRaw: string): string[] {
  const lines = String(messageRaw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(?:[-*•]|\d+[\).])\s+(.+)$/);
    if (!match) continue;
    const item = String(match[1] || "").trim();
    if (!item) continue;
    out.push(item);
  }
  return out;
}

function sanitizeBulletStepPolicySpecialist(
  specialist: Record<string, unknown>,
  previous: Record<string, unknown>
): Record<string, unknown> {
  const currentStatements = Array.isArray(specialist.statements) ? specialist.statements : [];
  const previousStatements = Array.isArray(previous.statements) ? previous.statements : [];
  const fromStatements = (currentStatements.length ? currentStatements : previousStatements)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const listFieldCandidate = String(
    specialist.strategy ||
    specialist.productsservices ||
    specialist.rulesofthegame ||
    specialist.refined_formulation ||
    previous.strategy ||
    previous.productsservices ||
    previous.rulesofthegame ||
    previous.refined_formulation ||
    ""
  ).trim();
  const fromListField = parseListItems(listFieldCandidate)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const rawMessage = String(specialist.message || "").replace(/\r/g, "\n");
  const fromMessageBullets = extractBulletedItemsFromMessage(rawMessage)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const statements = fromStatements.length > 0
    ? fromStatements
    : fromListField.length > 0
      ? fromListField
      : fromMessageBullets;
  if (statements.length === 0) return specialist;

  const statementKeys = new Set(statements.map((line) => canonicalizeComparableText(line)).filter(Boolean));
  const specialistWithStatements = { ...specialist, statements };
  if (!rawMessage.trim()) return specialistWithStatements;

  const lineMatchesStatement = (lineRaw: string): boolean => {
    const trimmed = String(lineRaw || "").trim();
    if (!trimmed) return false;
    const noTag = trimmed.replace(/<[^>]+>/g, "").trim();
    const noMarker = noTag.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim();
    const key = canonicalizeComparableText(noMarker);
    return Boolean(key) && statementKeys.has(key);
  };

  const lines = rawMessage.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "");
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }

    if (lineMatchesStatement(trimmed)) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const suffix = trimmed.slice(colonIdx + 1).trim();
      if (suffix && lineMatchesStatement(suffix)) continue;
    }

    const plain = trimmed.replace(/<[^>]+>/g, "").trim();
    const lower = plain.toLowerCase();
    if (
      lower.startsWith("so far we have these") ||
      lower.includes("this is what we have established so far based on our dialogue") ||
      lower.startsWith("your current strategy for") ||
      lower.startsWith("your current products and services for") ||
      lower.startsWith("your current rules of the game for")
    ) {
      continue;
    }

    if (/:$/.test(plain)) {
      let nextNonEmpty = "";
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = String(lines[j] || "").trim();
        if (!candidate) continue;
        nextNonEmpty = candidate;
        break;
      }
      if (nextNonEmpty && lineMatchesStatement(nextNonEmpty)) continue;
    }

    kept.push(line);
  }

  const message = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { ...specialistWithStatements, message };
}

function sanitizePreviousForBulletPolicy(previous: Record<string, unknown>): Record<string, unknown> {
  return {
    ...previous,
    menu_id: "",
    question: "",
  };
}

const FINAL_FIELD_BY_STEP_ID: Record<string, string> = {
  [STEP_0_ID]: "step_0_final",
  [DREAM_STEP_ID]: "dream_final",
  [PURPOSE_STEP_ID]: "purpose_final",
  [BIGWHY_STEP_ID]: "bigwhy_final",
  [ROLE_STEP_ID]: "role_final",
  [ENTITY_STEP_ID]: "entity_final",
  [STRATEGY_STEP_ID]: "strategy_final",
  [TARGETGROUP_STEP_ID]: "targetgroup_final",
  [PRODUCTSSERVICES_STEP_ID]: "productsservices_final",
  [RULESOFTHEGAME_STEP_ID]: "rulesofthegame_final",
  [PRESENTATION_STEP_ID]: "presentation_brief_final",
};

function normalizedProvisionalByStep(state: any): Record<string, string> {
  const raw =
    state && typeof state.provisional_by_step === "object" && state.provisional_by_step !== null
      ? (state.provisional_by_step as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [String(k), String(v ?? "").trim()])
  );
}

function provisionalValueForStep(state: any, stepId: string): string {
  if (!stepId) return "";
  const map = normalizedProvisionalByStep(state);
  return String(map[stepId] || "").trim();
}

function withProvisionalValue(state: CanvasState, stepId: string, value: string): CanvasState {
  if (!stepId) return state;
  const map = normalizedProvisionalByStep(state);
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    delete map[stepId];
  } else {
    map[stepId] = trimmed;
  }
  return {
    ...state,
    provisional_by_step: map,
  };
}

function preserveProgressForInformationalAction(
  stepId: string,
  specialistResult: any,
  previousSpecialist: Record<string, unknown>,
  state: CanvasState
): any {
  const safe = specialistResult && typeof specialistResult === "object" ? { ...specialistResult } : {};
  const field = fieldForStep(stepId);
  const finalField = FINAL_FIELD_BY_STEP_ID[stepId] || "";
  const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
  const provisionalValue = provisionalValueForStep(state, stepId);
  const previousValue = field ? String((previousSpecialist as any)[field] || "").trim() : "";
  const carriedValue = previousValue || provisionalValue || finalValue;
  const previousRefined = String((previousSpecialist as any).refined_formulation || "").trim();
  const carriedRefined = previousRefined || carriedValue;

  if (field) {
    (safe as any)[field] = carriedValue;
  }

  safe.refined_formulation = carriedRefined;

  if (isBulletConsistencyStep(stepId)) {
    const previousStatements = Array.isArray((previousSpecialist as any).statements)
      ? ((previousSpecialist as any).statements as string[])
      : [];
    const carriedStatements = previousStatements
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    const fallbackStatements = parseListItems(carriedValue || carriedRefined)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    const statements = carriedStatements.length > 0 ? carriedStatements : fallbackStatements;
    safe.statements = statements;
    const joined = statements.join("\n");
    if (field) {
      (safe as any)[field] = joined;
    }
    safe.refined_formulation = joined;
  }

  return safe;
}

function informationalProgressFingerprint(
  stepId: string,
  specialist: Record<string, unknown>,
  state: CanvasState
): { value: string; statements: string[] } {
  const field = fieldForStep(stepId);
  const finalField = FINAL_FIELD_BY_STEP_ID[stepId] || "";
  const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
  const provisionalValue = provisionalValueForStep(state, stepId);
  const fieldValue = field ? String((specialist as any)[field] || "").trim() : "";
  const refined = String((specialist as any).refined_formulation || "").trim();
  const value = fieldValue || refined || provisionalValue || finalValue;
  const statements = isBulletConsistencyStep(stepId)
    ? (
      Array.isArray((specialist as any).statements)
        ? ((specialist as any).statements as string[])
        : parseListItems(value)
    )
      .map((line) => String(line || "").trim())
      .filter(Boolean)
    : [];
  return { value, statements };
}

export function informationalActionMutatesProgress(
  stepId: string,
  specialistResult: Record<string, unknown>,
  previousSpecialist: Record<string, unknown>,
  state: CanvasState
): boolean {
  if (!isInformationalContextPolicyStep(stepId)) return false;
  const baseline = informationalProgressFingerprint(
    stepId,
    preserveProgressForInformationalAction(stepId, {}, previousSpecialist, state),
    state
  );
  const current = informationalProgressFingerprint(stepId, specialistResult, state);
  const baselineValue = canonicalizeComparableText(baseline.value);
  const currentValue = canonicalizeComparableText(current.value);
  if (baselineValue !== currentValue) return true;
  if (isBulletConsistencyStep(stepId)) {
    const baselineItems = baseline.statements.map((line) => canonicalizeComparableText(line));
    const currentItems = current.statements.map((line) => canonicalizeComparableText(line));
    if (baselineItems.length !== currentItems.length) return true;
    for (let i = 0; i < baselineItems.length; i += 1) {
      if (baselineItems[i] !== currentItems[i]) return true;
    }
  }
  return false;
}

function fieldForStep(stepId: string): string {
  if (stepId === STEP_0_ID) return "step_0";
  if (stepId === DREAM_STEP_ID) return "dream";
  if (stepId === PURPOSE_STEP_ID) return "purpose";
  if (stepId === BIGWHY_STEP_ID) return "bigwhy";
  if (stepId === ROLE_STEP_ID) return "role";
  if (stepId === ENTITY_STEP_ID) return "entity";
  if (stepId === STRATEGY_STEP_ID) return "strategy";
  if (stepId === TARGETGROUP_STEP_ID) return "targetgroup";
  if (stepId === PRODUCTSSERVICES_STEP_ID) return "productsservices";
  if (stepId === RULESOFTHEGAME_STEP_ID) return "rulesofthegame";
  if (stepId === PRESENTATION_STEP_ID) return "presentation_brief";
  return "";
}

function wordingStepLabel(stepId: string): string {
  if (stepId === DREAM_STEP_ID) return "Dream";
  if (stepId === PURPOSE_STEP_ID) return "Purpose";
  if (stepId === BIGWHY_STEP_ID) return "Big Why";
  if (stepId === ROLE_STEP_ID) return "Role";
  if (stepId === ENTITY_STEP_ID) return "Entity";
  if (stepId === STRATEGY_STEP_ID) return "Strategy";
  if (stepId === TARGETGROUP_STEP_ID) return "Target Group";
  if (stepId === PRODUCTSSERVICES_STEP_ID) return "Products and Services";
  if (stepId === RULESOFTHEGAME_STEP_ID) return "Rules of the game";
  if (stepId === PRESENTATION_STEP_ID) return "Presentation";
  return "step";
}

function wordingCompanyName(state: CanvasState): string {
  const fromState = String((state as any)?.business_name || "").trim();
  if (fromState && fromState !== "TBD") return fromState;

  const step0Final = String((state as any)?.step_0_final || "").trim();
  if (step0Final) {
    const parsed = parseStep0Final(step0Final, "TBD");
    const parsedName = String(parsed?.name || "").trim();
    if (parsedName && parsedName !== "TBD") return parsedName;
  }

  return "your future company";
}

function wordingSelectionMessage(stepId: string, state: CanvasState, activeSpecialist = ""): string {
  const specialist = String(activeSpecialist || (state as any)?.active_specialist || "").trim();
  if (stepId === DREAM_STEP_ID && specialist === DREAM_EXPLAINER_SPECIALIST) return "";
  return `Your current ${wordingStepLabel(stepId)} for ${wordingCompanyName(state)} is:`;
}

const STEP_FEEDBACK_FALLBACK: Record<string, string> = {
  [PURPOSE_STEP_ID]: "Purpose should express deeper meaning and contribution, not personal outcomes like money or status.",
  [BIGWHY_STEP_ID]: "Big Why should capture the deeper societal reason your company exists, not only ambition.",
  [ROLE_STEP_ID]: "Role should describe the stable contribution your company brings, beyond services or positioning.",
  [ENTITY_STEP_ID]: "Entity should be specific enough that outsiders instantly understand what kind of company this is.",
  [STRATEGY_STEP_ID]: "Strategy should stay concrete and focused so choices remain clear in practice.",
  [TARGETGROUP_STEP_ID]: "Target Group should be specific enough that decisions can be made for a clear audience.",
  [PRODUCTSSERVICES_STEP_ID]: "Products and Services should stay concrete and distinguish what you actually offer.",
  [RULESOFTHEGAME_STEP_ID]: "Rules of the game should be concrete behavior rules, not broad slogans.",
  [DREAM_STEP_ID]: "Dream should describe the future world your company wants to help create, beyond general beliefs.",
  [PRESENTATION_STEP_ID]: "Presentation brief should stay concrete so the output presentation remains actionable.",
};

function userChoiceFeedbackReason(stepId: string, prev: any): string {
  const normalize = (value: string): string =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "")
      .trim();

  const suggestionNorm = normalize(String(prev?.wording_choice_agent_current || prev?.refined_formulation || ""));
  const message = String(prev?.message || "").trim();
  const genericAcknowledgements = [
    /^i think i understand\b/i,
    /^i understand\b/i,
    /^thank you for sharing\b/i,
    /^that'?s a strong\b/i,
    /^i appreciate\b/i,
    /^good point\b/i,
  ];
  if (message) {
    const paragraphs = message
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const paragraph of paragraphs) {
      const pNorm = normalize(paragraph);
      if (!pNorm) continue;
      if (suggestionNorm && (pNorm === suggestionNorm || pNorm.includes(suggestionNorm))) continue;
      if (/^your current\b/i.test(paragraph)) continue;
      if (genericAcknowledgements.some((re) => re.test(paragraph))) continue;
      if (paragraph.length >= 20) return paragraph;
    }
  }
  return STEP_FEEDBACK_FALLBACK[stepId] || "this wording may be less precise for this step.";
}

function userChoiceFeedbackMessage(stepId: string, state: CanvasState, prev: any, activeSpecialist = ""): string {
  const reason = userChoiceFeedbackReason(stepId, prev);
  const feedback = `You chose your own wording and that's fine. But please remember that ${reason}`;
  const selection = wordingSelectionMessage(stepId, state, activeSpecialist);
  return selection ? `${feedback}\n\n${selection}` : feedback;
}

function mergeUniqueMessageBlocks(primary: string, secondary: string): string {
  const normalize = (value: string): string => canonicalizeComparableText(value);
  const seenParagraphs = new Set<string>();
  const out: string[] = [];
  for (const block of [primary, secondary]) {
    const trimmed = String(block || "").trim();
    if (!trimmed) continue;
    const paragraphs = trimmed
      .replace(/\r/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const keptParagraphs: string[] = [];
    for (const paragraph of paragraphs) {
      const key = normalize(paragraph);
      if (!key || seenParagraphs.has(key)) continue;
      seenParagraphs.add(key);
      keptParagraphs.push(paragraph);
    }
    if (keptParagraphs.length > 0) {
      out.push(keptParagraphs.join("\n\n"));
    }
  }
  return out.join("\n\n").trim();
}

function enforceWordingPostPickMenuContract(stepId: string, state: CanvasState, selected: any, previous: any): any {
  const safeAction = String(selected?.action || "ASK");
  const currentMenuId = String(selected?.menu_id || "").trim();
  const currentQuestion = String(selected?.question || "").trim();
  if (hasValidMenuContract(currentMenuId, currentQuestion)) {
    return {
      ...selected,
      action: safeAction,
    };
  }

  const prevMenuId = String(previous?.menu_id || "").trim();
  const prevQuestion = String(previous?.question || "").trim();
  if (hasValidMenuContract(prevMenuId, prevQuestion)) {
    return {
      ...selected,
      action: safeAction,
      menu_id: prevMenuId,
      question: prevQuestion,
    };
  }

  const fallbackMenuId = resolveWordingPostPickMenuId(stepId, state);
  const fallbackQuestion = fallbackMenuId
    ? buildWordingPostPickFallbackQuestion(fallbackMenuId, stepId, state)
    : "";
  if (fallbackMenuId && fallbackQuestion && hasValidMenuContract(fallbackMenuId, fallbackQuestion)) {
    return {
      ...selected,
      action: safeAction,
      menu_id: fallbackMenuId,
      question: fallbackQuestion,
    };
  }

  const promptFallback = String(selected?.question || "").trim();
  return {
    ...selected,
    action: safeAction,
    menu_id: "",
    question: promptFallback,
  };
}

function withUpdatedTargetField(result: any, stepId: string, value: string): any {
  const field = fieldForStep(stepId);
  if (!field || !value) return result;
  return { ...result, [field]: value };
}

function pickWordingAgentBase(lastSpecialistResult: any): string {
  const stored = String(lastSpecialistResult?.wording_choice_agent_current || "").trim();
  if (stored) return stored;
  return String(lastSpecialistResult?.refined_formulation || "").trim();
}

function pickWordingSuggestionList(currentSpecialist: any, fallbackText: string): string[] {
  if (Array.isArray(currentSpecialist?.statements) && currentSpecialist.statements.length > 0) {
    return (currentSpecialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean);
  }
  const refined = String(currentSpecialist?.refined_formulation || "").trim();
  return parseListItems(refined || fallbackText);
}

function isRefineAdjustRouteToken(token: string): boolean {
  const upper = String(token || "").toUpperCase();
  return upper.includes("_REFINE__") || upper.includes("_ADJUST__");
}

function isWordingPickRouteToken(token: string): boolean {
  return token === "__WORDING_PICK_USER__" || token === "__WORDING_PICK_SUGGESTION__";
}

export function stripUnsupportedReformulationClaims(messageRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n");
  if (!message.trim()) return "";
  const blocked = [
    /\b(i['’]?ve|i have)\s+reformulat\w*\b/i,
    /\b(i['’]?ve|i have)\s+rewritten\b/i,
    /\byou['’]?ve provided some clear focus points\b/i,
  ];
  const lines = message.split("\n");
  const kept: string[] = [];
  for (const lineRaw of lines) {
    const line = String(lineRaw || "");
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    if (blocked.some((re) => re.test(trimmed))) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildWordingChoiceFromTurn(params: {
  stepId: string;
  activeSpecialist: string;
  previousSpecialist: any;
  specialistResult: any;
  userTextRaw: string;
  isOfftopic: boolean;
  forcePending?: boolean;
}): { specialist: any; wordingChoice: WordingChoiceUiPayload | null } {
  const { stepId, activeSpecialist, previousSpecialist, specialistResult, userTextRaw, isOfftopic, forcePending } = params;
  if (!isWordingChoiceEligibleContext(stepId, activeSpecialist, specialistResult, previousSpecialist)) {
    return {
      specialist: {
        ...specialistResult,
        wording_choice_pending: "false",
        wording_choice_selected: "",
      },
      wordingChoice: null,
    };
  }
  if (isOfftopic) return { specialist: specialistResult, wordingChoice: null };
  const fallbackUserRaw = forcePending
    ? String(previousSpecialist?.wording_choice_user_raw || previousSpecialist?.wording_choice_user_normalized || "").trim()
    : "";
  const userRaw = String(userTextRaw || fallbackUserRaw).trim();
  if (!forcePending && !shouldTreatAsStepContributingInput(userRaw, stepId)) {
    return { specialist: specialistResult, wordingChoice: null };
  }
  const suggestionRaw = pickDualChoiceSuggestion(stepId, specialistResult, previousSpecialist, userRaw);
  if (!userRaw || !suggestionRaw) return { specialist: specialistResult, wordingChoice: null };
  const dreamBuilderContext = isDreamBuilderContext(
    stepId,
    activeSpecialist,
    specialistResult,
    previousSpecialist
  );
  const mode: WordingChoiceMode =
    isListChoiceScope(stepId, activeSpecialist) || dreamBuilderContext ? "list" : "text";
  const normalizedUser = mode === "list" ? normalizeListUserInput(userRaw) : normalizeLightUserInput(userRaw);
  const baseItems = mode === "list" ? extractCommittedListItems(stepId, previousSpecialist || {}) : [];
  const suggestionFullItems = mode === "list" ? pickWordingSuggestionList(specialistResult, suggestionRaw) : [];
  const userRawItems = mode === "list"
    ? parseUserListItemsForStep(stepId, userRaw, suggestionFullItems)
    : [];
  const userItems = mode === "list" ? diffListItems(baseItems, userRawItems) : [];
  const suggestionItems = mode === "list" ? diffListItems(baseItems, suggestionFullItems) : [];
  if (mode === "list" && !forcePending && userItems.length === 0) {
    return { specialist: specialistResult, wordingChoice: null };
  }
  const equivalent = areEquivalentWordingVariants({
    mode,
    userRaw: normalizedUser,
    suggestionRaw,
    userItems: mode === "list" ? userItems : userItems,
    suggestionItems: mode === "list" ? suggestionItems : suggestionItems,
  });
  if (equivalent) {
    const chosenItems = mode === "list"
      ? mergeListItems(baseItems, suggestionItems.length > 0 ? suggestionItems : userItems)
      : [];
    const chosen = mode === "list"
      ? chosenItems.join("\n")
      : (String(suggestionRaw || "").trim() || normalizedUser);
    const autoSelectedBase = {
      ...specialistResult,
      wording_choice_pending: "false",
      wording_choice_selected: "suggestion",
      refined_formulation: chosen,
      ...(mode === "list" ? { statements: chosenItems } : {}),
    };
    const autoSelected = withUpdatedTargetField(autoSelectedBase, stepId, chosen);
    return { specialist: autoSelected, wordingChoice: null };
  }
  if (!forcePending && !isMaterialRewriteCandidate(userRaw, suggestionRaw)) {
    return { specialist: specialistResult, wordingChoice: null };
  }
  const pendingMessage = mode === "list"
    ? sanitizePendingListMessage(
      String(specialistResult?.message || ""),
      mergeListItems(baseItems, suggestionFullItems)
    )
    : sanitizePendingTextMessage(
      String(specialistResult?.message || ""),
      String(suggestionRaw || "")
    );
  const targetField = fieldForStep(stepId);
  const committedTextFromPrev = targetField ? String(previousSpecialist?.[targetField] || "").trim() : "";
  const committedText = mode === "list" ? baseItems.join("\n") : committedTextFromPrev;
  const enriched = {
    ...specialistResult,
    message: pendingMessage,
    wording_choice_pending: "true",
    wording_choice_selected: "",
    wording_choice_user_raw: userRaw,
    wording_choice_user_normalized: normalizedUser,
    wording_choice_user_items: userItems,
    wording_choice_base_items: baseItems,
    wording_choice_agent_current: suggestionRaw,
    wording_choice_suggestion_items: suggestionItems,
    wording_choice_mode: mode,
    wording_choice_target_field: targetField,
  };
  if (targetField) {
    (enriched as any)[targetField] = committedText;
  }
  if (mode === "list") {
    (enriched as any).statements = baseItems;
  }
  (enriched as any).refined_formulation =
    committedText || String(previousSpecialist?.refined_formulation || "").trim();
  const wordingChoice: WordingChoiceUiPayload = {
    enabled: true,
    mode,
    user_text: normalizedUser,
    suggestion_text: suggestionRaw,
    user_items: userItems,
    suggestion_items: suggestionItems,
    instruction: "Please click what suits you best.",
  };
  return { specialist: enriched, wordingChoice };
}

function applyWordingPickSelection(params: {
  stepId: string;
  routeToken: string;
  state: CanvasState;
}): { handled: boolean; specialist: any; nextState: CanvasState } {
  const { stepId, routeToken, state } = params;
  if (!isWordingPickRouteToken(routeToken)) {
    return { handled: false, specialist: {}, nextState: state };
  }
  const prev = ((state as any).last_specialist_result || {}) as any;
  if (String(prev.wording_choice_pending || "") !== "true") {
    return { handled: false, specialist: prev, nextState: state };
  }
  const pickedUser = routeToken === "__WORDING_PICK_USER__";
  const mode = String(prev.wording_choice_mode || "text") === "list" ? "list" : "text";
  const baseItems = mode === "list" ? extractCommittedListItems(stepId, prev) : [];
  const fallbackPickedRaw = pickedUser
    ? String(prev.wording_choice_user_normalized || prev.wording_choice_user_raw || "").trim()
    : String(prev.wording_choice_agent_current || prev.refined_formulation || "").trim();
  const pickedItems = mode === "list"
    ? (() => {
      const fromPending = pickedUser
        ? (Array.isArray(prev.wording_choice_user_items)
          ? (prev.wording_choice_user_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
          : [])
        : (Array.isArray(prev.wording_choice_suggestion_items)
          ? (prev.wording_choice_suggestion_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
          : []);
      if (fromPending.length > 0) return fromPending;
      return parseListItems(fallbackPickedRaw);
    })()
    : [];
  const rawChosen = mode === "list"
    ? mergeListItems(baseItems, pickedItems).join("\n")
    : fallbackPickedRaw;
  const chosen = stepId === ENTITY_STEP_ID ? normalizeEntityPhrase(rawChosen) || rawChosen : rawChosen;
  if (!chosen) return { handled: false, specialist: prev, nextState: state };
  const activeSpecialist = String((state as any)?.active_specialist || "").trim();
  const userFeedback = userChoiceFeedbackMessage(stepId, state, prev, activeSpecialist);
  const selectedMessage = pickedUser
    ? userFeedback
    : wordingSelectionMessage(stepId, state, activeSpecialist);
  const selected = withUpdatedTargetField(
    {
      ...prev,
      message: selectedMessage,
      wording_choice_pending: "false",
      wording_choice_selected: pickedUser ? "user" : "suggestion",
      wording_choice_user_raw: "",
      wording_choice_user_normalized: "",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: mode === "list" ? parseListItems(chosen) : [],
      refined_formulation: chosen,
      wording_choice_agent_current: chosen,
      ...(mode === "list" ? { statements: parseListItems(chosen) } : {}),
    },
    stepId,
    chosen
  );
  let selectedWithContract = selected;
  let selectedContractId = String((selected as any)?.ui_contract_id || "");
  const rendered = renderFreeTextTurnPolicy({
    stepId,
    state,
    specialist: selected as Record<string, unknown>,
    previousSpecialist: prev as Record<string, unknown>,
  });
  const renderedSpecialist = rendered.specialist as any;
  selectedWithContract = {
    ...selected,
    action: "ASK",
    message: mergeUniqueMessageBlocks(
      String(selected.message || ""),
      String(renderedSpecialist?.message || "")
    ),
    question: String(renderedSpecialist?.question || ""),
    menu_id: String(renderedSpecialist?.menu_id || ""),
    wording_choice_pending: "false",
    wording_choice_selected: pickedUser ? "user" : "suggestion",
    ui_contract_id: String((renderedSpecialist as any)?.ui_contract_id || rendered.contractId || ""),
    ui_contract_version: String((renderedSpecialist as any)?.ui_contract_version || rendered.contractVersion || ""),
    ui_text_keys: Array.isArray((renderedSpecialist as any)?.ui_text_keys)
      ? (renderedSpecialist as any)?.ui_text_keys
      : rendered.textKeys,
  };
  selectedContractId = String(rendered.contractId || (selectedWithContract as any)?.ui_contract_id || "");
  const nextState: CanvasState = {
    ...state,
    last_specialist_result: selectedWithContract,
  };
  const targetField = fieldForStep(stepId);
  const provisionalValue = targetField ? String((selectedWithContract as any)?.[targetField] || "").trim() : "";
  const nextStateWithProvisional = provisionalValue
    ? withProvisionalValue(nextState, stepId, provisionalValue)
    : nextState;
  applyUiPhaseByStep(nextStateWithProvisional, stepId, selectedContractId);
  return { handled: true, specialist: selectedWithContract, nextState: nextStateWithProvisional };
}

function buildWordingChoiceFromPendingSpecialist(
  specialist: any,
  activeSpecialist: string,
  previousSpecialist?: any,
  stepIdHint = ""
): WordingChoiceUiPayload | null {
  if (String(specialist?.wording_choice_pending || "") !== "true") return null;
  const stepId = String(stepIdHint || specialist?.wording_choice_target_field || "").trim();
  if (!stepId) return null;
  if (
    !isWordingChoiceEligibleContext(
      stepId,
      activeSpecialist,
      specialist,
      previousSpecialist || {}
    )
  ) {
    return null;
  }
  const mode = String(specialist?.wording_choice_mode || "text") === "list" ? "list" : "text";
  const userItems = Array.isArray(specialist?.wording_choice_user_items)
    ? (specialist.wording_choice_user_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const suggestionItems = Array.isArray(specialist?.wording_choice_suggestion_items)
    ? (specialist.wording_choice_suggestion_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  return {
    enabled: true,
    mode,
    user_text: String(specialist?.wording_choice_user_normalized || specialist?.wording_choice_user_raw || "").trim(),
    suggestion_text: String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim(),
    user_items: userItems,
    suggestion_items: suggestionItems,
    instruction: "Please click what suits you best.",
  };
}

type UiContractMeta = {
  contractId?: string;
  contractVersion?: string;
  textKeys?: string[];
};

function normalizeUiContractMeta(
  specialist: any,
  contractMetaOverride?: UiContractMeta | null
): UiContractMeta {
  const overrideId = String(contractMetaOverride?.contractId || "").trim();
  const specialistId = String(specialist?.ui_contract_id || "").trim();
  const contractId = overrideId || specialistId;

  const overrideVersion = String(contractMetaOverride?.contractVersion || "").trim();
  const specialistVersion = String(specialist?.ui_contract_version || "").trim();
  const contractVersion = overrideVersion || specialistVersion || UI_CONTRACT_VERSION;

  const overrideTextKeys: unknown[] = Array.isArray(contractMetaOverride?.textKeys)
    ? contractMetaOverride.textKeys
    : [];
  const specialistTextKeys: unknown[] = Array.isArray(specialist?.ui_text_keys) ? specialist.ui_text_keys : [];
  const textKeys = (overrideTextKeys.length > 0 ? overrideTextKeys : specialistTextKeys)
    .map((key: unknown) => String(key || "").trim())
    .filter(Boolean);

  return {
    ...(contractId ? { contractId } : {}),
    ...(contractVersion ? { contractVersion } : {}),
    ...(textKeys.length > 0 ? { textKeys } : {}),
  };
}

function applyUiPhaseByStep(state: CanvasState, stepId: string, contractId: string): void {
  const safeStepId = String(stepId || "").trim();
  const safeContractId = String(contractId || "").trim();
  if (!safeStepId || !safeContractId) return;
  const existing = (state as any).__ui_phase_by_step;
  const next = existing && typeof existing === "object" ? { ...existing } : {};
  next[safeStepId] = safeContractId;
  (state as any).__ui_phase_by_step = next;
}

function buildUiPayload(
  specialist: any,
  flagsOverride?: Record<string, boolean> | null,
  actionCodesOverride?: string[] | null,
  renderedActionsOverride?: RenderedAction[] | null,
  wordingChoiceOverride?: WordingChoiceUiPayload | null,
  migrationFlags?: MigrationFlags,
  contractMetaOverride?: UiContractMeta | null
): {
  action_codes?: string[];
  expected_choice_count?: number;
  actions?: RenderedAction[];
  questionText?: string;
  contract_id?: string;
  contract_version?: string;
  text_keys?: string[];
  flags: Record<string, boolean>;
  wording_choice?: WordingChoiceUiPayload;
} | undefined {
  const localDev = shouldLogLocalDevDiagnostics();
  const flags = { ...(flagsOverride || {}) };
  const contractMeta = normalizeUiContractMeta(specialist, contractMetaOverride);
  const featureFlags = migrationFlags || resolveMigrationFlags();
  const rawQuestionText = pickPrompt(specialist);
  const labels = extractNumberedLabels(rawQuestionText);
  const overrideActions =
    Array.isArray(renderedActionsOverride) && renderedActionsOverride.length > 0
      ? renderedActionsOverride
      : [];
  if (Array.isArray(actionCodesOverride)) {
    const safeOverrideCodes = sanitizeWidgetActionCodes(
      actionCodesOverride.map((code) => String(code || "").trim()).filter(Boolean)
    );
    if (safeOverrideCodes.length !== actionCodesOverride.length && localDev) {
      flags.escape_actioncodes_suppressed = true;
    }
    if (safeOverrideCodes.length > 0) {
      const renderedActions =
        overrideActions.length > 0
          ? overrideActions
          : featureFlags.structuredActionsV1 || featureFlags.intentsV1
          ? buildRenderedActions(safeOverrideCodes, labels)
          : [];
      const questionText = buildQuestionTextFromActions(rawQuestionText, renderedActions);
      return {
        action_codes: safeOverrideCodes,
        expected_choice_count: safeOverrideCodes.length,
        ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
        ...(questionText ? { questionText } : {}),
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        flags,
        ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
      };
    }
    if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId) {
      return {
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        flags,
        ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
      };
    }
    return undefined;
  }
  const menuId = String(specialist?.menu_id || "").trim();
  if (menuId) {
    if (isWidgetSuppressedEscapeMenuId(menuId)) {
      if (localDev) flags.escape_menu_suppressed = true;
      if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId) {
        return {
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          flags,
          ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
        };
      }
      return undefined;
    }
    const actionCodes = ACTIONCODE_REGISTRY.menus[menuId];
    if (actionCodes && actionCodes.length > 0) {
      const safeCodes = sanitizeWidgetActionCodes(
        actionCodes.map((code) => String(code || "").trim()).filter(Boolean)
      );
      if (safeCodes.length !== actionCodes.length && localDev) {
        flags.escape_actioncodes_suppressed = true;
      }
      if (safeCodes.length === 0) {
        if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId) {
          return {
            ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
            ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
            ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
            flags,
            ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
          };
        }
        return undefined;
      }
      const renderedActions =
        overrideActions.length > 0
          ? overrideActions
          : featureFlags.structuredActionsV1 || featureFlags.intentsV1
          ? buildRenderedActions(safeCodes, labels)
          : [];
      const questionText = buildQuestionTextFromActions(rawQuestionText, renderedActions);
      return {
        action_codes: safeCodes,
        expected_choice_count: safeCodes.length,
        ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
        ...(questionText ? { questionText } : {}),
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        flags,
        ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
      };
    }
  }
  if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId) {
    return {
      ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
      ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
      ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
      flags,
      ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
    };
  }
  return undefined;
}

function attachRegistryPayload<T extends Record<string, unknown>>(
  payload: T,
  specialist: any,
  flagsOverride?: Record<string, boolean> | null,
  actionCodesOverride?: string[] | null,
  renderedActionsOverride?: RenderedAction[] | null,
  wordingChoiceOverride?: WordingChoiceUiPayload | null,
  contractMetaOverride?: UiContractMeta | null
): T & { registry_version: string; ui?: ReturnType<typeof buildUiPayload> } {
  const safeSpecialist = sanitizeEscapeInWidget(specialist);
  const payloadState = (payload as any)?.state as CanvasState | undefined;
  const payloadStepId = String((payload as any)?.current_step_id || payloadState?.current_step || "").trim();
  const phaseMap = payloadState && typeof (payloadState as any).__ui_phase_by_step === "object"
    ? ((payloadState as any).__ui_phase_by_step as Record<string, unknown>)
    : {};
  const phaseContractId = payloadStepId ? String(phaseMap[payloadStepId] || "").trim() : "";
  const effectiveContractOverride: UiContractMeta = {
    ...(contractMetaOverride || {}),
    ...(contractMetaOverride?.contractId ? {} : (phaseContractId ? { contractId: phaseContractId } : {})),
    ...(contractMetaOverride?.contractVersion ? {} : { contractVersion: UI_CONTRACT_VERSION }),
  };
  const ui = buildUiPayload(
    safeSpecialist,
    flagsOverride,
    actionCodesOverride,
    renderedActionsOverride,
    wordingChoiceOverride,
    undefined,
    effectiveContractOverride
  );
  const hasWidgetActions =
    (Array.isArray(ui?.action_codes) && ui.action_codes.length > 0) ||
    (Array.isArray(ui?.actions) && ui.actions.length > 0);
  const safePayload = {
    ...payload,
    specialist: safeSpecialist,
    ...(Object.prototype.hasOwnProperty.call(payload, "text")
      ? { text: buildTextForWidget({ specialist: safeSpecialist, hasWidgetActions }) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "prompt")
      ? { prompt: pickPrompt(safeSpecialist) }
      : {}),
  } as T;
  return {
    ...safePayload,
    registry_version: ACTIONCODE_REGISTRY.version,
    ...(ui ? { ui } : {}),
  };
}

function expandChoiceFromPreviousQuestion(userMsg: string, prevQuestion: string): string {
  const t = String(userMsg ?? "").trim();
  if (t !== "1" && t !== "2" && t !== "3") return userMsg; // safe for future 3-option menus

  const q = String(prevQuestion ?? "");
  if (!q) return userMsg;

  const lines = q.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const wanted = `${t})`;
  for (const line of lines) {
    // Match "1) something" or "1. something"
    const m = line.match(/^([123])[\)\.]\s*(.+?)\s*$/);
    if (m && `${m[1]})` === wanted) {
      return m[2].trim();
    }
  }

  return userMsg;
}

function isClearYes(userMessage: string): boolean {
  const tRaw = String(userMessage ?? "").trim();
  if (!tRaw) return false;

  // Always accept explicit option click.
  if (tRaw === "1") return true;

  // Only treat very short replies as "clear yes" to avoid accidental triggers.
  const t = tRaw.toLowerCase();
  if (t.length > 24) return false;

  const yesPhrases = new Set([
    "yes", "y", "yeah", "yep", "sure", "ok", "okay", "k", "continue", "go on",
  ]);

  return yesPhrases.has(t);
}

/** Only flag explicit injection markers; never flag bullets/requirements/goals (business brief). */
function looksLikeMetaInstruction(userMessage: string): boolean {
  const t = String(userMessage ?? "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const injectionMarkers = [
    "system:",
    "assistant:",
    "ignore previous instructions",
    "ignore all previous",
    "disregard previous",
    "you are chatgpt",
    "you are a model",
    "you are an ai",
    "pretend you are",
    "roleplay as",
    "act as ",
  ];
  return injectionMarkers.some((m) => lower.includes(m));
}

function extractUserMessageFromWrappedInput(raw: string): string {
  const t = String(raw ?? "");
  if (!t.trim()) return "";

  // Common wrapper used by planners / orchestrators:
  // "CURRENT_STEP_ID: step_0 | USER_MESSAGE: <text>"
  const m1 = t.match(/\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
  if (m1 && typeof m1[1] === "string") return m1[1].trim();

  // Sometimes the wrapper is multi-line and includes "PLANNER_INPUT:".
  const m2 = t.match(/\bPLANNER_INPUT\s*:\s*[\s\S]*?\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
  if (m2 && typeof m2[1] === "string") return m2[1].trim();

  // Otherwise, return empty to indicate "no extraction happened".
  return "";
}

const LANGUAGE_CONFIDENCE_THRESHOLD = 0.8;
const LANGUAGE_MIN_ALPHA = 8;
let cld3FactoryPromise: Promise<any> | null = null;
let cld3Identifier: any | null = null;

async function getCld3Identifier(): Promise<any> {
  if (cld3Identifier) return cld3Identifier;
  if (!cld3FactoryPromise) {
    cld3FactoryPromise = loadCld3();
  }
  const factory = await cld3FactoryPromise;
  cld3Identifier = factory.create(0, 512);
  return cld3Identifier;
}

function normalizeLangCode(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "und") return "";
  return s.split(/[-_]/)[0] || "";
}

function countAlphaChars(input: string): number {
  const s = String(input || "");
  const matches = s.match(/\p{L}/gu);
  return matches ? matches.length : 0;
}

async function detectLanguageHeuristic(text: string): Promise<{ lang: string; confident: boolean }> {
  const raw = String(text ?? "").trim();
  if (!raw) return { lang: "", confident: false };

  try {
    const id = await getCld3Identifier();
    const res = id.findLanguage(raw) || {};
    const lang = normalizeLangCode(res.language);
    const prob =
      typeof res.probability === "number" ? res.probability :
      typeof res.prob === "number" ? res.prob : 0;
    const reliable =
      typeof res.isReliable === "boolean" ? res.isReliable :
      typeof res.is_reliable === "boolean" ? res.is_reliable : false;
    const confident = Boolean(reliable || (prob && prob >= LANGUAGE_CONFIDENCE_THRESHOLD));
    return { lang, confident };
  } catch {
    return { lang: "", confident: false };
  }
}

async function getUiStringsForLang(lang: string, model: string): Promise<Record<string, string>> {
  if (isForceEnglishLanguageMode()) return UI_STRINGS_DEFAULT;
  const normalized = normalizeLangCode(lang) || "en";
  if (normalized === "en") return UI_STRINGS_DEFAULT;
  const cached = UI_STRINGS_CACHE.get(normalized);
  if (cached) return cached;

  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    return UI_STRINGS_DEFAULT;
  }

  if (!process.env.OPENAI_API_KEY) return UI_STRINGS_DEFAULT;

  const instructions = [
    "You are a UI translation engine for The Business Strategy Canvas Builder app.",
    "Translate the VALUES to the target LANGUAGE.",
    "Keep KEYS exactly the same.",
    "Return valid JSON only. No markdown. No extra keys. No comments.",
    "Preserve placeholders like N, M, and X exactly as-is.",
    "Do not translate or alter the product name 'The Business Strategy Canvas Builder'; keep it exactly as-is.",
    "Use concise, natural UI wording in the target language.",
  ].join("\n");

  const plannerInput = `LANGUAGE: ${normalized}\nINPUT_JSON:\n${JSON.stringify(UI_STRINGS_DEFAULT)}`;

  try {
    if (shouldLogLocalDevDiagnostics()) {
      console.log("[ui_strings_translate_call]", {
        lang: normalized,
      });
    }
    const res = await callStrictJson<Record<string, string>>({
      model,
      instructions,
      plannerInput,
      schemaName: "UiStrings",
      jsonSchema: UiStringsJsonSchema,
      zodSchema: UiStringsZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "UiStrings",
    });
    UI_STRINGS_CACHE.set(normalized, res.data);
    return res.data;
  } catch {
    return UI_STRINGS_DEFAULT;
  }
}

async function ensureUiStringsForState(state: CanvasState, model: string): Promise<CanvasState> {
  if (isForceEnglishLanguageMode()) {
    return {
      ...(state as any),
      language: "en",
      language_locked: "true",
      language_override: "false",
      ui_strings: UI_STRINGS_DEFAULT,
      ui_strings_lang: "en",
    } as CanvasState;
  }
  const lang = normalizeLangCode(String((state as any).language ?? "")) || "en";
  const existingLang = String((state as any).ui_strings_lang ?? "").trim().toLowerCase();
  const existing = (state as any).ui_strings;
  if (existing && typeof existing === "object" && existingLang === lang && Object.keys(existing).length) {
    return state;
  }
  const ui_strings = await getUiStringsForLang(lang, model);
  return {
    ...(state as any),
    ui_strings,
    ui_strings_lang: lang,
  } as CanvasState;
}

async function ensureLanguageFromUserMessage(state: CanvasState, userMessage: string, model: string): Promise<CanvasState> {
  if (isForceEnglishLanguageMode()) {
    return {
      ...(state as any),
      language: "en",
      language_locked: "true",
      language_override: "false",
      ui_strings: UI_STRINGS_DEFAULT,
      ui_strings_lang: "en",
    } as CanvasState;
  }
  const msg = String(userMessage ?? "");

  // Explicit user request overrides everything.
  const explicit = msg.trim() ? parseExplicitLanguageOverride(msg) : "";
  if (explicit) {
    const next = {
      ...(state as any),
      language: explicit,
      language_locked: "true",
      language_override: "true",
    } as CanvasState;
    return ensureUiStringsForState(next, model);
  }

  const current = String((state as any).language ?? "").trim().toLowerCase();
  const locked = String((state as any).language_locked ?? "false") === "true";
  const override = String((state as any).language_override ?? "false") === "true";
  if ((override || locked) && current) {
    return ensureUiStringsForState(state, model);
  }

  const alphaCount = countAlphaChars(msg);
  if (alphaCount < LANGUAGE_MIN_ALPHA) {
    return ensureUiStringsForState(state, model);
  }

  const detected = await detectLanguageHeuristic(msg);
  if (!detected.lang) {
    return ensureUiStringsForState(state, model);
  }

  const next = {
    ...(state as any),
    language: detected.lang,
    language_locked: "true",
    language_override: "false",
  } as CanvasState;

  return ensureUiStringsForState(next, model);
}

function parseExplicitLanguageOverride(message: string): string {
  const raw = String(message ?? "").trim().toLowerCase();
  if (!raw) return "";

  // Explicit code form: "language: en" or "lang=de"
  const codeMatch = raw.match(/\b(lang|language)\s*[:=]\s*([a-z]{2,3})\b/);
  if (codeMatch && codeMatch[2]) {
    const code = codeMatch[2].slice(0, 2);
    return code;
  }

  const keywords = [
    "switch", "change", "use", "speak", "language", "lang",
  ];
  const hasKeyword = keywords.some((k) => raw.includes(k));
  if (!hasKeyword) return "";

  const nameMap: Record<string, string> = {
    english: "en",
    german: "de",
    deutsch: "de",
    french: "fr",
    spanish: "es",
    italian: "it",
    portuguese: "pt",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    arabic: "ar",
    hindi: "hi",
    turkish: "tr",
    russian: "ru",
  };

  for (const [name, code] of Object.entries(nameMap)) {
    if (raw.includes(name)) return code;
  }

  return "";
}

function isPristineStateForStart(s: CanvasState): boolean {
  return (
    String(s.current_step) === STEP_0_ID &&
    String((s as any).step_0_final ?? "").trim() === "" &&
    String((s as any).dream_final ?? "").trim() === "" &&
    String((s as any).intro_shown_session ?? "") !== "true" &&
    Object.keys((s as any).last_specialist_result ?? {}).length === 0
  );
}

/**
 * Specialist context block for reliability (used by Presentation and helps other steps avoid guesswork)
 */
function buildSpecialistContextBlock(state: CanvasState): string {
  const safe = (v: any) => String(v ?? "").replace(/\r\n/g, "\n");
  const last =
    state.last_specialist_result && typeof state.last_specialist_result === "object"
      ? JSON.stringify(state.last_specialist_result)
      : "";

  const finals = { ...getFinalsSnapshot(state) };
  const provisional = normalizedProvisionalByStep(state);
  for (const [stepId, finalField] of Object.entries(FINAL_FIELD_BY_STEP_ID)) {
    if (stepId === STEP_0_ID) continue;
    if (!finalField || finals[finalField]) continue;
    const staged = String(provisional[stepId] || "").trim();
    if (!staged) continue;
    finals[finalField] = staged;
  }
  const finalsLines =
    Object.keys(finals).length === 0
      ? "(none yet)"
      : Object.entries(finals)
          .map(([k, v]) => `- ${k}: ${safe(v)}`)
          .join("\n");

  return `STATE FINALS (canonical; use for recap; do not invent)
${finalsLines}

RECAP RULE: Only include in a recap the finals listed above. Do not add placeholder values for missing steps.

STATE META (do not output this section)
- intro_shown_for_step: ${safe((state as any).intro_shown_for_step)}
- intro_shown_session: ${safe((state as any).intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
}

/**
 * Universal recap instruction (language-agnostic; appended to every specialist).
 * Model-driven: when user asks for recap/summary of what is established, set wants_recap=true.
 */
/** Exported for tests (Step 0 unchanged; recap behavior). */
export const RECAP_INSTRUCTION = `UNIVERSAL RECAP (every step)
- If the user asks to summarize or recap what has been established so far (in any wording or language), set wants_recap=true. Do not use language-specific keyword lists; infer from intent.
- When wants_recap=true: set message to show the recap, localized, built ONLY from the finals:
  Start with one line: "This is what we have established so far based on our dialogue:" (localized).
  Then add one blank line (empty line).
  Then show the recap with the following formatting using HTML <strong> tags for labels:
  (1) For step_0_final: parse the pattern "Venture: <venture_type> | Name: <business_name> | Status: <existing|starting>":
     - Format as "<strong>Venture:</strong> <venture_type>" (translate "Venture" to the user's language).
     - Directly below that: "<strong>Name:</strong> <business_name>" (translate "Name" to the user's language). Show this even if business_name is "TBD".
     - Then one blank line (empty line).
  (2) For all other non-empty finals (dream_final, purpose_final, bigwhy_final, role_final, entity_final, strategy_final, targetgroup_final, productsservices_final, rulesofthegame_final): 
      - If the value is a single line: format as "<strong>Label:</strong> <value>" with Label in the user's language (e.g. "Dream:", "Purpose:", "Big Why:", "Role:", "Entity:", "Strategy:", "Target Group:", "Products and Services:", "Rules of the Game:").
      - If the value contains bullets (lines starting with "• " or "- "): format as:
        "<strong>Label:</strong>" on its own line, then each bullet on its own line prefixed with "• " (convert "- " bullets to "• ").
      - If the value contains numbered lines (lines starting with "1.", "2.", "3.", etc. or "1)", "2)", "3)", etc.): format as:
        "<strong>Label:</strong>" on its own line, then each numbered line on its own line (preserve the numbering format).
      - CRITICAL: Each final must be formatted separately. Do NOT combine content from strategy_final, targetgroup_final, productsservices_final, or rulesofthegame_final into one section. Each final has its own label and its own content.
      - After each step, ALWAYS add one blank line (empty line). Skip empty finals.
  Then set question to your normal next question for this step.
- When wants_recap=false: behave as usual.`;

export const LANGUAGE_LOCK_INSTRUCTION = `LANGUAGE OVERRIDE (HARD)
- ALWAYS produce ALL user-facing JSON strings in the LANGUAGE parameter.
- If LANGUAGE is missing or empty: detect language from USER_MESSAGE and use that language.
- Once LANGUAGE is set, keep using it unless the user explicitly requests a different language.
- Do NOT mix languages.
- Do not translate or alter the product name 'The Business Strategy Canvas Builder'; keep it exactly as-is.`;

/**
 * Universal meta vs off-topic policy (steps other than Step 0 only).
 * Appended to every step prompt except step_0. Intent-driven; no language-specific keyword lists.
 * Exported for tests (non-Step0 steps include this block).
 */
export const UNIVERSAL_META_OFFTOPIC_POLICY = `UNIVERSAL_META_OFFTOPIC_POLICY (apply only on steps after Step 0)

1) ALLOWED META (always answer briefly, then return to the step)
Treat as allowed at any time; infer from intent (no language-specific keyword lists):
- Who is Ben Steenstra / why is this method credible / why is it used by companies
- What is the benefit of this step / what is the benefit of the full process
- Requests to recap what we have established so far (use wants_recap above; do not replace that mechanism)
After answering: put the short answer in message, then set question to your normal next question for this step.

BEN STEENSTRA FACTUAL REFERENCE (use when answering Ben/method credibility questions; keep short and non-marketing):
- Ben Steenstra is an entrepreneur, author, executive coach, and public speaker.
- His approach uses a proven canvas connecting purpose, vision, mission, strategy, and values.
- He has experience with large organizations (e.g., Samsung, HTC) and smaller businesses.
- Always include in the answer: www.bensteenstra.com

2) OFF-TOPIC OR NONSENSE (reject with light humor + redirect)
If the user asks something unrelated to The Business Strategy Canvas Builder or the current step:
- Reply in message with a short, light-humored boundary (never insulting, never sarcastic), then redirect.
- Offer ONLY two plain-text outcomes. Do NOT format them as "1) … 2) …" in any prompt field (that may render as buttons). Put the two options in message as bullets, and keep question as a single open question (e.g. "Do you want to continue with the current step, or pause here?").
- The two outcomes: (a) Continue with the current step now. (b) Stop politely—e.g. "No worries—maybe we're not the right fit right now."
- Then set question to your normal next question for this step.`;

/** @deprecated Use UNIVERSAL_META_OFFTOPIC_POLICY. Kept for test backward compatibility. */
export const OFF_TOPIC_POLICY = UNIVERSAL_META_OFFTOPIC_POLICY;

const OFFTOPIC_FLAG_CONTRACT_INSTRUCTION = `OFFTOPIC CONTRACT (HARD)
- Always return a boolean field "is_offtopic".
- Set is_offtopic=false when the user's input can be incorporated into the current step output.
- Set is_offtopic=true when the input is meta/off-topic/unrelated to this step.
- If is_offtopic=true: answer briefly in message, do not ask to proceed to the next step, and keep proceed flags false.`;

function composeSpecialistInstructions(
  baseInstructions: string,
  contextBlock: string,
  options?: { includeUniversalMeta?: boolean }
): string {
  const blocks = [
    baseInstructions,
    LANGUAGE_LOCK_INSTRUCTION,
    contextBlock,
    RECAP_INSTRUCTION,
  ];
  if (options?.includeUniversalMeta) {
    blocks.push(UNIVERSAL_META_OFFTOPIC_POLICY);
  }
  blocks.push(OFFTOPIC_FLAG_CONTRACT_INSTRUCTION);
  return blocks.join("\n\n");
}

/**
 * Persist state updates consistently (no nulls).
 * Contract mode: step outputs are staged per step and only committed to *_final on explicit next-step actioncodes.
 * Exported for unit tests.
 */
export function applyStateUpdate(params: {
  prev: CanvasState;
  decision: OrchestratorOutput;
  specialistResult: any;
  showSessionIntroUsed: BoolString;
}): CanvasState {
  const { prev, decision, specialistResult, showSessionIntroUsed } = params;

  const action = String(specialistResult?.action ?? "");
  const isOfftopic = specialistResult?.is_offtopic === true;
  const next_step = String(decision.current_step ?? "");
  const active_specialist = String(decision.specialist_to_call ?? "");

  let nextState: CanvasState = {
    ...prev,
    current_step: next_step,
    active_specialist,
    last_specialist_result:
      typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {},

    intro_shown_session: showSessionIntroUsed === "true" ? "true" : (prev as any).intro_shown_session,

    // mark a step intro as shown only when the specialist actually outputs INTRO
    intro_shown_for_step: action === "INTRO" ? next_step : (prev as any).intro_shown_for_step,
  };

  // Contract rule: off-topic turns must never mutate canonical finals.
  if (isOfftopic) {
    return nextState;
  }

  // ---- Step 0 ----
  if (next_step === STEP_0_ID) {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      (nextState as any).step_0_final = specialistResult.step_0.trim();
      nextState = withProvisionalValue(nextState, STEP_0_ID, specialistResult.step_0.trim());
    }
    if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
      (nextState as any).business_name = specialistResult.business_name.trim();
    }
  }

  const stageFieldValue = (stepId: string, raw: unknown, fallbackRaw?: unknown): void => {
    const primary = typeof raw === "string" ? raw.trim() : "";
    const fallback = typeof fallbackRaw === "string" ? fallbackRaw.trim() : "";
    const value = primary || fallback;
    if (!value) return;
    nextState = withProvisionalValue(nextState, stepId, value);
  };

  // ---- Stage per-step value (temporary final until explicit next-step confirm) ----
  if (next_step === DREAM_STEP_ID) {
    stageFieldValue(DREAM_STEP_ID, specialistResult?.dream, specialistResult?.refined_formulation);
  }
  if (next_step === PURPOSE_STEP_ID) {
    stageFieldValue(PURPOSE_STEP_ID, specialistResult?.purpose, specialistResult?.refined_formulation);
  }
  if (next_step === BIGWHY_STEP_ID) {
    stageFieldValue(BIGWHY_STEP_ID, specialistResult?.bigwhy, specialistResult?.refined_formulation);
  }
  if (next_step === ROLE_STEP_ID) {
    stageFieldValue(ROLE_STEP_ID, specialistResult?.role, specialistResult?.refined_formulation);
  }
  if (next_step === ENTITY_STEP_ID) {
    stageFieldValue(ENTITY_STEP_ID, specialistResult?.entity, specialistResult?.refined_formulation);
  }
  if (next_step === STRATEGY_STEP_ID) {
    stageFieldValue(STRATEGY_STEP_ID, specialistResult?.strategy, specialistResult?.refined_formulation);
  }
  if (next_step === TARGETGROUP_STEP_ID) {
    const v = String(specialistResult?.targetgroup || specialistResult?.refined_formulation || "").trim();
    const firstSentence = v.split(/[.!?]/)[0].trim();
    if (firstSentence) {
      const words = firstSentence.split(/\s+/).filter(Boolean);
      const trimmed = words.length > 10 ? words.slice(0, 10).join(" ") : firstSentence;
      nextState = withProvisionalValue(nextState, TARGETGROUP_STEP_ID, trimmed);
    }
  }
  if (next_step === PRODUCTSSERVICES_STEP_ID) {
    stageFieldValue(PRODUCTSSERVICES_STEP_ID, specialistResult?.productsservices, specialistResult?.refined_formulation);
  }
  if (next_step === RULESOFTHEGAME_STEP_ID) {
    const statementsArray = Array.isArray(specialistResult.statements)
      ? (specialistResult.statements as string[])
      : [];
    const processed = postProcessRulesOfTheGame(statementsArray, 6);
    const bullets = buildRulesOfTheGameBullets(processed.finalRules);
    stageFieldValue(
      RULESOFTHEGAME_STEP_ID,
      bullets,
      specialistResult?.rulesofthegame || specialistResult?.refined_formulation
    );
  }
  if (next_step === PRESENTATION_STEP_ID) {
    stageFieldValue(PRESENTATION_STEP_ID, specialistResult?.presentation_brief, specialistResult?.refined_formulation);
  }

  return nextState;
}

async function callSpecialistStrict(params: {
  model: string;
  state: CanvasState;
  decision: OrchestratorOutput;
  userMessage: string;
}): Promise<{ specialistResult: any; attempts: number; usage: LLMUsage; model: string }> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = buildSpecialistContextBlock(state);
  const lang = langFromState(state);

  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    if (process.env.TEST_FORCE_RATE_LIMIT === "1") {
      const err = new Error("rate_limit_exceeded");
      (err as any).rate_limited = true;
      (err as any).retry_after_ms = 1500;
      throw err;
    }
    if (process.env.TEST_FORCE_TIMEOUT === "1") {
      const err = new Error("timeout");
      (err as any).type = "timeout";
      (err as any).retry_action = "retry_same_action";
      throw err;
    }
    const forceOfftopic = process.env.TEST_FORCE_OFFTOPIC === "1";
    const base = {
      action: "ASK",
      message: "",
      question: "Test question",
      refined_formulation: "",
      menu_id: "",
      wants_recap: false,
      is_offtopic: forceOfftopic,
    };
    const specialistResult =
      specialist === STEP_0_SPECIALIST
        ? { ...base, business_name: "TBD", step_0: "" }
        : base;
    return {
      specialistResult,
      attempts: 0,
      usage: {
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        provider_available: false,
      },
      model,
    };
  }

  if (specialist === STEP_0_SPECIALIST) {
    const langExplicit = String((state as any).language ?? "").trim();
    const plannerInput = buildStep0SpecialistInput(userMessage, langExplicit ? lang : "");

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: composeSpecialistInstructions(VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS, contextBlock),
      plannerInput,
      schemaName: "ValidationAndBusinessName",
      jsonSchema: ValidationAndBusinessNameJsonSchema as any,
      zodSchema: ValidationAndBusinessNameZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "ValidationAndBusinessName",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === DREAM_SPECIALIST) {
    const langExplicitDream = String((state as any).language ?? "").trim();
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitDream ? lang : ""
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: composeSpecialistInstructions(DREAM_INSTRUCTIONS, contextBlock),
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === DREAM_EXPLAINER_SPECIALIST) {
    const langExplicitExplainer = String((state as any).language ?? "").trim();
    const fromLast = Array.isArray((state as any).last_specialist_result?.statements)
      ? ((state as any).last_specialist_result.statements as string[])
      : [];
    const fromScoring = Array.isArray((state as any).dream_scoring_statements)
      ? ((state as any).dream_scoring_statements as string[])
      : [];
    const previousStatements =
      fromScoring.length >= fromLast.length && fromScoring.length > 0 ? fromScoring : fromLast;
    const dreamAwaitingDirection = String((state as any).dream_awaiting_direction ?? "").trim() === "true";
    const topClusters = dreamAwaitingDirection && Array.isArray((state as any).dream_top_clusters)
      ? ((state as any).dream_top_clusters as { theme: string; average: number }[])
      : undefined;
    const businessContext = dreamAwaitingDirection && topClusters
      ? {
          step_0_final: String((state as any).step_0_final ?? "").trim(),
          business_name: String((state as any).business_name ?? "").trim(),
        }
      : undefined;
    const plannerInput = buildDreamExplainerSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitExplainer ? lang : "",
      previousStatements,
      topClusters,
      businessContext
    );

    const res = await callStrictJson<DreamExplainerOutput>({
      model,
      instructions: composeSpecialistInstructions(DREAM_EXPLAINER_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "DreamExplainer",
      jsonSchema: DreamExplainerJsonSchema as any,
      zodSchema: DreamExplainerZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "DreamExplainer",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PURPOSE_SPECIALIST) {
    const plannerInput = buildPurposeSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PURPOSE_STEP_ID),
      lang
    );

    const res = await callStrictJson<PurposeOutput>({
      model,
      instructions: composeSpecialistInstructions(PURPOSE_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Purpose",
      jsonSchema: PurposeJsonSchema as any,
      zodSchema: PurposeZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Purpose",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === BIGWHY_SPECIALIST) {
    const plannerInput = buildBigWhySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || BIGWHY_STEP_ID),
      lang
    );

    const res = await callStrictJson<BigWhyOutput>({
      model,
      instructions: composeSpecialistInstructions(BIGWHY_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "BigWhy",
      jsonSchema: BigWhyJsonSchema as any,
      zodSchema: BigWhyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "BigWhy",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === ROLE_SPECIALIST) {
    const plannerInput = buildRoleSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ROLE_STEP_ID),
      lang
    );

    const res = await callStrictJson<RoleOutput>({
      model,
      instructions: composeSpecialistInstructions(ROLE_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Role",
      jsonSchema: RoleJsonSchema as any,
      zodSchema: RoleZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Role",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === ENTITY_SPECIALIST) {
    const plannerInput = buildEntitySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ENTITY_STEP_ID),
      lang
    );

    const res = await callStrictJson<EntityOutput>({
      model,
      instructions: composeSpecialistInstructions(ENTITY_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Entity",
      jsonSchema: EntityJsonSchema as any,
      zodSchema: EntityZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Entity",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === STRATEGY_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildStrategySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || STRATEGY_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<StrategyOutput>({
      model,
      instructions: composeSpecialistInstructions(STRATEGY_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Strategy",
      jsonSchema: StrategyJsonSchema as any,
      zodSchema: StrategyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Strategy",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === TARGETGROUP_SPECIALIST) {
    const plannerInput = buildTargetGroupSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || TARGETGROUP_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<TargetGroupOutput>({
      model,
      instructions: composeSpecialistInstructions(TARGETGROUP_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "TargetGroup",
      jsonSchema: TargetGroupJsonSchema as any,
      zodSchema: TargetGroupZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "TargetGroup",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PRODUCTSSERVICES_SPECIALIST) {
    const plannerInput = buildProductsServicesSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRODUCTSSERVICES_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<ProductsServicesOutput>({
      model,
      instructions: composeSpecialistInstructions(PRODUCTSSERVICES_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "ProductsServices",
      jsonSchema: ProductsServicesJsonSchema as any,
      zodSchema: ProductsServicesZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "ProductsServices",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === RULESOFTHEGAME_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildRulesOfTheGameSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || RULESOFTHEGAME_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<RulesOfTheGameOutput>({
      model,
      instructions: composeSpecialistInstructions(RULESOFTHEGAME_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "RulesOfTheGame",
      jsonSchema: RulesOfTheGameJsonSchema as any,
      zodSchema: RulesOfTheGameZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "RulesOfTheGame",
    });

    let data = res.data;

    // Apply post-processing when a Rules of the Game candidate is present.
    if (
      data &&
      typeof data === "object" &&
      typeof (data as any).rulesofthegame === "string" &&
      String((data as any).rulesofthegame || "").trim() !== ""
    ) {
      const statementsForProcessing = Array.isArray((data as any).statements)
        ? ((data as any).statements as string[])
        : [];
      const processed = postProcessRulesOfTheGame(statementsForProcessing, 6);
      const bullets = buildRulesOfTheGameBullets(processed.finalRules);

      if (bullets) {
        data = {
          ...(data as any),
          refined_formulation: bullets,
          rulesofthegame: bullets,
        };
      }

      const feedback = buildUserFeedbackForRulesProcessing(processed);
      if (feedback) {
        const baseMessage =
          typeof (data as any).message === "string" ? String((data as any).message).trim() : "";
        (data as any) = {
          ...(data as any),
          message: baseMessage ? `${baseMessage}\n\n${feedback}` : feedback,
        };
      }
    }

    return { specialistResult: data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PRESENTATION_SPECIALIST) {
    const plannerInput = buildPresentationSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRESENTATION_STEP_ID),
      lang
    );

    const res = await callStrictJson<PresentationOutput>({
      model,
      instructions: composeSpecialistInstructions(PRESENTATION_INSTRUCTIONS, contextBlock, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Presentation",
      jsonSchema: PresentationJsonSchema as any,
      zodSchema: PresentationZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Presentation",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  // Safe fallback: Step 0 ESCAPE payload (language-neutral English here; UI/flow will recover)
  return {
    specialistResult: {
      action: "ESCAPE",
      message: "I can only help you here with The Business Strategy Canvas Builder.",
      question: "Do you want to continue with verification now?",
      refined_formulation: "",
      business_name: "TBD",
      step_0: "",
      wants_recap: false,
      is_offtopic: false,
    },
    attempts: 0,
    usage: {
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      provider_available: false,
    },
    model,
  };
}

function isRateLimitError(err: any): boolean {
  return Boolean(
    err &&
    (err.rate_limited === true ||
      err.code === "rate_limit_exceeded" ||
      err.type === "rate_limit_exceeded" ||
      err.status === 429)
  );
}

function isTimeoutError(err: any): boolean {
  return Boolean(err && err.type === "timeout");
}

function hasUsableSpecialistForRetry(specialist: any): boolean {
  if (!specialist || typeof specialist !== "object") return false;
  const action = String(specialist.action || "").trim().toUpperCase();
  if (action !== "ASK") return false;
  const prompt = pickPrompt(specialist);
  const message = String(specialist.message || "").trim();
  const refined = String(specialist.refined_formulation || "").trim();
  const menuId = String(specialist.menu_id || "").trim();
  return Boolean(prompt || message || refined || menuId);
}

function buildTransientFallbackSpecialist(state: CanvasState): Record<string, unknown> {
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  if (hasUsableSpecialistForRetry(last)) return last;

  const stepId = String((state as any).current_step || STEP_0_ID);
  if (stepId === STEP_0_ID) {
    return {
      action: "ASK",
      message: STEP0_CARDDESC_EN,
      question: step0QuestionForLang(langFromState(state)),
      refined_formulation: "",
      business_name: String((state as any).business_name || "TBD"),
      menu_id: "",
      step_0: "",
      wants_recap: false,
      is_offtopic: false,
    };
  }

  const rendered = renderFreeTextTurnPolicy({
    stepId,
    state,
    specialist: {
      action: "ASK",
      message: "",
      question: "",
      refined_formulation: "",
      menu_id: "",
      wants_recap: false,
      is_offtopic: false,
    },
    previousSpecialist: last,
  });
  return rendered.specialist;
}

function buildRateLimitErrorPayload(state: CanvasState, err: any): RunStepError {
  const retryAfterMs = Number(err?.retry_after_ms) > 0 ? Number(err.retry_after_ms) : 1500;
  const timeoutGuardEnabled = resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    console.log("[timeout_transient_returned]", {
      type: "rate_limited",
      retry_after_ms: retryAfterMs,
      step: String(state.current_step || "step_0"),
      request_id: String((state as any).__request_id ?? ""),
      client_action_id: String((state as any).__client_action_id ?? ""),
    });
  }
  return attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "rate_limited",
      retry_after_ms: retryAfterMs,
      user_message: "Please wait a moment and try again.",
      retry_action: "retry_same_action",
    },
  }, last);
}

function buildTimeoutErrorPayload(state: CanvasState, err: any): RunStepError {
  const timeoutGuardEnabled = resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    console.log("[timeout_transient_returned]", {
      type: "timeout",
      step: String(state.current_step || "step_0"),
      request_id: String((state as any).__request_id ?? ""),
      client_action_id: String((state as any).__client_action_id ?? ""),
    });
  }
  return attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "timeout",
      user_message: "This is taking longer than usual. Please try again.",
      retry_action: "retry_same_action",
    },
  }, last);
}

async function callSpecialistStrictSafe(
  params: { model: string; state: CanvasState; decision: OrchestratorOutput; userMessage: string },
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState
): Promise<{
  ok: true;
  value: { specialistResult: any; attempts: number; usage: LLMUsage; model: string };
} | { ok: false; payload: RunStepError }> {
  const startedAt = Date.now();
  const logDiagnostics = shouldLogLocalDevDiagnostics();
  const routeDecision = resolveModelForCall({
    fallbackModel: params.model,
    routingEnabled: routing.enabled,
    actionCode: routing.actionCode,
    intentType: routing.intentType,
    specialist: String(params.decision?.specialist_to_call ?? ""),
    purpose: "specialist",
  });
  if (
    !routeDecision.applied &&
    routing.shadow &&
    (shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
    routeDecision.candidate_model &&
    routeDecision.candidate_model !== params.model
  ) {
    console.log("[model_routing_shadow]", {
      specialist: String(params.decision?.specialist_to_call ?? ""),
      current_step: String(params.decision?.current_step ?? ""),
      baseline_model: params.model,
      shadow_model: routeDecision.candidate_model,
      source: routeDecision.source,
      config_version: routeDecision.config_version,
      request_id: String((stateForError as any).__request_id ?? ""),
      client_action_id: String((stateForError as any).__client_action_id ?? ""),
    });
  }
  const callParams = {
    ...params,
    model: routeDecision.model,
  };
  try {
    const value = await callSpecialistStrict(callParams);
    if (logDiagnostics) {
      console.log("[run_step_llm_call]", {
        ok: true,
        specialist: String(params.decision?.specialist_to_call ?? ""),
        current_step: String(params.decision?.current_step ?? ""),
        model: String(value.model || routeDecision.model || ""),
        model_source: routeDecision.source,
        elapsed_ms: Date.now() - startedAt,
        request_id: String((stateForError as any).__request_id ?? ""),
        client_action_id: String((stateForError as any).__client_action_id ?? ""),
      });
    }
    return { ok: true as const, value };
  } catch (err: any) {
    if (logDiagnostics) {
      console.log("[run_step_llm_call]", {
        ok: false,
        specialist: String(params.decision?.specialist_to_call ?? ""),
        current_step: String(params.decision?.current_step ?? ""),
        model: String(routeDecision.model || ""),
        model_source: routeDecision.source,
        elapsed_ms: Date.now() - startedAt,
        request_id: String((stateForError as any).__request_id ?? ""),
        client_action_id: String((stateForError as any).__client_action_id ?? ""),
        error_type: String(err?.type ?? err?.code ?? err?.name ?? "unknown"),
      });
    }
    if (isRateLimitError(err)) {
      return { ok: false as const, payload: buildRateLimitErrorPayload(stateForError, err) };
    }
    if (isTimeoutError(err)) {
      return { ok: false as const, payload: buildTimeoutErrorPayload(stateForError, err) };
    }
    throw err;
  }
}

/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT:
 * - Pre-start UI owns the welcome text.
 * - Start calls this tool with empty user_message; we respond with Step 0 question without calling the specialist.
 */
type RunStepBase = {
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: any;
  registry_version: string;
  ui?: {
    action_codes?: string[];
    expected_choice_count?: number;
    actions?: RenderedAction[];
    questionText?: string;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    flags: Record<string, boolean>;
    wording_choice?: WordingChoiceUiPayload;
  };
  presentation_assets?: {
    pdf_url: string;
    png_url: string;
    base_name: string;
  };
  state: CanvasState;
  debug?: any;
};
type RunStepSuccess = RunStepBase & { ok: true };
type RunStepError = RunStepBase & { ok: false; error: Record<string, unknown> };

export async function run_step(rawArgs: unknown): Promise<RunStepSuccess | RunStepError> {
  const args: RunStepArgs = RunStepArgsSchema.parse(rawArgs);
  const inputMode = args.input_mode || "chat";
  const policyFlags = resolveHolisticPolicyFlags();
  const wordingChoiceEnabled = policyFlags.wordingChoiceV2;
  const migrationFlags = resolveMigrationFlags();
  if (process.env.ACTIONCODE_LOG_INPUT_MODE === "1") {
    console.log("[run_step] input_mode", { inputMode });
  }
  const decideOrchestration = (routeState: CanvasState, routeUserMessage: string): OrchestratorOutput => {
    const event = deriveTransitionEventFromLegacy({ state: routeState, userMessage: routeUserMessage });
    return orchestrateFromTransition({
      state: routeState,
      userMessage: routeUserMessage,
      event,
    });
  };

  const baselineModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
  const model = baselineModel;
  const modelRoutingEnabled = envFlagEnabled("BSC_MODEL_ROUTING_V1", false);
  const modelRoutingShadow = envFlagEnabled("BSC_MODEL_ROUTING_SHADOW", true);
  const tokenLoggingEnabled = envFlagEnabled("BSC_TOKEN_LOGGING_V1", process.env.LOCAL_DEV === "1");
  const llmTurnAccumulator = createTurnLlmAccumulator();

  const rememberLlmCall = (value: { attempts: number; usage: LLMUsage; model: string }) => {
    registerTurnLlmCall(llmTurnAccumulator, {
      attempts: value.attempts,
      usage: normalizeUsage(value.usage),
      model: value.model,
    });
  };

  const rawState = (args.state ?? {}) as Record<string, unknown>;
  const uiTelemetry = (rawState as any).__ui_telemetry;
  if (uiTelemetry && typeof uiTelemetry === "object") {
    console.log("[ui_telemetry]", uiTelemetry);
  }
  const transientTextSubmit = typeof (rawState as any).__text_submit === "string"
    ? String((rawState as any).__text_submit)
    : "";
  const transientPendingScores = Array.isArray((rawState as any).__pending_scores)
    ? (rawState as any).__pending_scores
    : null;

  const rawLegacyMarkers = detectLegacySessionMarkers((args.state ?? {}) as Record<string, unknown>);
  let state = normalizeState(args.state ?? {});
  const incomingSessionId = String((rawState as any).__session_id || "").trim();
  const incomingSessionStartedAt = String((rawState as any).__session_started_at || "").trim();
  const incomingSessionLogFile = String((rawState as any).__session_log_file || "").trim();
  const incomingSessionTurnIndex = Number((rawState as any).__session_turn_index ?? 0);
  if (incomingSessionId) (state as any).__session_id = incomingSessionId;
  if (incomingSessionStartedAt) (state as any).__session_started_at = incomingSessionStartedAt;
  if (incomingSessionLogFile) (state as any).__session_log_file = incomingSessionLogFile;
  if (Number.isFinite(incomingSessionTurnIndex) && incomingSessionTurnIndex >= 0) {
    (state as any).__session_turn_index = Math.trunc(incomingSessionTurnIndex);
  }
  if (!String((state as any).__session_id || "").trim()) {
    (state as any).__session_id = crypto.randomUUID();
    (state as any).__session_started_at = new Date().toISOString();
    (state as any).__session_turn_index = 0;
  }
  if (!String((state as any).__session_started_at || "").trim()) {
    (state as any).__session_started_at = new Date().toISOString();
  }
  const previousTurnIndex = Number((state as any).__session_turn_index || 0);
  const nextTurnIndex = Number.isFinite(previousTurnIndex) ? previousTurnIndex + 1 : 1;
  (state as any).__session_turn_index = nextTurnIndex;
  const requestScopedTurnId = String((rawState as any).__request_id || "").trim();
  (state as any).__session_turn_id = requestScopedTurnId || crypto.randomUUID();
  if ((state as any).__ui_telemetry) {
    delete (state as any).__ui_telemetry;
  }
  const fromArgs = String(rawState?.initial_user_message ?? "").trim();
  if (fromArgs && !String((state as any).initial_user_message ?? "").trim()) {
    (state as any).initial_user_message = fromArgs;
  }
  if (String(rawState?.started ?? "").trim().toLowerCase() === "true") {
    (state as any).started = "true";
  }
  const pristineAtEntry = isPristineStateForStart(state);

  const userMessageRaw = String(args.user_message ?? "");
  const extracted = extractUserMessageFromWrappedInput(userMessageRaw);
  const rawNormalized = extracted ? extracted : userMessageRaw;

  // Never discard the first user message as business context (e.g. long bulleted briefs).
  const userMessageCandidate =
    pristineAtEntry ? rawNormalized : (looksLikeMetaInstruction(rawNormalized) ? "" : rawNormalized);


  // Store the initial user message once. This enables a backend fallback when the widget Start button
  // sends an empty message, but the user already provided an initiator message in the chat.
  if (
    String((state as any).initial_user_message ?? "").trim() === "" &&
    String(userMessageCandidate ?? "").trim() !== "" &&
    !/^[0-9]+$/.test(String(userMessageCandidate ?? "").trim()) &&
    !String(userMessageCandidate ?? "").trim().startsWith("ACTION_")
  ) {
    (state as any).initial_user_message = String(userMessageCandidate).trim();
  }

  // If user clicks a numbered option button, the UI sends ActionCode (new system) or "1"/"2"/"3" or "choice:X" (old system).
  // Process ActionCode first (new hard-coded system), then fall back to old system for backwards compatibility.
  const lastSpecialistResult = (state as any)?.last_specialist_result;

  let actionCodeRaw = userMessageCandidate.startsWith("ACTION_") ? userMessageCandidate : "";
  const isActionCodeTurnForPolicy = actionCodeRaw !== "" && actionCodeRaw !== "ACTION_TEXT_SUBMIT";
  let userMessage = userMessageCandidate;
  let submittedUserText = "";

  const deriveIntentTypeForRouting = (actionCode: string, routeOrText: string): string => {
    const normalizedActionCode = String(actionCode || "").trim();
    const normalizedRoute = String(routeOrText || "").trim();
    if (!normalizedActionCode && !normalizedRoute) return "";
    try {
      const routeFromRegistry =
        normalizedActionCode && ACTIONCODE_REGISTRY.actions[normalizedActionCode]
          ? String(ACTIONCODE_REGISTRY.actions[normalizedActionCode]?.route || "").trim()
          : "";
      const intent = actionCodeToIntent({
        actionCode: normalizedActionCode,
        route: routeFromRegistry || normalizedRoute,
      });
      return String(intent?.type || "").trim();
    } catch {
      return "";
    }
  };

  const buildRoutingContext = (routeOrText: string) => {
    return {
      enabled: modelRoutingEnabled,
      shadow: modelRoutingShadow,
      actionCode: actionCodeRaw,
      intentType: deriveIntentTypeForRouting(actionCodeRaw, routeOrText),
    };
  };

  const resolveTranslationModel = (routeOrText: string): string => {
    const routing = buildRoutingContext(routeOrText);
    const decision = resolveModelForCall({
      fallbackModel: baselineModel,
      routingEnabled: routing.enabled,
      actionCode: routing.actionCode,
      intentType: routing.intentType,
      purpose: "translation",
    });
    if (
      !decision.applied &&
      routing.shadow &&
      (shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
      decision.candidate_model &&
      decision.candidate_model !== baselineModel
    ) {
      console.log("[model_routing_shadow]", {
        specialist: "UiStrings",
        current_step: String((state as any).current_step || ""),
        baseline_model: baselineModel,
        shadow_model: decision.candidate_model,
        source: decision.source,
        config_version: decision.config_version,
        request_id: String((state as any).__request_id ?? ""),
        client_action_id: String((state as any).__client_action_id ?? ""),
      });
    }
    return decision.model;
  };

  const finalizeResponse = <T extends RunStepSuccess | RunStepError>(response: T): T => {
    if (!tokenLoggingEnabled) return response;
    try {
      const responseState = (response as any)?.state as CanvasState | undefined;
      if (!responseState) return response;
      const sessionId = String((responseState as any).__session_id || "").trim();
      const sessionStartedAt = String((responseState as any).__session_started_at || "").trim();
      const turnId = String((responseState as any).__session_turn_id || "").trim();
      if (!sessionId || !sessionStartedAt || !turnId) return response;
      const usage = turnUsageFromAccumulator(llmTurnAccumulator);
      const modelList = [...llmTurnAccumulator.models.values()];
      const model = modelList.length > 0 ? modelList.join(",") : baselineModel;
      const appendResult = appendSessionTokenLog({
        sessionId,
        sessionStartedAt,
        filePath: String((responseState as any).__session_log_file || "").trim() || undefined,
        turn: {
          turn_id: turnId,
          timestamp: new Date().toISOString(),
          step_id: String((response as any).current_step_id || (responseState as any).current_step || ""),
          specialist: String((response as any).active_specialist || (responseState as any).active_specialist || ""),
          model,
          attempts: llmTurnAccumulator.attempts,
          usage,
        },
      });
      (responseState as any).__session_log_file = appendResult.filePath;
    } catch (err: any) {
      console.warn("[session_token_log_write_failed]", {
        message: String(err?.message || err || "unknown"),
      });
    }
    return response;
  };

  const ensureUiStrings = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    return ensureUiStringsForState(targetState, translationModel);
  };

  const ensureLanguage = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    return ensureLanguageFromUserMessage(targetState, routeOrText, translationModel);
  };

  const legacyMarkers = rawLegacyMarkers.length > 0 ? rawLegacyMarkers : detectLegacySessionMarkers(state);
  if (legacyMarkers.length > 0) {
    const legacySpecialist = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    return finalizeResponse(attachRegistryPayload({
      ok: false as const,
      tool: "run_step" as const,
      current_step_id: String(state.current_step),
      active_specialist: String((state as any).active_specialist || ""),
      text: "This session uses an old runtime format and must be restarted.",
      prompt: "Please start a new session and retry your last action.",
      specialist: legacySpecialist,
      state,
      error: {
        type: "session_upgrade_required",
        message: "Legacy session state is blocked in strict contract mode.",
        markers: legacyMarkers,
        required_action: "restart_session",
      },
    }, legacySpecialist));
  }

  if (actionCodeRaw) {
    const menuId = String(lastSpecialistResult?.menu_id || "").trim();
    if (menuId) {
      const expectedCount = ACTIONCODE_REGISTRY.menus[menuId]?.length;
      console.log("[actioncode_click]", {
        registry_version: ACTIONCODE_REGISTRY.version,
        menu_id: menuId,
        step: String(state.current_step || ""),
        expected_count: expectedCount,
        action_code: actionCodeRaw,
        input_mode: inputMode,
      });
    }
  }

  if (actionCodeRaw === "ACTION_TEXT_SUBMIT") {
    const submitted = String(transientTextSubmit ?? "").trim();
    submittedUserText = submitted;
    userMessage = submitted;
    actionCodeRaw = "";
    if (
      String((state as any).initial_user_message ?? "").trim() === "" &&
      submitted &&
      !/^[0-9]+$/.test(submitted)
    ) {
      (state as any).initial_user_message = submitted;
    }
  }

  // If we're at Step 0 with no final yet and the user just typed real text,
  // reset any stale language from previous sessions so language is determined
  // by this first message (not by old widget/browser state).
  const msgForLang = String(userMessage ?? "").trim();
  const isUserTextForLang =
    msgForLang &&
    !/^[0-9]+$/.test(msgForLang) &&
    !msgForLang.startsWith("ACTION_") &&
    !msgForLang.startsWith("__ROUTE__") &&
    !msgForLang.startsWith("choice:");
  if (
    String(state.current_step) === STEP_0_ID &&
    String((state as any).step_0_final ?? "").trim() === "" &&
    isUserTextForLang
  ) {
    const hasOverride = String((state as any).language_override ?? "false") === "true";
    if (!hasOverride) {
      (state as any).language = "";
      (state as any).language_locked = "false";
      (state as any).language_override = "false";
    }
  }

  let forcedProceed = false;

  function pickFirstNonEmpty(...vals: Array<unknown>): string {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  const BIGWHY_MAX_WORDS = 28;

  function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function pickBigWhyCandidate(result: any): string {
    const fromFinal = typeof result?.bigwhy === "string" ? result.bigwhy.trim() : "";
    if (fromFinal) return fromFinal;
    const fromRefine = typeof result?.refined_formulation === "string" ? result.refined_formulation.trim() : "";
    return fromRefine;
  }

  function buildBigWhyTooLongFeedback(lang: string): any {
    const isNl = String(lang || "").toLowerCase().startsWith("nl");
    const message = isNl
      ? "Je formulering is langer dan 28 woorden. Kort en bondig is duidelijker, dus graag een compacte versie."
      : "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version.";
    const question = isNl
      ? "Wil je het herschrijven tot maximaal 28 woorden?"
      : "Can you rewrite it in 28 words or fewer?";
    return {
      action: "REFINE",
      message,
      question,
      refined_formulation: "",
      bigwhy: "",
      menu_id: "",
      wants_recap: false,
      is_offtopic: false,
    };
  }

  function requireFinalValue(stepId: string, prev: any, stateObj: CanvasState): { field: string; value: string } {
    const provisional = provisionalValueForStep(stateObj, stepId);
    if (stepId === STEP_0_ID) {
      return { field: "step_0_final", value: pickFirstNonEmpty(provisional, prev.step_0, (stateObj as any).step_0_final) };
    }
    if (stepId === DREAM_STEP_ID) {
      return { field: "dream_final", value: pickFirstNonEmpty(provisional, prev.dream, prev.refined_formulation, (stateObj as any).dream_final) };
    }
    if (stepId === PURPOSE_STEP_ID) {
      return { field: "purpose_final", value: pickFirstNonEmpty(provisional, prev.purpose, prev.refined_formulation, (stateObj as any).purpose_final) };
    }
    if (stepId === BIGWHY_STEP_ID) {
      return { field: "bigwhy_final", value: pickFirstNonEmpty(provisional, prev.bigwhy, prev.refined_formulation, (stateObj as any).bigwhy_final) };
    }
    if (stepId === ROLE_STEP_ID) {
      return { field: "role_final", value: pickFirstNonEmpty(provisional, prev.role, prev.refined_formulation, (stateObj as any).role_final) };
    }
    if (stepId === ENTITY_STEP_ID) {
      return { field: "entity_final", value: pickFirstNonEmpty(provisional, prev.entity, prev.refined_formulation, (stateObj as any).entity_final) };
    }
    if (stepId === STRATEGY_STEP_ID) {
      return { field: "strategy_final", value: pickFirstNonEmpty(provisional, prev.strategy, prev.refined_formulation, (stateObj as any).strategy_final) };
    }
    if (stepId === TARGETGROUP_STEP_ID) {
      return { field: "targetgroup_final", value: pickFirstNonEmpty(provisional, prev.targetgroup, prev.refined_formulation, (stateObj as any).targetgroup_final) };
    }
    if (stepId === PRODUCTSSERVICES_STEP_ID) {
      return { field: "productsservices_final", value: pickFirstNonEmpty(provisional, prev.productsservices, prev.refined_formulation, (stateObj as any).productsservices_final) };
    }
    if (stepId === RULESOFTHEGAME_STEP_ID) {
      return { field: "rulesofthegame_final", value: pickFirstNonEmpty(provisional, prev.rulesofthegame, prev.refined_formulation, (stateObj as any).rulesofthegame_final) };
    }
    if (stepId === PRESENTATION_STEP_ID) {
      return { field: "presentation_brief_final", value: pickFirstNonEmpty(provisional, prev.presentation_brief, prev.refined_formulation, (stateObj as any).presentation_brief_final) };
    }
    return { field: "", value: "" };
  }

  const ACTIONCODE_STEP_TRANSITIONS: Record<string, string> = {
    ACTION_STEP0_READY_START: DREAM_STEP_ID,
    ACTION_DREAM_REFINE_CONFIRM: PURPOSE_STEP_ID,
    ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: PURPOSE_STEP_ID,
    ACTION_PURPOSE_REFINE_CONFIRM: BIGWHY_STEP_ID,
    ACTION_PURPOSE_CONFIRM_SINGLE: BIGWHY_STEP_ID,
    ACTION_BIGWHY_REFINE_CONFIRM: ROLE_STEP_ID,
    ACTION_ROLE_REFINE_CONFIRM: ENTITY_STEP_ID,
    ACTION_ENTITY_EXAMPLE_CONFIRM: STRATEGY_STEP_ID,
    ACTION_STRATEGY_CONFIRM_SATISFIED: RULESOFTHEGAME_STEP_ID,
    ACTION_STRATEGY_FINAL_CONTINUE: RULESOFTHEGAME_STEP_ID,
    ACTION_TARGETGROUP_POSTREFINE_CONFIRM: PRODUCTSSERVICES_STEP_ID,
    ACTION_PRODUCTSSERVICES_CONFIRM: RULESOFTHEGAME_STEP_ID,
    ACTION_RULES_CONFIRM_ALL: PRESENTATION_STEP_ID,
  };

  if (actionCodeRaw && ACTIONCODE_STEP_TRANSITIONS[actionCodeRaw]) {
    const stepId = String(state.current_step ?? "");
    const prev = (state as any).last_specialist_result || {};
    if (
      wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      isWordingChoiceEligibleContext(
        stepId,
        String((state as any).active_specialist || ""),
        prev,
        prev
      )
    ) {
      const pendingSpecialist = { ...prev };
      const pendingChoice = buildWordingChoiceFromPendingSpecialist(
        pendingSpecialist,
        String((state as any).active_specialist || ""),
        prev,
        stepId
      );
      const stateWithUi = await ensureUiStrings(state, userMessage);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: buildTextForWidget({ specialist: pendingSpecialist }),
        prompt: pickPrompt(pendingSpecialist),
        specialist: pendingSpecialist,
        state: stateWithUi,
      }, pendingSpecialist, { require_wording_pick: true }, [], [], pendingChoice));
    }
    if (
      wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      !isWordingChoiceEligibleContext(
        stepId,
        String((state as any).active_specialist || ""),
        prev,
        prev
      )
    ) {
      (state as any).last_specialist_result = {
        ...prev,
        wording_choice_pending: "false",
        wording_choice_selected: "",
      };
    }
    const finalInfo = requireFinalValue(stepId, prev, state);
    // If we cannot find a required value, fall back to regular actioncode routing.
    if (finalInfo.field && !finalInfo.value) {
    } else {
      if (finalInfo.field && finalInfo.value) {
        (state as any)[finalInfo.field] = finalInfo.value;
        state = withProvisionalValue(state, stepId, "");
      }
      (state as any).current_step = String(ACTIONCODE_STEP_TRANSITIONS[actionCodeRaw] || stepId);
      (state as any).active_specialist = "";
      (state as any).last_specialist_result = {};
      userMessage = "";
      forcedProceed = true;
    }
  }
  // NEW SYSTEM: Check if message is an ActionCode (starts with "ACTION_")
  if (!forcedProceed && userMessage.startsWith("ACTION_")) {
    const actionCodeInput = userMessage;
    const routed = processActionCode(actionCodeInput, state.current_step, state, lastSpecialistResult);
    if (inputMode === "widget" && routed === actionCodeInput) {
      const errorPayload = {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: "We could not process this choice. Please refresh and try again.",
        prompt: "",
        specialist: lastSpecialistResult || {},
        state,
        error: {
          type: "unknown_actioncode",
          action_code: actionCodeInput,
          strict: true,
        },
      };
      return finalizeResponse(attachRegistryPayload(errorPayload, lastSpecialistResult));
    }
    userMessage = routed;
  }

  const pendingBeforeTurn = ((state as any).last_specialist_result || {}) as any;
  const isGeneralOfftopicInput = isClearlyGeneralOfftopicInput(userMessage);
  const shouldKeepPendingOnOfftopic =
    String(state.current_step || "") === DREAM_STEP_ID && isGeneralOfftopicInput;
  if (
    wordingChoiceEnabled &&
    inputMode === "widget" &&
    String(pendingBeforeTurn.wording_choice_pending || "") === "true" &&
    isWordingChoiceEligibleContext(
      String(state.current_step || ""),
      String((state as any).active_specialist || ""),
      pendingBeforeTurn,
      pendingBeforeTurn
    ) &&
    !isWordingPickRouteToken(userMessage) &&
    (!isGeneralOfftopicInput || shouldKeepPendingOnOfftopic)
  ) {
    const pendingSpecialist = {
      ...pendingBeforeTurn,
      ...(isGeneralOfftopicInput ? { is_offtopic: true } : {}),
    };
    const pendingChoice = buildWordingChoiceFromPendingSpecialist(
      pendingSpecialist,
      String((state as any).active_specialist || ""),
      pendingBeforeTurn,
      String(state.current_step || "")
    );
    const stateWithUi = await ensureUiStrings(state, userMessage);
    console.log("[wording_choice_pending_blocked]", {
      step: String(state.current_step || ""),
      request_id: String((state as any).__request_id ?? ""),
      client_action_id: String((state as any).__client_action_id ?? ""),
    });
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(state.current_step),
      active_specialist: String((state as any).active_specialist || ""),
      text: buildTextForWidget({ specialist: pendingSpecialist }),
      prompt: pickPrompt(pendingSpecialist),
      specialist: pendingSpecialist,
      state: stateWithUi,
    }, pendingSpecialist, { require_wording_pick: true }, [], [], pendingChoice));
  }

  const wordingSelection = wordingChoiceEnabled
    ? applyWordingPickSelection({
      stepId: String(state.current_step ?? ""),
      routeToken: userMessage,
      state,
    })
    : ({ handled: false, specialist: (state as any).last_specialist_result || {}, nextState: state } as const);
  if (wordingSelection.handled) {
    const stateWithUi = await ensureUiStrings(wordingSelection.nextState, userMessage);
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(stateWithUi.current_step),
      active_specialist: String((stateWithUi as any).active_specialist || ""),
      text: buildTextForWidget({ specialist: wordingSelection.specialist }),
      prompt: pickPrompt(wordingSelection.specialist),
      specialist: wordingSelection.specialist,
      state: stateWithUi,
    }, wordingSelection.specialist));
  }

  const refineAdjustTurn = isRefineAdjustRouteToken(userMessage);
  if (refineAdjustTurn && wordingChoiceEnabled && inputMode === "widget") {
    const prev = (state as any).last_specialist_result || {};
    const rebuilt = buildWordingChoiceFromTurn({
      stepId: String(state.current_step || ""),
      activeSpecialist: String((state as any).active_specialist || ""),
      previousSpecialist: prev,
      specialistResult: prev,
      userTextRaw: String(prev.wording_choice_user_raw || prev.wording_choice_user_normalized || "").trim(),
      isOfftopic: false,
      forcePending: true,
    });
    if (rebuilt.wordingChoice) {
      const pendingSpecialist = {
        ...rebuilt.specialist,
      };
      (state as any).last_specialist_result = pendingSpecialist;
      const stateWithUi = await ensureUiStrings(state, userMessage);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: buildTextForWidget({ specialist: pendingSpecialist }),
        prompt: pickPrompt(pendingSpecialist),
        specialist: pendingSpecialist,
        state: stateWithUi,
      }, pendingSpecialist, { require_wording_pick: true }, [], [], rebuilt.wordingChoice));
    }
  }
  if (refineAdjustTurn) {
    const prev = (state as any).last_specialist_result || {};
    const agentBase = pickWordingAgentBase(prev);
    if (agentBase) {
      const nextPrev = {
        ...prev,
        refined_formulation: agentBase,
        wording_choice_agent_current: agentBase,
      };
      (state as any).last_specialist_result = nextPrev;
    }
  }

  const responseUiFlags = ACTIONCODE_REGISTRY.ui_flags[userMessage] || null;

  // Backend fallback: if Start arrives with empty input, reuse the captured initial message so Step 0 can extract Venture + Name.
  const initialUserMessage = String((state as any).initial_user_message ?? "").trim();
  if (
    userMessage.trim() === "" &&
    initialUserMessage &&
    state.current_step === STEP_0_ID &&
    String((state as any).step_0_final ?? "").trim() === "" &&
    Object.keys((state as any).last_specialist_result ?? {}).length === 0
  ) {
    userMessage = initialUserMessage;
  }

  // Lock language once we see a meaningful user message (prevents mid-flow flips).
  state = await ensureLanguage(state, userMessage);
  const lang = langFromState(state);

  // Presentation: create PPTX on button click (no LLM)
  if (state.current_step === PRESENTATION_STEP_ID && userMessage === "__ROUTE__PRESENTATION_MAKE__") {
    try {
      console.log("[presentation] Generate requested", {
        cwd: process.cwd(),
        hasTemplate: hasPresentationTemplate(),
      });
      const { fileName, filePath } = generatePresentationPptx(state, lang);
      console.log("[presentation] PPTX generated", { fileName, filePath });
      const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
      const pdfPath = convertPptxToPdf(filePath, outDir);
      console.log("[presentation] PDF generated", { pdfPath });
      const pngPath = convertPdfToPng(pdfPath, outDir);
      console.log("[presentation] PNG generated", { pngPath });

      cleanupOldPresentationFiles(outDir, 24 * 60 * 60 * 1000);

      const baseUrl = baseUrlFromEnv();
      const pdfFile = path.basename(pdfPath);
      const pngFile = path.basename(pngPath);
      const pdfUrl = baseUrl ? `${baseUrl}/presentations/${pdfFile}` : `/presentations/${pdfFile}`;
      const pngUrl = baseUrl ? `${baseUrl}/presentations/${pngFile}` : `/presentations/${pngFile}`;

      const message =
        lang.startsWith("nl")
          ? `Je presentatie is klaar.`
          : `Your presentation is ready.`;

      const specialist: PresentationOutput = {
        action: "ASK",
        message,
        question: "",
        refined_formulation: "",
        presentation_brief: "",
        menu_id: "",
        wants_recap: false,
        is_offtopic: false,
      };

      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: PRESENTATION_SPECIALIST,
        text: buildTextForWidget({ specialist }),
        prompt: "",
        specialist,
        presentation_assets: {
          pdf_url: pdfUrl,
          png_url: pngUrl,
          base_name: path.basename(fileName, ".pptx"),
        },
        state: {
          ...state,
          active_specialist: PRESENTATION_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags));
    } catch (err) {
      console.error("[presentation] Generation failed", err);
      const message =
        lang.startsWith("nl")
          ? "Het maken van de presentatie is mislukt. Controleer of de template bestaat en probeer het opnieuw."
          : "Presentation generation failed. Please check that the template exists and try again.";

      const specialist: PresentationOutput = {
        action: "ASK",
        message,
        question: "",
        refined_formulation: "",
        presentation_brief: "",
        menu_id: "",
        wants_recap: false,
        is_offtopic: false,
      };

      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: PRESENTATION_SPECIALIST,
        text: buildTextForWidget({ specialist }),
        prompt: "",
        specialist,
        state: {
          ...state,
          active_specialist: PRESENTATION_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags));
    }
  }

  // Switch back from Dream Explainer to normal Dream: route to Dream specialist, no intro, short prompt to write dream in own words.
  const SWITCH_TO_SELF_DREAM_TOKEN = "__SWITCH_TO_SELF_DREAM__";
  // --------- DREAM EXPLAINER: submit_scores → synthetic Dream-direction ASK (no LLM) ---------
  const isDreamStepExplainer =
    state.current_step === DREAM_STEP_ID &&
    String((state as any).active_specialist ?? "") === DREAM_EXPLAINER_SPECIALIST;
  let parsedScores: number[][] | null = null;
  if (isDreamStepExplainer && userMessage.trim().length > 0) {
    if (userMessage === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
      if (Array.isArray(transientPendingScores)) parsedScores = transientPendingScores as number[][];
    } else {
      try {
        const parsed = JSON.parse(userMessage) as { action?: string; scores?: number[][] };
        if (parsed?.action === "submit_scores" && Array.isArray(parsed.scores)) {
          parsedScores = parsed.scores;
        }
      } catch {
        // not JSON or invalid
      }
    }
  }
  if (isDreamStepExplainer && parsedScores && parsedScores.length > 0) {
    const lastResult = (state as any).last_specialist_result || {};
    const clusters = Array.isArray(lastResult.clusters) ? lastResult.clusters : [];
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const statements =
      statementsFromLast.length > 0
        ? statementsFromLast
        : Array.isArray((state as any).dream_scoring_statements)
          ? (state as any).dream_scoring_statements
          : [];
    if (clusters.length === parsedScores.length && statements.length > 0) {
      type ClusterInfo = { theme: string; statement_indices: number[] };
      const clusterAverages: { theme: string; average: number }[] = clusters.map((c: ClusterInfo, ci: number) => {
        const row = parsedScores![ci] || [];
        const nums = row.map((n) => (typeof n === "number" && !isNaN(n) ? Math.max(1, Math.min(10, n)) : 0)).filter((n) => n > 0);
        const sum = nums.reduce((a, b) => a + b, 0);
        const average = nums.length > 0 ? sum / nums.length : 0;
        return { theme: String((c as any).theme ?? "").trim() || `Category ${ci + 1}`, average };
      });
      const maxAvg = Math.max(...clusterAverages.map((x) => x.average), 0);
      const topClusters = clusterAverages.filter((x) => x.average === maxAvg && x.average > 0);
      const topClusterNames = topClusters.map((x) => x.theme);
      const nextStateScores: CanvasState = {
        ...state,
        last_specialist_result: {
          action: "ASK",
          message: "",
          question: "",
          refined_formulation: "",
          dream: "",
          suggest_dreambuilder: "true",
          statements,
          user_state: "ok",
          wants_recap: false,
          is_offtopic: false,
          scoring_phase: "false",
          clusters: [],
        },
      } as CanvasState;
      (nextStateScores as any).dream_scores = parsedScores;
      (nextStateScores as any).dream_top_clusters = topClusters;
      (nextStateScores as any).dream_awaiting_direction = "true";

      // Immediate formulation (Option A): user clicked "Formulate my dream" → agent formulates from clusters + business context, no extra question screen
      const forcedDecision: OrchestratorOutput = {
        specialist_to_call: DREAM_EXPLAINER_SPECIALIST,
        specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: (user chose to continue without text)`,
        current_step: DREAM_STEP_ID,
        intro_shown_for_step: String((state as any).intro_shown_for_step ?? "").trim() || "dream",
        intro_shown_session: String((state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
        show_step_intro: "false",
        show_session_intro: "false",
      };
      const callFormulation = await callSpecialistStrictSafe({
        model,
        state: nextStateScores,
        decision: forcedDecision,
        userMessage: "", // so USER_DREAM_DIRECTION = "(user chose to continue without text)" → Option A
      }, buildRoutingContext(userMessage), nextStateScores);
      if (!callFormulation.ok) return finalizeResponse(callFormulation.payload);
      rememberLlmCall(callFormulation.value);
      const formulationResult = callFormulation.value.specialistResult;
      const nextStateFormulation = applyStateUpdate({
        prev: nextStateScores,
        decision: forcedDecision,
        specialistResult: formulationResult,
        showSessionIntroUsed: "false",
      });
      (nextStateFormulation as any).dream_awaiting_direction = "false";
      const nextStateFormulationUi = await ensureUiStrings(nextStateFormulation, userMessage);
      const textFormulation = buildTextForWidget({ specialist: formulationResult });
      const promptFormulation = pickPrompt(formulationResult);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(nextStateFormulation.current_step),
        active_specialist: DREAM_EXPLAINER_SPECIALIST,
        text: textFormulation,
        prompt: promptFormulation,
        specialist: formulationResult,
        state: nextStateFormulationUi,
        debug: { submit_scores_handled: true, formulation_direct: true, top_cluster_count: topClusters.length },
      }, formulationResult, responseUiFlags));
    }
  }

  if (userMessage.trim() === SWITCH_TO_SELF_DREAM_TOKEN && state.current_step === DREAM_STEP_ID) {
    const existingDreamCandidate = pickDreamCandidateFromState(state);
    if (!existingDreamCandidate) {
      const rawBusinessName = String((state as any).business_name ?? "").trim();
      const businessName = rawBusinessName && rawBusinessName !== "TBD" ? rawBusinessName : "your future company";
      const specialist: DreamOutput = {
        action: "ASK",
        message:
          "That's a great way to start. Writing your own dream helps clarify what really matters to you and your business.\n\nTake a moment to write a draft of your dream. I'll help you refine it if needed.",
        question: DREAM_MENU_QUESTIONS.DREAM_MENU_INTRO(businessName),
        refined_formulation: "",
        dream: "",
        menu_id: "DREAM_MENU_INTRO",
        suggest_dreambuilder: "false",
        wants_recap: false,
        is_offtopic: false,
      };
      const nextStateSwitch: CanvasState = {
        ...state,
        active_specialist: DREAM_SPECIALIST,
        last_specialist_result: specialist,
      } as CanvasState;
      (nextStateSwitch as any).dream_awaiting_direction = "false";
      const nextStateSwitchUi = await ensureUiStrings(nextStateSwitch, userMessage);
      const textSwitch = buildTextForWidget({ specialist });
      const promptSwitch = pickPrompt(specialist);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(nextStateSwitch.current_step),
        active_specialist: DREAM_SPECIALIST,
        text: textSwitch,
        prompt: promptSwitch,
        specialist,
        state: nextStateSwitchUi,
      }, specialist, responseUiFlags));
    }
    (state as any).intro_shown_for_step = "dream";
    const forcedDecision: OrchestratorOutput = {
      specialist_to_call: DREAM_SPECIALIST,
      specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: I want to write my dream in my own words.`,
      current_step: DREAM_STEP_ID,
      intro_shown_for_step: "dream",
      intro_shown_session: String((state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
      show_step_intro: "false",
      show_session_intro: "false",
    };
    const callDream = await callSpecialistStrictSafe({
      model,
      state,
      decision: forcedDecision,
      userMessage: "I want to write my dream in my own words.",
    }, buildRoutingContext(userMessage), state);
    if (!callDream.ok) return finalizeResponse(callDream.payload);
    rememberLlmCall(callDream.value);
    const nextStateSwitch = applyStateUpdate({
      prev: state,
      decision: forcedDecision,
      specialistResult: callDream.value.specialistResult,
      showSessionIntroUsed: "false",
    });
    const renderedSwitch = renderFreeTextTurnPolicy({
      stepId: String((nextStateSwitch as any).current_step ?? ""),
      state: nextStateSwitch,
      specialist: (nextStateSwitch as any).last_specialist_result || {},
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
    });
    const switchViolation = validateRenderedContractTurn(String((nextStateSwitch as any).current_step ?? ""), renderedSwitch);
    if (switchViolation) {
      return finalizeResponse(attachRegistryPayload({
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(nextStateSwitch.current_step),
        active_specialist: DREAM_SPECIALIST,
        text: "",
        prompt: "",
        specialist: renderedSwitch.specialist,
        state: nextStateSwitch,
        error: {
          type: "contract_violation",
          message: "Rendered output violates the UI contract.",
          reason: switchViolation,
          step: String((nextStateSwitch as any).current_step ?? ""),
          contract_id: renderedSwitch.contractId,
        },
      }, renderedSwitch.specialist));
    }
    (nextStateSwitch as any).last_specialist_result = renderedSwitch.specialist;
    applyUiPhaseByStep(nextStateSwitch, String((nextStateSwitch as any).current_step ?? ""), renderedSwitch.contractId);
    const nextStateSwitchUi = await ensureUiStrings(nextStateSwitch, userMessage);
    const textSwitch = buildTextForWidget({ specialist: renderedSwitch.specialist });
    const promptSwitch = pickPrompt(renderedSwitch.specialist);
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(nextStateSwitch.current_step),
      active_specialist: DREAM_SPECIALIST,
      text: textSwitch,
      prompt: promptSwitch,
      specialist: renderedSwitch.specialist,
      state: nextStateSwitchUi,
    }, renderedSwitch.specialist, responseUiFlags, renderedSwitch.uiActionCodes, renderedSwitch.uiActions, null, {
      contractId: renderedSwitch.contractId,
      contractVersion: renderedSwitch.contractVersion,
      textKeys: renderedSwitch.textKeys,
    }));
  }

  // START trigger (widget start screen)
  const isStartTrigger =
    userMessage.trim() === "" &&
    state.current_step === STEP_0_ID &&
    String((state as any).intro_shown_session) !== "true" &&
    Object.keys((state as any).last_specialist_result ?? {}).length === 0;

  if (isStartTrigger) {
    const started = String((state as any).started ?? "").trim().toLowerCase() === "true";
    if (!started) {
      const stateWithUi = await ensureUiStrings(state, userMessage);
      const startHint =
        typeof (stateWithUi as any).ui_strings?.startHint === "string"
          ? String((stateWithUi as any).ui_strings.startHint)
          : "Click Start in the widget to begin.";
      const specialist: ValidationAndBusinessNameOutput = {
        action: "ASK",
        message: "",
        question: startHint,
        refined_formulation: "",
        business_name: (state as any).business_name || "TBD",
        menu_id: "",
        step_0: "",
        wants_recap: false,
        is_offtopic: false,
      };
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: "",
        prompt: specialist.question,
        specialist,
        state: { ...stateWithUi, active_specialist: STEP_0_SPECIALIST, last_specialist_result: specialist },
      }, specialist, responseUiFlags));
    }
    const existingFirst = (state as any).last_specialist_result;
    const isReuseFirst =
      existingFirst &&
      String(existingFirst.action) === "ASK" &&
      String(existingFirst.question ?? "").trim() !== "";
    if (isReuseFirst) {
      const stateWithUi = await ensureUiStrings(state, userMessage);
      (state as any).intro_shown_session = "true";
      const prompt = String(existingFirst.question || "").trim() || step0QuestionForLang(langFromState(state));
      const specialistForReuse = {
        ...existingFirst,
        action: "ASK",
        message: STEP0_CARDDESC_EN,
        question: prompt,
      };
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: STEP0_CARDDESC_EN,
        prompt,
        specialist: specialistForReuse,
        state: { ...stateWithUi, active_specialist: STEP_0_SPECIALIST, last_specialist_result: specialistForReuse },
      }, specialistForReuse, responseUiFlags));
    }

    (state as any).intro_shown_session = "true";

    const step0Final = String((state as any).step_0_final ?? "").trim();

    // If Step 0 is already known, show readiness as a one-action menu.
    if (step0Final) {
      const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
      const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
      const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

      const venture = (ventureMatch?.[1] || "venture").trim();
      const name = (nameMatch?.[1] || (state as any).business_name || "TBD").trim();
      const status = (statusMatch?.[1] || "starting").toLowerCase();
      const statement =
        status === "existing"
          ? `You have a ${venture} called ${name}.`
          : `You want to start a ${venture} called ${name}.`;
      const confirmReady = " Are you ready to start with the first step: the Dream?";

      const specialist: ValidationAndBusinessNameOutput = {
        action: "ASK",
        message: "",
        question: `1) Yes, I'm ready. Let's start!\n\n${statement}${confirmReady}`,
        refined_formulation: "",
        business_name: name || "TBD",
        menu_id: "STEP0_MENU_READY_START",
        step_0: step0Final,
        wants_recap: false,
        is_offtopic: false,
      };

      const stateWithUi = await ensureUiStrings(state, userMessage);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: "",
        prompt: specialist.question,
        specialist,
        state: {
          ...stateWithUi,
          ...((state as any).started !== "true" ? { started: "true" as const } : {}),
          active_specialist: STEP_0_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags));
    }

    // Otherwise: first-time Step 0 setup question.
    const initialMsg = String((state as any).initial_user_message ?? "").trim();
    if (!String((state as any).language ?? "").trim() && initialMsg) {
      state = await ensureLanguage(state, initialMsg);
    }
    const stateWithUi = await ensureUiStrings(state, userMessage);
    const specialist: ValidationAndBusinessNameOutput = {
      action: "ASK",
      message: STEP0_CARDDESC_EN,
      question: step0QuestionForLang(langFromState(state)),
      refined_formulation: "",
      business_name: (state as any).business_name || "TBD",
      menu_id: "",
      step_0: "",
      wants_recap: false,
      is_offtopic: false,
    };

    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(state.current_step),
      active_specialist: STEP_0_SPECIALIST,
      text: specialist.message,
      prompt: specialist.question,
      specialist,
      state: {
        ...stateWithUi,
        ...((state as any).started !== "true" ? { started: "true" as const } : {}),
        active_specialist: STEP_0_SPECIALIST,
        last_specialist_result: specialist,
      },
    }, specialist, responseUiFlags));
  }

  // --------- DREAM READINESS → DREAM EXPLAINER (guard) ----------
  const lastResult = (state as any).last_specialist_result || {};
  const explicitDreamExerciseRoute = userMessage === "__ROUTE__DREAM_START_EXERCISE__";
  const dreamStartRequested = explicitDreamExerciseRoute || isClearYes(userMessage);
  const dreamReadinessYes =
    state.current_step === DREAM_STEP_ID &&
    (
      explicitDreamExerciseRoute ||
      (
        String(lastResult.suggest_dreambuilder ?? "") === "true" &&
        dreamStartRequested
      )
    );
  const dreamReadinessFallback =
    state.current_step === DREAM_STEP_ID &&
    dreamStartRequested &&
    String(lastResult.action ?? "") === "ASK" &&
    /ready|start/i.test(String(lastResult.question ?? ""));
  const useDreamExplainerGuard = dreamReadinessYes || dreamReadinessFallback;
  if (useDreamExplainerGuard) {
    const forcedDecision: OrchestratorOutput = {
      specialist_to_call: DREAM_EXPLAINER_SPECIALIST,
      specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: ${userMessage}`,
      current_step: DREAM_STEP_ID,
      intro_shown_for_step: String((state as any).intro_shown_for_step ?? ""),
      intro_shown_session: (state as any).intro_shown_session === "true" ? "true" : "false",
      show_step_intro: "false",
      show_session_intro: "false",
    };
    const callDreamExplainer = await callSpecialistStrictSafe({
      model,
      state,
      decision: forcedDecision,
      userMessage,
    }, buildRoutingContext(userMessage), state);
    if (!callDreamExplainer.ok) return finalizeResponse(callDreamExplainer.payload);
    rememberLlmCall(callDreamExplainer.value);
    const nextStateDream = applyStateUpdate({
      prev: state,
      decision: forcedDecision,
      specialistResult: callDreamExplainer.value.specialistResult,
      showSessionIntroUsed: "false",
    });
    const renderedDream = renderFreeTextTurnPolicy({
      stepId: String((nextStateDream as any).current_step ?? ""),
      state: nextStateDream,
      specialist: (nextStateDream as any).last_specialist_result || {},
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
    });
    const dreamViolation = validateRenderedContractTurn(String((nextStateDream as any).current_step ?? ""), renderedDream);
    if (dreamViolation) {
      return finalizeResponse(attachRegistryPayload({
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(nextStateDream.current_step),
        active_specialist: String((nextStateDream as any).active_specialist || ""),
        text: "",
        prompt: "",
        specialist: renderedDream.specialist,
        state: nextStateDream,
        error: {
          type: "contract_violation",
          message: "Rendered output violates the UI contract.",
          reason: dreamViolation,
          step: String((nextStateDream as any).current_step ?? ""),
          contract_id: renderedDream.contractId,
        },
      }, renderedDream.specialist));
    }
    (nextStateDream as any).last_specialist_result = renderedDream.specialist;
    applyUiPhaseByStep(nextStateDream, String((nextStateDream as any).current_step ?? ""), renderedDream.contractId);
    const textDream = buildTextForWidget({ specialist: renderedDream.specialist });
    const promptDream = pickPrompt(renderedDream.specialist);
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(nextStateDream.current_step),
      active_specialist: String((nextStateDream as any).active_specialist || ""),
      text: textDream,
      prompt: promptDream,
      specialist: renderedDream.specialist,
      state: nextStateDream,
      debug: {
        decision: forcedDecision,
        attempts: callDreamExplainer.value.attempts,
        language: lang,
        meta_user_message_ignored: false,
      },
    }, renderedDream.specialist, responseUiFlags, renderedDream.uiActionCodes, renderedDream.uiActions, null, {
      contractId: renderedDream.contractId,
      contractVersion: renderedDream.contractVersion,
      textKeys: renderedDream.textKeys,
    }));
  }

  // --------- ORCHESTRATE (decision 1) ----------
  const decision1 = decideOrchestration(state, userMessage);

  // We do not render a session intro here.
  const showSessionIntro: BoolString = decision1.show_session_intro;

  // --------- CALL SPECIALIST (first) ----------
  const call1 = await callSpecialistStrictSafe(
    { model, state, decision: decision1, userMessage },
    buildRoutingContext(userMessage),
    state
  );
  if (!call1.ok) return finalizeResponse(call1.payload);
  rememberLlmCall(call1.value);
  let attempts = call1.value.attempts;
  let specialistResult: any = call1.value.specialistResult;
  const previousSpecialistForTurn = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  const currentStepId = String(decision1.current_step || "");
  // --------- PATCH: DreamExplainer scoring view must have statements ----------
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    String(specialistResult.scoring_phase ?? "") === "true" &&
    (!Array.isArray(specialistResult.statements) || specialistResult.statements.length === 0)
  ) {
    const prevStatements = Array.isArray((state as any).last_specialist_result?.statements)
      ? (state as any).last_specialist_result.statements
      : [];
    if (prevStatements.length > 0) {
      specialistResult = { ...specialistResult, statements: prevStatements };
    }
  }

  // --------- GUARD: scoring view only when at least 20 statements ----------
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    String(specialistResult.scoring_phase ?? "") === "true"
  ) {
    const stmtCount = Array.isArray(specialistResult.statements) ? specialistResult.statements.length : 0;
    if (stmtCount < 20) {
      specialistResult = {
        ...specialistResult,
        scoring_phase: "false",
        clusters: [],
      };
    }
  }

  // --------- BIGWHY SIZE GUARD ----------
  if (String(decision1.current_step || "") === BIGWHY_STEP_ID) {
    const candidate = pickBigWhyCandidate(specialistResult);
    if (candidate && countWords(candidate) > BIGWHY_MAX_WORDS) {
      const shortenRequest = `__SHORTEN_BIGWHY__ ${candidate}`;
      const callShorten = await callSpecialistStrictSafe({
        model,
        state,
        decision: decision1,
        userMessage: shortenRequest,
      }, buildRoutingContext(shortenRequest), state);
      if (!callShorten.ok) return finalizeResponse(callShorten.payload);
      rememberLlmCall(callShorten.value);
      attempts = Math.max(attempts, callShorten.value.attempts);
      specialistResult = callShorten.value.specialistResult;
      const shortened = pickBigWhyCandidate(specialistResult);
      if (!shortened || countWords(shortened) > BIGWHY_MAX_WORDS) {
        specialistResult = buildBigWhyTooLongFeedback(lang);
      }
    }
  }

  // --------- UPDATE STATE (after first specialist) ----------
  specialistResult = normalizeEntitySpecialistResult(String(decision1.current_step || ""), specialistResult);
  if (
    isMetaOfftopicFallbackTurn({
      stepId: String(decision1.current_step || ""),
      userMessage,
      specialistResult,
    })
  ) {
    specialistResult = {
      ...specialistResult,
      is_offtopic: true,
    };
  }

  let nextState = applyStateUpdate({
    prev: state,
    decision: decision1,
    specialistResult,
    showSessionIntroUsed: "false",
  });
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    String((state as any).dream_awaiting_direction ?? "").trim() === "true"
  ) {
    (nextState as any).dream_awaiting_direction = "false";
  }
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    Array.isArray(specialistResult.statements) &&
    specialistResult.statements.length >= 20
  ) {
    (nextState as any).dream_scoring_statements = specialistResult.statements;
  }

  let finalDecision = decision1;

  let actionCodesOverride: string[] | null = null;
  let renderedActionsOverride: RenderedAction[] | null = null;
  let wordingChoiceOverride: WordingChoiceUiPayload | null = null;
  let contractMetaOverride: UiContractMeta | null = null;
  const rendered = renderFreeTextTurnPolicy({
    stepId: String((nextState as any).current_step ?? ""),
    state: nextState,
    specialist: (specialistResult || {}) as Record<string, unknown>,
    previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
  });
  const contractViolation = validateRenderedContractTurn(String((nextState as any).current_step ?? ""), rendered);
  if (contractViolation) {
    return finalizeResponse(attachRegistryPayload({
      ok: false as const,
      tool: "run_step" as const,
      current_step_id: String(nextState.current_step),
      active_specialist: String((nextState as any).active_specialist || ""),
      text: "",
      prompt: "",
      specialist: rendered.specialist,
      state: nextState,
      error: {
        type: "contract_violation",
        message: "Rendered output violates the UI contract.",
        reason: contractViolation,
        step: String((nextState as any).current_step ?? ""),
        contract_id: rendered.contractId,
      },
    }, rendered.specialist));
  }
  specialistResult = rendered.specialist;
  actionCodesOverride = rendered.uiActionCodes;
  renderedActionsOverride = rendered.uiActions;
  contractMetaOverride = {
    contractId: rendered.contractId,
    contractVersion: rendered.contractVersion,
    textKeys: rendered.textKeys,
  };
  applyUiPhaseByStep(nextState, String((nextState as any).current_step ?? ""), rendered.contractId);
  (nextState as any).last_specialist_result = specialistResult;
  let requireWordingPick = false;

  const stepForClaimSanitizer = String((nextState as any).current_step ?? "");
  const hasWordingChoicePanel = String((specialistResult as any)?.wording_choice_pending || "") === "true";
  if (!hasWordingChoicePanel) {
    const field = fieldForStep(stepForClaimSanitizer);
    const fieldValue = field ? String((specialistResult as any)?.[field] || "").trim() : "";
    const refinedValue = String((specialistResult as any)?.refined_formulation || "").trim();
    const statementCount = Array.isArray((specialistResult as any)?.statements)
      ? ((specialistResult as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
      : 0;
    if (!fieldValue && !refinedValue && statementCount === 0) {
      const currentMessage = String((specialistResult as any)?.message || "");
      const sanitizedMessage = stripUnsupportedReformulationClaims(currentMessage);
      if (sanitizedMessage !== currentMessage) {
        specialistResult = {
          ...specialistResult,
          message: sanitizedMessage,
        };
        (nextState as any).last_specialist_result = specialistResult;
      }
    }
  }

  const isDreamExplainerOfftopicTurn =
    String((nextState as any).current_step || "") === DREAM_STEP_ID &&
    String((nextState as any).active_specialist || "") === DREAM_EXPLAINER_SPECIALIST &&
    (specialistResult?.is_offtopic === true ||
      String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true");
  if (isDreamExplainerOfftopicTurn) {
    const previousSpecialist = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    const cleanMessage = stripChoiceInstructionNoise(String((specialistResult as any)?.message || "").trim());
    const backToExerciseLine = "Now let's get back to the Dream Exercise.";
    specialistResult = {
      ...specialistResult,
      action: "ASK",
      menu_id: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
      suggest_dreambuilder: "true",
      message: cleanMessage ? `${cleanMessage}\n\n${backToExerciseLine}` : backToExerciseLine,
      statements:
        Array.isArray((specialistResult as any)?.statements) && (specialistResult as any).statements.length > 0
          ? (specialistResult as any).statements
          : (Array.isArray((previousSpecialist as any)?.statements) ? (previousSpecialist as any).statements : []),
      wording_choice_pending: "false",
      wording_choice_selected: "",
    };
  }
  const currentStepForWordingChoice = String((nextState as any).current_step || "");
  const currentSpecialistForWordingChoice = String((nextState as any).active_specialist || "");
  const isCurrentTurnOfftopic =
    specialistResult?.is_offtopic === true ||
    String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
  const eligibleForWordingChoiceTurn = isWordingChoiceEligibleContext(
    currentStepForWordingChoice,
    currentSpecialistForWordingChoice,
    (specialistResult || {}) as Record<string, unknown>,
    ((state as any).last_specialist_result || {}) as Record<string, unknown>
  );
  const userTextForWordingChoice = (() => {
    const submitted = String(submittedUserText || "").trim();
    if (submitted) return submitted;
    const raw = String(userMessage || "").trim();
    if (!raw) return "";
    if (raw.startsWith("ACTION_")) return "";
    if (raw.startsWith("__ROUTE__")) return "";
    return raw;
  })();
  if (
    wordingChoiceEnabled &&
    inputMode === "widget" &&
    eligibleForWordingChoiceTurn &&
    !isCurrentTurnOfftopic &&
    String((specialistResult as any)?.wording_choice_pending || "") !== "true"
  ) {
    const rebuilt = buildWordingChoiceFromTurn({
      stepId: currentStepForWordingChoice,
      activeSpecialist: currentSpecialistForWordingChoice,
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      specialistResult,
      userTextRaw: userTextForWordingChoice,
      isOfftopic: false,
    });
    specialistResult = rebuilt.specialist;
  }
  (nextState as any).last_specialist_result = specialistResult;
  if (wordingChoiceEnabled && inputMode === "widget") {
    const pendingChoice = buildWordingChoiceFromPendingSpecialist(
      specialistResult,
      String((nextState as any).active_specialist || ""),
      ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      String((nextState as any).current_step || "")
    );
    if (pendingChoice) {
      wordingChoiceOverride = pendingChoice;
      requireWordingPick = true;
      actionCodesOverride = [];
      renderedActionsOverride = [];
    }
  }

  const currentStepForContract = String((nextState as any).current_step ?? "");
  const specialistContractId = String((specialistResult as any)?.ui_contract_id || "").trim();
  if (currentStepForContract && specialistContractId) {
    applyUiPhaseByStep(nextState, currentStepForContract, specialistContractId);
    if (!contractMetaOverride?.contractId) {
      contractMetaOverride = {
        contractId: specialistContractId,
        contractVersion: String((specialistResult as any)?.ui_contract_version || UI_CONTRACT_VERSION),
        textKeys: Array.isArray((specialistResult as any)?.ui_text_keys)
          ? (specialistResult as any)?.ui_text_keys
          : [],
      };
    }
  }

  const text = buildTextForWidget({ specialist: specialistResult });
  const prompt = pickPrompt(specialistResult);

  // keep state consistent even though we don't render session intro copy here
  if (showSessionIntro === "true" && String((nextState as any).intro_shown_session) !== "true") {
    (nextState as any).intro_shown_session = "true";
  }

  const mergedFlags = {
    ...(responseUiFlags || {}),
    ...(requireWordingPick ? { require_wording_pick: true } : {}),
  };

  return finalizeResponse(attachRegistryPayload({
    ok: true as const,
    tool: "run_step" as const,
    current_step_id: String(nextState.current_step),
    active_specialist: String((nextState as any).active_specialist || ""),
    text,
    prompt,
    specialist: specialistResult,
    state: nextState,
    debug: {
      decision: finalDecision,
      attempts,
      language: lang,
      meta_user_message_ignored: looksLikeMetaInstruction(rawNormalized) && pristineAtEntry,
    },
  }, specialistResult, mergedFlags, actionCodesOverride, renderedActionsOverride, wordingChoiceOverride, contractMetaOverride));
}
