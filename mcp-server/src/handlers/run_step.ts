// mcp-server/src/handlers/run_step.ts
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { type LLMUsage } from "../core/llm.js";
import { resolveModelForCall } from "../core/model_routing.js";
import {
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  type CanvasState,
  type ProvisionalSource,
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
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  type DreamOutput,
} from "../steps/dream.js";

import {
  DREAM_EXPLAINER_SPECIALIST,
} from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
} from "../steps/strategy.js";

import {
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
} from "../steps/targetgroup.js";

import {
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
} from "../steps/productsservices.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
} from "../steps/rulesofthegame.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  type PresentationOutput,
} from "../steps/presentation.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, MENU_LABEL_KEYS, labelKeyForMenuAction } from "../core/menu_contract.js";
import {
  renderFreeTextTurnPolicy,
  type TurnPolicyRenderResult,
  type TurnOutputStatus,
} from "../core/turn_policy_renderer.js";
import {
  NEXT_MENU_BY_ACTIONCODE,
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
} from "../core/ui_contract_matrix.js";
import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import {
  UI_STRINGS_WITH_MENU_KEYS,
} from "../i18n/ui_strings_defaults.js";
import {
  buildFailClosedState,
  detectInvalidContractStateMarkers,
  detectLegacySessionMarkers,
  parseRunStepIngressArgs,
  type RunStepArgs,
} from "./ingress.js";
import {
  createBuildRateLimitErrorPayload,
  createBuildTimeoutErrorPayload,
  createBuildTransientFallbackSpecialist,
  createCallSpecialistStrict,
  createCallSpecialistStrictSafe,
  hasUsableSpecialistForRetry as hasUsableSpecialistForRetryDispatch,
} from "./specialist_dispatch.js";
import {
  createRunStepUiPayloadHelpers,
  createRunStepWordingHelpers,
  createRunStepWordingHeuristicHelpers,
  createRunStepRouteHelpers,
  createRunStepStateUpdateHelpers,
  createRunStepPipelineHelpers,
  createRunStepPolicyMetaHelpers,
  createRunStepStep0DisplayHelpers,
} from "./run_step_modules.js";
import {
  createRunStepI18nRuntimeHelpers,
  type UiI18nTelemetryCounters,
} from "./run_step_i18n_runtime.js";
import { createRunStepResponseHelpers } from "./run_step_response.js";
import {
  parseStep0Final,
  hasValidStep0Final,
  maybeSeedStep0CandidateFromInitialMessage,
} from "./run_step_step0.js";
import {
  tokenizeWords,
  normalizeLightUserInput,
  normalizeListUserInput,
  isMaterialRewriteCandidate,
  shouldTreatAsStepContributingInput,
  isClearlyGeneralOfftopicInput,
  parseListItems,
  splitSentenceItems,
  canonicalizeComparableText,
  areEquivalentWordingVariants,
} from "./run_step_wording_heuristics.js";
import {
  LANGUAGE_LOCK_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
  OFF_TOPIC_POLICY,
  OFFTOPIC_FLAG_CONTRACT_INSTRUCTION,
  USER_INTENT_CONTRACT_INSTRUCTION,
  META_TOPIC_CONTRACT_INSTRUCTION,
} from "./run_step_policy_meta.js";

export {
  LANGUAGE_LOCK_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
  OFF_TOPIC_POLICY,
};

function uiDefaultString(key: string, fallback = ""): string {
  const candidate = String(UI_STRINGS_WITH_MENU_KEYS[key] || "").trim();
  if (candidate) return candidate;
  return String(fallback || "").trim();
}

function formatIndexedTemplate(templateRaw: string, values: string[]): string {
  let out = String(templateRaw || "");
  for (let i = 0; i < values.length; i += 1) {
    out = out.replace(new RegExp(`\\{${i}\\}`, "g"), String(values[i] || ""));
  }
  return out;
}

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function step0CardDescForState(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  return uiStringFromStateMap(state, "step0.carddesc", uiDefaultString("step0.carddesc"));
}

function step0QuestionForState(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  return uiStringFromStateMap(
    state,
    "step0.question.initial",
    uiDefaultString("step0.question.initial")
  );
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
  motivationQuotesV11: boolean;
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
const DREAM_EXPLAINER_REFINE_MENU_ID = "DREAM_EXPLAINER_MENU_REFINE";
type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";
const DREAM_START_EXERCISE_ACTION_CODES = new Set<string>([
  "ACTION_DREAM_INTRO_START_EXERCISE",
  "ACTION_DREAM_WHY_START_EXERCISE",
  "ACTION_DREAM_SUGGESTIONS_START_EXERCISE",
  "ACTION_DREAM_REFINE_START_EXERCISE",
]);
const DREAM_PICK_ONE_ROUTE_TOKEN = "__ROUTE__DREAM_PICK_ONE__";
const ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN = "__ROUTE__ROLE_CHOOSE_FOR_ME__";
const DREAM_FORCE_REFINE_ROUTE_PREFIX = "__ROUTE__DREAM_FORCE_REFINE__";
const STRATEGY_CONSOLIDATE_ROUTE_TOKEN = "__ROUTE__STRATEGY_CONSOLIDATE__";
const PRESENTATION_MAKE_ROUTE_TOKEN = "__ROUTE__PRESENTATION_MAKE__";
const SWITCH_TO_SELF_DREAM_TOKEN = "__SWITCH_TO_SELF_DREAM__";
const DREAM_START_EXERCISE_ROUTE_TOKEN = "__ROUTE__DREAM_START_EXERCISE__";
const ACTION_BOOTSTRAP_POLL_TOKEN = "ACTION_BOOTSTRAP_POLL";
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

function normalizeDreamRuntimeMode(raw: unknown): DreamRuntimeMode {
  const mode = String(raw || "").trim();
  if (mode === "builder_collect" || mode === "builder_scoring" || mode === "builder_refine") return mode;
  return "self";
}

function setDreamRuntimeMode(state: CanvasState, mode: DreamRuntimeMode): void {
  (state as any).__dream_runtime_mode = mode;
  if (mode === "builder_collect") {
    const existingStage = String((state as any).__dream_builder_prompt_stage || "").trim();
    if (!existingStage) {
      (state as any).__dream_builder_prompt_stage = "base";
    }
    return;
  }
  (state as any).__dream_builder_prompt_stage = "";
}

function getDreamRuntimeMode(state: CanvasState): DreamRuntimeMode {
  return normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);
}

function syncDreamRuntimeMode(state: CanvasState): void {
  const currentStep = String((state as any).current_step || "").trim();
  if (currentStep !== DREAM_STEP_ID) {
    setDreamRuntimeMode(state, "self");
    return;
  }
  const rawMode = String((state as any).__dream_runtime_mode || "").trim();
  if (rawMode) {
    setDreamRuntimeMode(state, normalizeDreamRuntimeMode(rawMode));
    return;
  }
  const activeSpecialist = String((state as any).active_specialist || "").trim();
  if (activeSpecialist !== DREAM_EXPLAINER_SPECIALIST) {
    setDreamRuntimeMode(state, "self");
    return;
  }
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  const scoringPhase = String((last as any).scoring_phase || "").trim();
  if (scoringPhase === "true") {
    setDreamRuntimeMode(state, "builder_scoring");
    return;
  }
  const phaseMap =
    (state as any).__ui_phase_by_step && typeof (state as any).__ui_phase_by_step === "object"
      ? ((state as any).__ui_phase_by_step as Record<string, unknown>)
      : {};
  const menuId = parseMenuFromContractIdForStep(phaseMap[DREAM_STEP_ID], DREAM_STEP_ID);
  if (menuId === DREAM_EXPLAINER_REFINE_MENU_ID) {
    setDreamRuntimeMode(state, "builder_refine");
    return;
  }
  setDreamRuntimeMode(state, "builder_collect");
}

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
    motivationQuotesV11: holisticPolicyV2 && envFlagEnabled("BSC_MOTIVATION_QUOTES_V11", localDevDefaults),
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
  const contractId = String((safe as any).ui_contract_id || "").trim();
  const contractStepId = contractId.split(":")[0] || "";
  const menuId = parseMenuFromContractIdForStep(contractId, contractStepId);
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
  safe.user_intent = "OFFTOPIC";
  safe.meta_topic = "NONE";
  const shouldCleanQuestion =
    isWidgetSuppressedEscapeMenuId(menuId) || hasEscapeLabelPhrase(question);
  if (shouldCleanQuestion) {
    const cleanedQuestion = String(question || "")
      .split(/\r?\n/)
      .filter((line) => !hasEscapeLabelPhrase(line))
      .join("\n")
      .trim();
    safe.question = cleanedQuestion;
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
  safe.feedback_reason_key = "";
  safe.feedback_reason_text = "";
  return safe;
}

type SemanticViolationReason =
  | "missing_prompt_for_interactive_ask"
  | "confirm_present_without_accepted_evidence"
  | "intro_mode_must_not_expose_confirm"
  | "wording_choice_mode_requires_instruction_or_context";

const SEMANTIC_VIOLATION_REASONS = new Set<SemanticViolationReason>([
  "missing_prompt_for_interactive_ask",
  "confirm_present_without_accepted_evidence",
  "intro_mode_must_not_expose_confirm",
  "wording_choice_mode_requires_instruction_or_context",
]);

function isSemanticViolationReason(reason: string | null | undefined): reason is SemanticViolationReason {
  if (!reason) return false;
  return SEMANTIC_VIOLATION_REASONS.has(reason as SemanticViolationReason);
}

function hasAcceptedOutputEvidence(state: CanvasState, stepId: string): boolean {
  const finalField = String(FINAL_FIELD_BY_STEP_ID[stepId] || "").trim();
  const committedFinal = finalField ? String((state as any)?.[finalField] || "").trim() : "";
  if (committedFinal) return true;
  const provisional = provisionalValueForStep(state as any, stepId);
  if (!provisional) return false;
  const source = provisionalSourceForStep(state as any, stepId);
  return source === "user_input" || source === "wording_pick" || source === "action_route";
}

function validateRenderedContractTurn(
  stepId: string,
  rendered: TurnPolicyRenderResult,
  state?: CanvasState
): string | null {
  const specialist = (rendered.specialist || {}) as Record<string, unknown>;
  const action = String(specialist.action || "").trim().toUpperCase();
  const contractId = String(rendered.contractId || specialist.ui_contract_id || "").trim();
  const menuId = parseMenuFromContractIdForStep(contractId, stepId);
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
  if (stepId === DREAM_STEP_ID && state) {
    const dreamMode = getDreamRuntimeMode(state);
    if (dreamMode === "builder_collect") {
      if (menuId !== DREAM_EXPLAINER_SWITCH_SELF_MENU_ID) return "dream_builder_collect_menu_mismatch";
      if (actionCodes.length !== 1 || actionCodes[0] !== "ACTION_DREAM_SWITCH_TO_SELF") {
        return "dream_builder_collect_action_mismatch";
      }
    }
    if (dreamMode === "builder_refine" && menuId !== DREAM_EXPLAINER_REFINE_MENU_ID) {
      return "dream_builder_refine_menu_mismatch";
    }
    if (dreamMode === "builder_scoring" && actionCodes.length > 0) {
      return "dream_builder_scoring_should_not_render_actions";
    }
  }

  for (const code of actionCodes) {
    if (!ACTIONCODE_REGISTRY.actions[code]) return `unknown_action_code:${code}`;
  }
  if (state) {
    const clickedLabel = String((state as any).__last_clicked_label_for_contract || "").trim();
    const clickedActionCode = String((state as any).__last_clicked_action_for_contract || "").trim().toUpperCase();
    if (clickedLabel) {
      const clickedKey = clickedLabel.toLowerCase();
      const nextLabels = uiActions
        .map((action) => String((action as any)?.label || "").trim().toLowerCase())
        .filter(Boolean);
      const allowRepeatedLabel =
        clickedActionCode === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST";
      if (!allowRepeatedLabel && nextLabels.includes(clickedKey)) {
        return "repeated_clicked_label_after_transition";
      }
    }
  }
  if (menuId) {
    const allowed = new Set((ACTIONCODE_REGISTRY.menus[menuId] || []).map((code) => String(code || "").trim()));
    if (allowed.size === 0) return "menu_has_no_registry_actions";
    for (const code of actionCodes) {
      if (!allowed.has(code)) return `action_code_not_in_menu:${code}`;
    }
  }

  const hasConfirmAction = actionCodes.some((code) => isConfirmActionCode(code));
  if (rendered.status === "no_output" && hasConfirmAction) {
    return "intro_mode_must_not_expose_confirm";
  }
  if (state && hasConfirmAction && !hasAcceptedOutputEvidence(state, stepId)) {
    return "confirm_present_without_accepted_evidence";
  }
  if (
    action === "ASK" &&
    (rendered.status === "no_output" || rendered.status === "incomplete_output")
  ) {
    const renderMode = state ? inferUiRenderModeForStep(state, stepId) : "menu";
    const dreamMode = state && stepId === DREAM_STEP_ID ? getDreamRuntimeMode(state) : "self";
    const promptRequired = !(renderMode === "no_buttons" || (stepId === DREAM_STEP_ID && dreamMode === "builder_scoring"));
    if (promptRequired && !question) {
      return "missing_prompt_for_interactive_ask";
    }
  }
  if (String((specialist as any).wording_choice_pending || "").trim() === "true") {
    const hasWordingContext =
      Boolean(String((specialist as any).message || "").trim()) ||
      Boolean(question) ||
      Boolean(String((specialist as any).wording_choice_user_raw || "").trim()) ||
      Boolean(String((specialist as any).wording_choice_user_normalized || "").trim()) ||
      Boolean(String((specialist as any).wording_choice_agent_current || "").trim()) ||
      (Array.isArray((specialist as any).wording_choice_user_items) &&
        ((specialist as any).wording_choice_user_items as unknown[]).length > 0) ||
      (Array.isArray((specialist as any).wording_choice_suggestion_items) &&
        ((specialist as any).wording_choice_suggestion_items as unknown[]).length > 0);
    if (!hasWordingContext) return "wording_choice_mode_requires_instruction_or_context";
  }

  if (stepId !== STEP_0_ID && rendered.status === "valid_output") {
    if (state && inferUiRenderModeForStep(state, stepId) === "no_buttons") {
      return null;
    }
    const inDreamBuilderMode =
      stepId === DREAM_STEP_ID &&
      state &&
      getDreamRuntimeMode(state) !== "self";
    if (!inDreamBuilderMode) {
      const expectedMenuId = String(DEFAULT_MENU_BY_STATUS[stepId]?.valid_output || "").trim();
      if (expectedMenuId && menuId !== expectedMenuId) {
        return `invalid_valid_output_menu:${menuId || "NO_MENU"}_expected:${expectedMenuId}`;
      }
    }
  }

  if (
    stepId !== STEP_0_ID &&
    rendered.status !== "no_output" &&
    actionCodes.length === 0
  ) {
    if (state && inferUiRenderModeForStep(state, stepId) === "no_buttons") {
      return null;
    }
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

  const offTopicShapeViolation = validateNonStep0OfftopicMessageShape(stepId, specialist, state);
  if (offTopicShapeViolation) return offTopicShapeViolation;

  return null;
}

function semanticFallbackSpecialistForStep(
  stepId: string,
  specialist: Record<string, unknown>,
  reason: SemanticViolationReason,
  state: CanvasState
): Record<string, unknown> {
  const next = { ...specialist };
  if (reason === "missing_prompt_for_interactive_ask") {
    (next as any).question = promptFallbackForInteractiveAsk(state, stepId);
  }
  if (reason === "wording_choice_mode_requires_instruction_or_context") {
    const existingMessage = String((next as any).message || "").trim();
    if (!existingMessage) {
      (next as any).message = uiStringFromStateMap(
        state,
        "wording.choice.context.default",
        uiDefaultString("wording.choice.context.default", "Please choose the wording that fits best.")
      );
    }
  }
  if (reason === "confirm_present_without_accepted_evidence" || reason === "intro_mode_must_not_expose_confirm") {
    const field = fieldForStep(stepId);
    if (field) (next as any)[field] = "";
    (next as any).refined_formulation = "";
    if (Array.isArray((next as any).statements)) {
      (next as any).statements = [];
    }
  }
  return next;
}

function validateRenderedContractOrRecover(params: {
  stepId: string;
  rendered: TurnPolicyRenderResult;
  state: CanvasState;
  previousSpecialist: Record<string, unknown>;
  telemetry?: UiI18nTelemetryCounters | null;
}): { rendered: TurnPolicyRenderResult; state: CanvasState; violation: string | null; recovered: boolean } {
  let rendered = params.rendered;
  let state = params.state;
  const stepId = String(params.stepId || "").trim();
  const specialistWithInvariants = enforcePromptInvariants({
    stepId,
    status: rendered.status,
    specialist: (rendered.specialist || {}) as Record<string, unknown>,
    state,
  });
  rendered = {
    ...rendered,
    specialist: specialistWithInvariants,
  };
  const violation = validateRenderedContractTurn(stepId, rendered, state);
  if (!violation) {
    return { rendered, state, violation: null, recovered: false };
  }
  if (!isUiSemanticInvariantsV1Enabled() || !isSemanticViolationReason(violation)) {
    return { rendered, state, violation, recovered: false };
  }
  if (violation === "missing_prompt_for_interactive_ask") {
    bumpUiI18nCounter(params.telemetry, "semantic_prompt_missing_count");
  }
  if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
    bumpUiI18nCounter(params.telemetry, "semantic_confirm_blocked_count");
  }
  let fallbackState = state;
  if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
    fallbackState = clearStepInteractiveState(fallbackState, stepId);
    bumpUiI18nCounter(params.telemetry, "state_hygiene_resets_count");
  }
  const fallbackSpecialist = semanticFallbackSpecialistForStep(
    stepId,
    (rendered.specialist || {}) as Record<string, unknown>,
    violation,
    fallbackState
  );
  let rerendered = renderFreeTextTurnPolicy({
    stepId,
    state: fallbackState,
    specialist: fallbackSpecialist,
    previousSpecialist: params.previousSpecialist || {},
  });
  rerendered = {
    ...rerendered,
    specialist: enforcePromptInvariants({
      stepId,
      status: rerendered.status,
      specialist: (rerendered.specialist || {}) as Record<string, unknown>,
      state: fallbackState,
    }),
  };
  const rerenderViolation = validateRenderedContractTurn(stepId, rerendered, fallbackState);
  if (!rerenderViolation) {
    return { rendered: rerendered, state: fallbackState, violation: null, recovered: true };
  }
  return { rendered, state, violation, recovered: false };
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
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") return false;
  return process.env.LOCAL_DEV === "1";
}

function isUiI18nV2Enabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_TEXT_KEYS", envFlagEnabled("UI_I18N_V2", true));
}

function isMenuLabelKeysV1Enabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_MENU_KEY_ONLY", envFlagEnabled("MENU_LABEL_KEYS_V1", true));
}

function isUiI18nV3LangBootstrapEnabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_LANG_BOOTSTRAP", true);
}

function isUiLocaleMetaV1Enabled(): boolean {
  return envFlagEnabled("UI_LOCALE_META_V1", true);
}

function isUiLangSourceResolverV1Enabled(): boolean {
  return envFlagEnabled("UI_LANG_SOURCE_RESOLVER_V1", true);
}

function isUiStrictNonEnPendingV1Enabled(): boolean {
  return envFlagEnabled("UI_STRICT_NON_EN_PENDING_V1", true);
}

function isUiStep0LangResetGuardV1Enabled(): boolean {
  return envFlagEnabled("UI_STEP0_LANG_RESET_GUARD_V1", true);
}

function isUiBootstrapStateV1Enabled(): boolean {
  return true;
}

function isUiPendingNoFallbackTextV1Enabled(): boolean {
  return envFlagEnabled("UI_PENDING_NO_FALLBACK_TEXT_V1", true);
}

function isUiStartTriggerLangResolveV1Enabled(): boolean {
  return envFlagEnabled("UI_START_TRIGGER_LANG_RESOLVE_V1", true);
}

function isUiLocaleReadyGateV1Enabled(): boolean {
  return true;
}

function isUiNoPendingTextSuppressV1Enabled(): boolean {
  return envFlagEnabled("UI_NO_PENDING_TEXT_SUPPRESS_V1", true);
}

function isUiBootstrapWaitRetryV1Enabled(): boolean {
  return envFlagEnabled("UI_BOOTSTRAP_WAIT_RETRY_V1", true);
}

function isUiBootstrapEventParityV1Enabled(): boolean {
  return envFlagEnabled("UI_BOOTSTRAP_EVENT_PARITY_V1", true);
}

function isUiBootstrapPollActionV1Enabled(): boolean {
  return true;
}

function isUiWaitShellV2Enabled(): boolean {
  return envFlagEnabled("UI_WAIT_SHELL_V2", true);
}

function isUiTranslationFastModelV1Enabled(): boolean {
  return envFlagEnabled("UI_TRANSLATION_FAST_MODEL_V1", true);
}

function isUiI18nCriticalKeysV1Enabled(): boolean {
  return envFlagEnabled("UI_I18N_CRITICAL_KEYS_V1", true);
}

function isWordingPanelCleanBodyV1Enabled(): boolean {
  return envFlagEnabled("UI_WORDING_PANEL_CLEAN_BODY_V1", true);
}

function isUiSemanticInvariantsV1Enabled(): boolean {
  return envFlagEnabled("UI_SEMANTIC_INVARIANTS_V1", true);
}

function isUiWordingFeedbackKeyedV1Enabled(): boolean {
  return envFlagEnabled("UI_WORDING_FEEDBACK_KEYED_V1", true);
}

function isUiStateHygieneSwitchV1Enabled(): boolean {
  return envFlagEnabled("UI_STATE_HYGIENE_SWITCH_V1", true);
}

const runStepI18nRuntime = createRunStepI18nRuntimeHelpers({
  step0Id: STEP_0_ID,
  isForceEnglishLanguageMode,
  isUiLocaleReadyGateV1Enabled,
  isUiBootstrapPollActionV1Enabled,
  isUiNoPendingTextSuppressV1Enabled,
  isUiPendingNoFallbackTextV1Enabled,
  isUiLocaleMetaV1Enabled,
  isUiLangSourceResolverV1Enabled,
});

const {
  normalizeLangCode,
  normalizeLocaleHint,
  isInteractiveLocaleReady,
  deriveBootstrapContract,
  shouldSuppressFallbackText,
  normalizeLanguageSource,
  bumpUiI18nCounter,
  ensureUiStringsForState,
  resolveLanguageForTurn,
  langFromState,
} = runStepI18nRuntime;

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
  strategy: ["strategy"],
  targetgroup: ["target group"],
  productsservices: ["products and services", "products & services"],
  rulesofthegame: ["rules of the game"],
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

function step0ReadyActionLabel(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  const key = labelKeyForMenuAction("STEP0_MENU_READY_START", "ACTION_STEP0_READY_START", 0);
  const fallback = String(MENU_LABEL_DEFAULTS[key] || "Yes, I'm ready. Let's start!").trim();
  return uiStringFromStateMap(state, key, fallback);
}

function step0ReadinessStatement(state: CanvasState | null | undefined, parsed: { venture: string; name: string; status: string }): string {
  if (shouldSuppressFallbackText(state)) return "";
  const venture = String(parsed.venture || "venture").trim();
  const name = String(parsed.name || "TBD").trim();
  const existingTemplate = uiStringFromStateMap(
    state,
    "step0.readiness.statement.existing",
    uiDefaultString("step0.readiness.statement.existing", "You have a {0} called {1}.")
  );
  const startingTemplate = uiStringFromStateMap(
    state,
    "step0.readiness.statement.starting",
    uiDefaultString("step0.readiness.statement.starting", "You want to start a {0} called {1}.")
  );
  const template = String(parsed.status || "").toLowerCase() === "existing" ? existingTemplate : startingTemplate;
  return formatIndexedTemplate(template, [venture, name]).trim();
}

function step0ReadinessQuestion(state: CanvasState | null | undefined, parsed: { venture: string; name: string; status: string }): string {
  if (shouldSuppressFallbackText(state)) return "";
  const readyLabel = step0ReadyActionLabel(state);
  const suffix = uiStringFromStateMap(
    state,
    "step0.readiness.suffix",
    uiDefaultString("step0.readiness.suffix", "Are you ready to start with the first step: the Dream?")
  );
  const statement = step0ReadinessStatement(state, parsed);
  if (!readyLabel || !statement || !suffix) return "";
  return `1) ${readyLabel}\n\n${statement} ${suffix}`.trim();
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

function headingLabelsForState(state: CanvasState): Record<string, string> {
  return {
    PURPOSEH: uiStringFromStateMap(state, "ppt.heading.purpose", uiDefaultString("ppt.heading.purpose", "Purpose")),
    ROLEH: uiStringFromStateMap(state, "ppt.heading.role", uiDefaultString("ppt.heading.role", "Role")),
    STRATEGYH: uiStringFromStateMap(state, "ppt.heading.strategy", uiDefaultString("ppt.heading.strategy", "Strategy")),
    ENTITYH: uiStringFromStateMap(state, "ppt.heading.entity", uiDefaultString("ppt.heading.entity", "Entity")),
    DREAMH: uiStringFromStateMap(state, "ppt.heading.dream", uiDefaultString("ppt.heading.dream", "Dream")),
    TARGET_GROUPH: uiStringFromStateMap(state, "ppt.heading.targetgroup", uiDefaultString("ppt.heading.targetgroup", "Target Group")),
    PRODUCTS_SERVICESH: uiStringFromStateMap(
      state,
      "ppt.heading.productsservices",
      uiDefaultString("ppt.heading.productsservices", "Products and Services")
    ),
    RULES_OF_THE_GAMEH: uiStringFromStateMap(
      state,
      "ppt.heading.rulesofthegame",
      uiDefaultString("ppt.heading.rulesofthegame", "Rules of the Game")
    ),
  };
}

function generatePresentationPptx(state: CanvasState): { fileName: string; filePath: string } {
  const templatePath = getPresentationTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error("Presentation template not found");
  }

  const step0Final = String((state as any).step_0_final ?? "").trim();
  const fallbackName = String((state as any).business_name ?? "").trim();
  const { name } = parseStep0Final(step0Final, fallbackName);

  const labels = headingLabelsForState(state);

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
export function buildTextForWidget(params: {
  specialist: any;
  hasWidgetActions?: boolean;
  questionTextOverride?: string;
}): string {
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
  const contractId = String((specialist as any)?.ui_contract_id || "").trim();
  const contractStepId = contractId.split(":")[0] || "";
  const menuId = parseMenuFromContractIdForStep(contractId, contractStepId).toUpperCase();
  const statementLines = Array.isArray(specialist?.statements)
    ? (specialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const dreamBuilderRenderContext =
    statementLines.length > 0 &&
    contractStepId === DREAM_STEP_ID &&
    (
      String(specialist?.suggest_dreambuilder || "").trim() === "true" ||
      menuId.startsWith("DREAM_EXPLAINER_MENU_")
    );

  let msg = String(specialist?.message ?? "").trim();
  if (dreamBuilderRenderContext && msg) {
    const statementKeys = new Set(
      statementLines
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
  if (wordingPending && isWordingPanelCleanBodyV1Enabled()) {
    msg = compactWordingPanelBody(msg);
  }
  const promptFromSpecialist = String(specialist?.question ?? "").trim();
  const promptOverride = String(params.questionTextOverride || "").trim();
  const prompt = promptOverride || promptFromSpecialist;
  let refined = String(specialist?.refined_formulation ?? "").trim();
  if (!wordingPending) {
    const field = fieldForStep(contractStepId);
    const fieldValue = field ? String((specialist as any)?.[field] || "").trim() : "";
    if (!fieldValue && !refined && statementLines.length === 0) {
      msg = stripUnsupportedReformulationClaims(msg);
    }
  }
  if (msg) msg = stripChoiceInstructionNoise(msg);
  if (msg && prompt) msg = stripPromptEchoFromMessage(msg, prompt);
  if (refined) {
    refined = stripChoiceInstructionNoise(refined);
    if (prompt) refined = stripPromptEchoFromMessage(refined, prompt);
  }
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
    /^.+\s+or\s+choose\s+an?\s+option(s)?(\s+below)?\.?$/i,
    /^.+\s+or\s+choose\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
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
  const transformed = lines.map((line) => {
    const normalized = String(line || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (fullLineChoicePatterns.some((pattern) => pattern.test(normalized))) return null;
    if (/\bor\s+choose\s+an?\s+option(s)?(\s+below)?\.?$/i.test(normalized)) return null;
    if (/\bor\s+choose\s+one\s+of\s+the\s+options(\s+below)?\.?$/i.test(normalized)) return null;
    let candidate = String(line || "");
    for (const pattern of inlineNoisePatterns) {
      candidate = candidate.replace(pattern, "");
    }
    return candidate
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  });
  const kept: string[] = [];
  for (const line of transformed) {
    if (line === null) continue;
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      if (kept.length === 0) continue;
      if (kept[kept.length - 1] === "") continue;
      kept.push("");
      continue;
    }
    kept.push(trimmed);
  }
  while (kept.length > 0 && kept[0] === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripPromptEchoFromMessage(messageRaw: string, promptRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n");
  const prompt = String(promptRaw || "").replace(/\r/g, "\n");
  if (!message.trim() || !prompt.trim()) return message.trim();

  const normalizeComparableLine = (lineRaw: string): string => {
    const plain = String(lineRaw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return canonicalizeComparableText(plain);
  };

  const optionLabels = new Set<string>();
  const promptLines = prompt
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  for (const line of promptLines) {
    const numbered = line.match(/^[1-9][\)\.]\s*(.+)$/);
    if (!numbered) continue;
    const label = normalizeComparableLine(String(numbered[1] || ""));
    if (label) optionLabels.add(label);
  }

  const promptTextLines = new Set<string>(
    promptLines
      .filter((line) => !/^[1-9][\)\.]\s*/.test(line))
      .map((line) => normalizeComparableLine(line))
      .filter(Boolean)
  );

  const stripped = message
    .split("\n")
    .map((line) => String(line || ""))
    .filter((lineRaw) => {
      const line = String(lineRaw || "").trim();
      if (!line) return true;
      const plainLine = String(lineRaw || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[*_`~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const withoutNumbering = plainLine.replace(/^[1-9][\)\.]\s*/, "").trim();
      const normalized = normalizeComparableLine(withoutNumbering);
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

function labelsForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
  const safeMenuId = String(menuId || "").trim();
  const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  if (!safeMenuId || safeActionCodes.length === 0) return [];
  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
    ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const fullLabelKeys = labelKeysForMenuActionCodes(safeMenuId, fullActionCodes);
  if (fullActionCodes.length === 0 || fullLabelKeys.length !== fullActionCodes.length) return [];
  const usedIndices = new Set<number>();
  const filteredLabels: string[] = [];
  for (const actionCode of safeActionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (fullActionCodes[i] !== actionCode) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
    const label = String(MENU_LABEL_DEFAULTS[labelKey] || "").trim();
    if (!label) return [];
    filteredLabels.push(label);
  }
  return filteredLabels;
}

function uiStringFromStateMap(
  state: CanvasState | null | undefined,
  key: string,
  fallback: string
): string {
  const map = state && typeof (state as any).ui_strings === "object"
    ? ((state as any).ui_strings as Record<string, unknown>)
    : null;
  if (map) {
    const candidate = String(map[key] || "").trim();
    if (candidate) return candidate;
  }
  if (shouldSuppressFallbackText(state)) return "";
  return String(fallback || "").trim();
}

function labelKeysForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
  const safeMenuId = String(menuId || "").trim();
  const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  if (!safeMenuId || safeActionCodes.length === 0) return [];
  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
    ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const fullLabelKeys = Array.isArray(MENU_LABEL_KEYS[safeMenuId])
    ? MENU_LABEL_KEYS[safeMenuId].map((labelKey) => String(labelKey || "").trim())
    : [];
  if (fullActionCodes.length === 0) return [];
  if (fullActionCodes.length !== fullLabelKeys.length) {
    return safeActionCodes.map((actionCode, idx) => labelKeyForMenuAction(safeMenuId, actionCode, idx));
  }
  const usedIndices = new Set<number>();
  const filteredLabelKeys: string[] = [];
  for (const actionCode of safeActionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (fullActionCodes[i] !== actionCode) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
    if (!labelKey) return [];
    filteredLabelKeys.push(labelKey);
  }
  return filteredLabelKeys;
}

function stripNumberedOptions(prompt: string): string {
  const kept = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s+/.test(line));
  return kept.join("\n").trim();
}

function buildRenderedActionsFromMenu(
  menuId: string,
  actionCodes: string[],
  stateForLabels?: CanvasState | null
): RenderedAction[] {
  const safeCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  const labels = labelsForMenuActionCodes(menuId, safeCodes);
  const labelKeys = labelKeysForMenuActionCodes(menuId, safeCodes);
  if (!safeCodes.length || labels.length !== safeCodes.length || labelKeys.length !== safeCodes.length) return [];
  return safeCodes.map((actionCode, idx) => {
    const entry = ACTIONCODE_REGISTRY.actions[actionCode];
    const route = String(entry?.route || actionCode).trim();
    const labelKey = labelKeys[idx] || labelKeyForMenuAction(menuId, actionCode, idx);
    const label = uiStringFromStateMap(stateForLabels || null, labelKey, labels[idx]);
    return {
      id: `${actionCode}:${idx + 1}`,
      label,
      label_key: labelKey,
      action_code: actionCode,
      intent: actionCodeToIntent({ actionCode, route }),
      primary: idx === 0,
    };
  });
}

function buildQuestionTextFromActions(prompt: string): string {
  return stripNumberedOptions(prompt) || String(prompt || "").trim();
}

type PromptInvariantContext = {
  stepId: string;
  status: TurnOutputStatus;
  specialist: Record<string, unknown>;
  state: CanvasState;
};

function promptFallbackForInteractiveAsk(state: CanvasState, stepId: string): string {
  if (stepId === STEP_0_ID) {
    return step0QuestionForState(state);
  }
  return uiStringFromStateMap(
    state,
    "invariant.prompt.ask.default",
    uiDefaultString("invariant.prompt.ask.default", "Share your thoughts or choose an option.")
  );
}

function enforcePromptInvariants(context: PromptInvariantContext): Record<string, unknown> {
  if (!isUiSemanticInvariantsV1Enabled()) return context.specialist;
  const stepId = String(context.stepId || "").trim();
  const status = context.status;
  const specialist = context.specialist || {};
  const action = String((specialist as any).action || "").trim().toUpperCase();
  if (action !== "ASK") return specialist;
  const interactiveAsk = status === "no_output" || status === "incomplete_output";
  if (!interactiveAsk) return specialist;

  const currentQuestion = String((specialist as any).question || "").trim();
  const currentMessage = String((specialist as any).message || "").trim();
  const wordingPending = String((specialist as any).wording_choice_pending || "").trim() === "true";
  const next = { ...specialist };
  if (!currentQuestion) {
    (next as any).question = promptFallbackForInteractiveAsk(context.state, stepId);
  }
  if (wordingPending && !currentMessage) {
    (next as any).message = uiStringFromStateMap(
      context.state,
      "wording.choice.context.default",
      uiDefaultString("wording.choice.context.default", "Please choose the wording that fits best.")
    );
  }
  return next;
}

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

function hasDreamSpecialistCandidate(result: any): boolean {
  const dreamValue = String(result?.dream || "").trim();
  const refinedValue = String(result?.refined_formulation || "").trim();
  return Boolean(dreamValue || refinedValue);
}

function strategyStatementsForConsolidateGuard(result: any, state: CanvasState): string[] {
  const direct = Array.isArray(result?.statements)
    ? (result.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (direct.length > 0) return direct;
  const rawCombined = String(result?.strategy || result?.refined_formulation || "").trim();
  if (rawCombined) return parseListItems(rawCombined).map((line) => String(line || "").trim()).filter(Boolean);
  const fallback = String((state as any).strategy_final || provisionalValueForStep(state, STRATEGY_STEP_ID) || "").trim();
  return parseListItems(fallback).map((line) => String(line || "").trim()).filter(Boolean);
}

function fallbackDreamCandidateFromUserInput(userInput: string, state: CanvasState): string {
  const raw = String(userInput || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  const fallbackCompany = String((state as any)?.business_name || "").trim();
  const company = fallbackCompany && fallbackCompany !== "TBD" ? fallbackCompany : "The business";
  if (!raw) {
    return `${company} dreams of a world in which people experience more meaning and long-term value.`;
  }
  const trimmed = raw.replace(/[.!?]+$/g, "").trim();
  if (/dreams of a world in which/i.test(trimmed)) return ensureSentenceEnd(trimmed);
  const normalizedRest = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return `${company} dreams of a world in which ${normalizedRest}.`;
}

function buildDreamRefineFallbackSpecialist(base: any, userInput: string, state: CanvasState): any {
  const fallback = fallbackDreamCandidateFromUserInput(userInput, state);
  return {
    ...(base && typeof base === "object" ? base : {}),
    action: "REFINE",
    message: "",
    question: "",
    refined_formulation: fallback,
    dream: "",
    suggest_dreambuilder: "false",
    wants_recap: false,
    is_offtopic: false,
    user_intent: "STEP_INPUT",
    meta_topic: "NONE",
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

type UiViewVariant =
  | "default"
  | "wording_choice"
  | "dream_builder_collect"
  | "dream_builder_scoring"
  | "dream_builder_refine";

type UiViewModeRoute =
  | "waiting_locale"
  | "prestart"
  | "interactive"
  | "recovery"
  | "blocked"
  | "failed";

type UiViewPayload = {
  mode: UiViewModeRoute;
  waiting_locale: boolean;
  variant?: Exclude<UiViewVariant, "default">;
};

function deriveUiViewPayload(
  state: CanvasState | null | undefined,
  variant: UiViewVariant
): UiViewPayload | null {
  if (!state || typeof state !== "object") return null;
  const gateStatus = String((state as any).ui_gate_status || "").trim().toLowerCase();
  const phase = String((state as any).bootstrap_phase || "").trim().toLowerCase();
  const currentStep = String((state as any).current_step || "step_0").trim() || "step_0";
  const started = String((state as any).started || "").trim().toLowerCase() === "true";
  let mode: UiViewModeRoute = "interactive";
  if (gateStatus === "waiting_locale" || phase === "waiting_locale") mode = "waiting_locale";
  else if (gateStatus === "blocked") mode = "blocked";
  else if (gateStatus === "failed" || phase === "failed") mode = "failed";
  else if (phase === "recovery") mode = "recovery";
  else if (currentStep === "step_0" && !started) mode = "prestart";
  return {
    mode,
    waiting_locale: mode === "waiting_locale",
    ...(variant !== "default" ? { variant } : {}),
  };
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

function enforceDreamBuilderQuestionProgress(
  specialistResult: any,
  params: {
    currentStepId: string;
    activeSpecialist: string;
    canonicalStatementCount: number;
    wordingChoicePending: boolean;
    state: CanvasState;
  }
): any {
  const currentStepId = String(params.currentStepId || "").trim();
  const activeSpecialist = String(params.activeSpecialist || "").trim();
  if (currentStepId !== DREAM_STEP_ID || activeSpecialist !== DREAM_EXPLAINER_SPECIALIST) {
    return specialistResult;
  }
  const specialist = specialistResult && typeof specialistResult === "object" ? specialistResult : {};
  const isOfftopic =
    specialist.is_offtopic === true ||
    String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
  if (isOfftopic) return specialist;
  const scoringPhase = String(specialist.scoring_phase || "").trim() === "true";
  if (scoringPhase) return specialist;

  const currentQuestion = String(specialist.question || "").trim();
  if (!currentQuestion) return specialist;

  const specialistStatementsCount = Array.isArray(specialist.statements)
    ? (specialist.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
    : 0;
  const hasCollectedInput =
    params.canonicalStatementCount > 0 ||
    specialistStatementsCount > 0 ||
    params.wordingChoicePending ||
    String(specialist.wording_choice_pending || "").trim() === "true";
  if (!hasCollectedInput) return specialist;

  const stage = String((params.state as any).__dream_builder_prompt_stage || "").trim();
  if (stage === "more") return specialist;
  const nextQuestion = uiStringFromStateMap(
    params.state,
    "dreamBuilder.question.more",
    uiDefaultString(
      "dreamBuilder.question.more",
      "What more do you see changing in the future, positive or negative? Let your imagination run free."
    )
  );
  if (!nextQuestion || nextQuestion === currentQuestion) return specialist;
  (params.state as any).__dream_builder_prompt_stage = "more";
  return {
    ...specialist,
    question: nextQuestion,
  };
}

export function isMetaOfftopicFallbackTurn(params: {
  stepId: string;
  userMessage: string;
  specialistResult: any;
}): boolean {
  void params.userMessage;
  const stepId = String(params.stepId || "").trim();
  if (!stepId || stepId === STEP_0_ID) return false;
  const specialist = params.specialistResult && typeof params.specialistResult === "object"
    ? params.specialistResult
    : {};
  const offTopicFlag = specialist.is_offtopic === true || String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
  if (offTopicFlag) return false;

  const userIntent = resolveMotivationUserIntent(specialist);
  if (
    userIntent === "META_QUESTION" ||
    userIntent === "RECAP_REQUEST" ||
    userIntent === "WHY_NEEDED" ||
    userIntent === "RESISTANCE"
  ) {
    return true;
  }
  const metaTopic = resolveSpecialistMetaTopic(specialist);
  return metaTopic !== "NONE";
}

function compactWordingPanelBody(messageRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
  if (!message) return "";
  const lines = message
    .split("\n")
    .map((line) => String(line || "").replace(/<[^>]+>/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^\s*(?:[-*•]|\d+[\).])\s+/.test(line))
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (!normalized) return false;
      if (normalized.includes("this is your input")) return false;
      if (normalized.includes("this would be my suggestion")) return false;
      if (normalized.includes("if you meant something different")) return false;
      if (/\b(i['’]?ve|i have)\s+(reformulat\w*|rewritten|broadened|converted)\b/i.test(normalized)) return false;
      if (/^statement\s*\d+\s*:/i.test(normalized)) return false;
      if (/^statements?\s+\d+\s*(?:to|-)\s*\d+/i.test(normalized)) return false;
      return true;
    });
  if (lines.length === 0) return "";
  const firstLine = String(lines[0] || "").trim();
  if (!firstLine) return "";
  const firstSentence = firstLine
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || "";
  return ensureSentenceEnd(firstSentence || firstLine);
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

function normalizedProvisionalSourceByStep(state: any): Record<string, ProvisionalSource> {
  const raw =
    state && typeof state.provisional_source_by_step === "object" && state.provisional_source_by_step !== null
      ? (state.provisional_source_by_step as Record<string, unknown>)
      : {};
  const next: Record<string, ProvisionalSource> = {};
  for (const [stepIdRaw, sourceRaw] of Object.entries(raw)) {
    const stepId = String(stepIdRaw || "").trim();
    if (!stepId) continue;
    const source = String(sourceRaw || "").trim();
    if (
      source === "user_input" ||
      source === "wording_pick" ||
      source === "action_route" ||
      source === "system_generated"
    ) {
      next[stepId] = source;
    }
  }
  return next;
}

function provisionalSourceForStep(state: any, stepId: string): ProvisionalSource {
  if (!stepId) return "system_generated";
  const map = normalizedProvisionalSourceByStep(state);
  const source = String(map[stepId] || "").trim();
  if (
    source === "user_input" ||
    source === "wording_pick" ||
    source === "action_route" ||
    source === "system_generated"
  ) {
    return source;
  }
  return "system_generated";
}

function withProvisionalValue(
  state: CanvasState,
  stepId: string,
  value: string,
  source: ProvisionalSource
): CanvasState {
  if (!stepId) return state;
  const map = normalizedProvisionalByStep(state);
  const sourceMap = normalizedProvisionalSourceByStep(state);
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    delete map[stepId];
    delete sourceMap[stepId];
  } else {
    map[stepId] = trimmed;
    sourceMap[stepId] = source;
  }
  return {
    ...state,
    provisional_by_step: map,
    provisional_source_by_step: sourceMap,
  };
}

function clearProvisionalValue(state: CanvasState, stepId: string): CanvasState {
  return withProvisionalValue(state, stepId, "", "system_generated");
}

function clearStepInteractiveState(state: CanvasState, stepId: string): CanvasState {
  if (!stepId) return state;
  let next = clearProvisionalValue(state, stepId);
  const last =
    (next as any).last_specialist_result && typeof (next as any).last_specialist_result === "object"
      ? { ...((next as any).last_specialist_result as Record<string, unknown>) }
      : null;
  if (!last) return next;
  const targetField = String((last as any).wording_choice_target_field || "").trim();
  const currentStep = String((next as any).current_step || "").trim();
  const shouldResetWordingState =
    targetField === stepId ||
    (targetField === "" && currentStep === stepId) ||
    String((last as any).wording_choice_pending || "").trim() === "true";
  if (!shouldResetWordingState) return next;
  const resetLast = {
    ...last,
    wording_choice_pending: "false",
    wording_choice_selected: "",
    wording_choice_user_raw: "",
    wording_choice_user_normalized: "",
    wording_choice_user_items: [],
    wording_choice_suggestion_items: [],
    wording_choice_base_items: [],
    wording_choice_agent_current: "",
    wording_choice_mode: "",
    wording_choice_target_field: "",
    feedback_reason_key: "",
    feedback_reason_text: "",
  };
  (next as any).last_specialist_result = resetLast;
  return next;
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

const policyMetaHelpers = createRunStepPolicyMetaHelpers({
  fieldForStep,
  wordingStepLabel,
  finalFieldByStepId: FINAL_FIELD_BY_STEP_ID,
  provisionalValueForStep,
  parseStep0Final,
  stripChoiceInstructionNoise,
  uiDefaultString,
  uiStringFromStateMap,
});

const {
  resolveMotivationUserIntent,
  resolveSpecialistMetaTopic,
  buildBenProfileMessage,
  applyMotivationQuotesContractV11,
  applyCentralMetaTopicRouter,
  normalizeNonStep0OfftopicSpecialist,
  validateNonStep0OfftopicMessageShape,
} = policyMetaHelpers;

export {
  applyMotivationQuotesContractV11,
  applyCentralMetaTopicRouter,
  normalizeNonStep0OfftopicSpecialist,
};

const step0DisplayHelpers = createRunStepStep0DisplayHelpers({
  step0Id: STEP_0_ID,
  resolveSpecialistMetaTopic,
  buildBenProfileMessage,
  step0ReadinessQuestion,
  step0CardDescForState,
  step0QuestionForState,
  stripChoiceInstructionNoise,
});

export const normalizeStep0AskDisplayContract = step0DisplayHelpers.normalizeStep0AskDisplayContract;
export const normalizeStep0OfftopicToAsk = step0DisplayHelpers.normalizeStep0OfftopicToAsk;

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

const wordingHeuristicHelpers = createRunStepWordingHeuristicHelpers({
  entityStepId: ENTITY_STEP_ID,
  dreamStepId: DREAM_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  fieldForStep,
  normalizeEntityPhrase,
  ensureSentenceEnd,
});

export const pickDualChoiceSuggestion = wordingHeuristicHelpers.pickDualChoiceSuggestion;
const { pickDreamSuggestionFromPreviousState, pickRoleSuggestionFromPreviousState } = wordingHeuristicHelpers;

const uiPayloadHelpers = createRunStepUiPayloadHelpers({
  shouldLogLocalDevDiagnostics,
  pickPrompt,
  buildTextForWidget,
  deriveBootstrapContract,
  deriveUiViewPayload,
  sanitizeWidgetActionCodes,
  buildRenderedActionsFromMenu,
  buildQuestionTextFromActions,
  sanitizeEscapeInWidget,
  isWidgetSuppressedEscapeMenuId,
  enforcePromptInvariants,
  isUiI18nV2Enabled,
  isMenuLabelKeysV1Enabled,
  isUiI18nV3LangBootstrapEnabled,
  isUiLocaleMetaV1Enabled,
  isUiLangSourceResolverV1Enabled,
  isUiStrictNonEnPendingV1Enabled,
  isUiStep0LangResetGuardV1Enabled,
  isUiBootstrapStateV1Enabled,
  isUiPendingNoFallbackTextV1Enabled,
  isUiStartTriggerLangResolveV1Enabled,
  isUiLocaleReadyGateV1Enabled,
  isUiNoPendingTextSuppressV1Enabled,
  isUiBootstrapWaitRetryV1Enabled,
  isUiBootstrapEventParityV1Enabled,
  isUiBootstrapPollActionV1Enabled,
  isUiWaitShellV2Enabled,
  isUiTranslationFastModelV1Enabled,
  isUiI18nCriticalKeysV1Enabled,
});

const {
  applyUiPhaseByStep,
  setUiRenderModeByStep,
  inferUiRenderModeForStep,
  parseMenuFromContractIdForStep,
  inferCurrentMenuForStep,
  resolveActionCodeTransition,
  labelForActionInMenu,
  attachRegistryPayload,
} = uiPayloadHelpers;

const wordingHelpers = createRunStepWordingHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  normalizeDreamRuntimeMode,
  uiDefaultString,
  uiStringFromStateMap,
  fieldForStep,
  parseListItems,
  splitSentenceItems,
  normalizeListUserInput,
  normalizeLightUserInput,
  canonicalizeComparableText,
  stripChoiceInstructionNoise,
  tokenizeWords,
  isMaterialRewriteCandidate,
  shouldTreatAsStepContributingInput,
  pickDualChoiceSuggestion,
  areEquivalentWordingVariants,
  normalizeEntityPhrase,
  withProvisionalValue,
  renderFreeTextTurnPolicy,
  applyUiPhaseByStep,
  isUiWordingFeedbackKeyedV1Enabled,
  bumpUiI18nCounter: (telemetry, key, amount) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters,
      amount
    ),
  wordingSelectionMessage,
});

const {
  mergeListItems,
  sanitizePendingListMessage,
  copyPendingWordingChoiceState,
  pickWordingAgentBase,
  isRefineAdjustRouteToken,
  isWordingPickRouteToken,
  applyWordingPickSelection,
  buildWordingChoiceFromPendingSpecialist,
} = wordingHelpers;

export const isWordingChoiceEligibleStep = wordingHelpers.isWordingChoiceEligibleStep;
export const isWordingChoiceEligibleContext = wordingHelpers.isWordingChoiceEligibleContext;
export const isListChoiceScope = wordingHelpers.isListChoiceScope;
export const stripUnsupportedReformulationClaims = wordingHelpers.stripUnsupportedReformulationClaims;
export const buildWordingChoiceFromTurn = wordingHelpers.buildWordingChoiceFromTurn;
export {
  isMaterialRewriteCandidate,
  areEquivalentWordingVariants,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
};

export const resolveActionCodeMenuTransition = uiPayloadHelpers.resolveActionCodeMenuTransition;

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
        "<strong>Label:</strong>" on its own line, then convert each numbered line to a bullet line prefixed with "• ".
      - CRITICAL: Each final must be formatted separately. Do NOT combine content from strategy_final, targetgroup_final, productsservices_final, or rulesofthegame_final into one section. Each final has its own label and its own content.
      - After each step, ALWAYS add one blank line (empty line). Skip empty finals.
  Then set question to your normal next question for this step.
- When wants_recap=false: behave as usual.`;

const SPECIALIST_INSTRUCTION_BLOCKS = {
  languageLockInstruction: LANGUAGE_LOCK_INSTRUCTION,
  recapInstruction: RECAP_INSTRUCTION,
  universalMetaOfftopicPolicy: UNIVERSAL_META_OFFTOPIC_POLICY,
  userIntentContractInstruction: USER_INTENT_CONTRACT_INSTRUCTION,
  metaTopicContractInstruction: META_TOPIC_CONTRACT_INSTRUCTION,
  offtopicFlagContractInstruction: OFFTOPIC_FLAG_CONTRACT_INSTRUCTION,
};

const stateUpdateHelpers = createRunStepStateUpdateHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  purposeStepId: PURPOSE_STEP_ID,
  bigwhyStepId: BIGWHY_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  targetgroupStepId: TARGETGROUP_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  presentationStepId: PRESENTATION_STEP_ID,
  dreamSpecialist: DREAM_SPECIALIST,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  withProvisionalValue,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  setDreamRuntimeMode,
  getDreamRuntimeMode,
});

const { applyPostSpecialistStateMutations } = stateUpdateHelpers;
export const applyStateUpdate = stateUpdateHelpers.applyStateUpdate;

const callSpecialistStrict = createCallSpecialistStrict({
  instructionBlocks: SPECIALIST_INSTRUCTION_BLOCKS,
  buildSpecialistContextBlock,
  langFromState,
  getDreamRuntimeMode,
});

const hasUsableSpecialistForRetry = (specialist: any): boolean =>
  hasUsableSpecialistForRetryDispatch(specialist, pickPrompt);

const buildTransientFallbackSpecialist = createBuildTransientFallbackSpecialist({
  step0CardDescForState,
  step0QuestionForState,
  pickPrompt,
  renderFreeTextTurnPolicy,
});

const buildRateLimitErrorPayload = createBuildRateLimitErrorPayload({
  resolveHolisticPolicyFlags,
  buildTransientFallbackSpecialist,
  attachRegistryPayload,
  uiStringFromStateMap,
  uiDefaultString,
});

const buildTimeoutErrorPayload = createBuildTimeoutErrorPayload({
  resolveHolisticPolicyFlags,
  buildTransientFallbackSpecialist,
  attachRegistryPayload,
  uiStringFromStateMap,
  uiDefaultString,
});

const callSpecialistStrictSafeDispatch = createCallSpecialistStrictSafe({
  callSpecialistStrict,
  shouldLogLocalDevDiagnostics,
  buildRateLimitErrorPayload,
  buildTimeoutErrorPayload,
});

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
  const result = await callSpecialistStrictSafeDispatch(params, routing, stateForError);
  if (!result.ok) {
    return { ok: false as const, payload: result.payload as unknown as RunStepError };
  }
  return result;
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
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
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
  const ingressParsed = parseRunStepIngressArgs(rawArgs, { defaultStepId: STEP_0_ID });
  const incomingLanguageSourceRaw = ingressParsed.incomingLanguageSourceRaw;
  if (!ingressParsed.ok) {
    return {
      ok: false,
      tool: "run_step",
      current_step_id: ingressParsed.currentStep,
      active_specialist: String((ingressParsed.blockedState as any).active_specialist || ""),
      text: "",
      prompt: "",
      specialist: {},
      registry_version: ACTIONCODE_REGISTRY.version,
      state: ingressParsed.blockedState,
      error: {
        type: "invalid_state",
        message: "Input validation error for run_step.",
        required_action: "restart_session",
        details: ingressParsed.issues,
      },
    };
  }
  const args: RunStepArgs = ingressParsed.args;
  const inputMode = args.input_mode || "chat";
  const localeHint = normalizeLocaleHint(String(args.locale_hint ?? ""));
  const localeHintSourceRaw = String(args.locale_hint_source ?? "none").trim();
  const localeHintSource =
  localeHintSourceRaw === "openai_locale" ||
  localeHintSourceRaw === "webplus_i18n" ||
  localeHintSourceRaw === "request_header" ||
  localeHintSourceRaw === "message_detect"
    ? localeHintSourceRaw
    : "none";
  const policyFlags = resolveHolisticPolicyFlags();
  const wordingChoiceEnabled = policyFlags.wordingChoiceV2;
  const motivationQuotesEnabled = policyFlags.motivationQuotesV11;
  if (process.env.ACTIONCODE_LOG_INPUT_MODE === "1") {
    const incomingLanguageSourceNormalized = normalizeStateLanguageSource((args.state as any)?.language_source);
    console.log("[run_step] input_mode", {
      inputMode,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      incoming_language_source_raw: incomingLanguageSourceRaw,
      incoming_language_source_normalized: incomingLanguageSourceNormalized,
    });
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
  const uiI18nTelemetry: UiI18nTelemetryCounters = {
    legacy_i18n_migration_count: 0,
    ui_strings_missing_keys: 0,
    translation_fallbacks: 0,
    translation_missing_keys: 0,
    translation_html_violations: 0,
    locale_hint_used_count: 0,
    locale_hint_missing_count: 0,
    language_source_overridden_count: 0,
    ui_strings_pending_count: 0,
    parity_errors: 0,
    parity_recovered: 0,
    confirm_gate_blocked_count: 0,
    step0_escape_ready_recovered_count: 0,
    wording_body_sanitized_count: 0,
    semantic_prompt_missing_count: 0,
    semantic_confirm_blocked_count: 0,
    state_hygiene_resets_count: 0,
    wording_feedback_fallback_count: 0,
  };
  let migrationApplied = false;
  let migrationFromVersion = "";
  let blockingMarkerClass = "none";

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
  const isBootstrapPollMarker =
    String((rawState as any).__bootstrap_poll || "").trim().toLowerCase() === "true";
  const isBootstrapPollAction =
    String(args.user_message ?? "").trim().toUpperCase() === ACTION_BOOTSTRAP_POLL_TOKEN;
  const isBootstrapPollCall = isBootstrapPollMarker || isBootstrapPollAction;

  const rawStateContractMarkers = detectInvalidContractStateMarkers((args.state ?? {}) as Record<string, unknown>);
  let state = normalizeState(args.state ?? {});
  const preMigrateStateVersion = String((state as any).state_version || "").trim();
  if (preMigrateStateVersion && preMigrateStateVersion !== CURRENT_STATE_VERSION) {
    migrationFromVersion = preMigrateStateVersion;
  }
  try {
    state = migrateState(state);
    if (migrationFromVersion && String((state as any).state_version || "") === CURRENT_STATE_VERSION) {
      migrationApplied = true;
    }
  } catch {
    if (!migrationFromVersion) {
      migrationFromVersion = preMigrateStateVersion || "";
    }
  }
  const incomingLanguageSource = normalizeStateLanguageSource((rawState as any).language_source);
  if (incomingLanguageSource && !normalizeStateLanguageSource((state as any).language_source)) {
    // Keep caller-provided language source when legacy migration versions dropped it.
    (state as any).language_source = incomingLanguageSource;
  }
  let rawLegacyMarkers = [
    ...detectLegacySessionMarkers(state),
    ...rawStateContractMarkers,
  ];
  if (migrationApplied) {
    // Accept successfully migrated legacy versions (e.g. "1", "1.0") without forcing restart recovery paths.
    rawLegacyMarkers = rawLegacyMarkers.filter((marker) => marker !== "state_version_mismatch");
  }
  if (migrationFromVersion && !migrationApplied) {
    rawLegacyMarkers.push("state_version_mismatch");
  }
  const incomingPhaseRaw =
    rawState && typeof (rawState as any).__ui_phase_by_step === "object" && (rawState as any).__ui_phase_by_step !== null
      ? ((rawState as any).__ui_phase_by_step as Record<string, unknown>)
      : null;
  if (incomingPhaseRaw) {
    const phaseByStep = Object.fromEntries(
      Object.entries(incomingPhaseRaw)
        .map(([stepId, contractId]) => [String(stepId || "").trim(), String(contractId || "").trim()])
        .filter(([stepId, contractId]) => stepId && contractId)
    );
    if (Object.keys(phaseByStep).length > 0) {
      (state as any).__ui_phase_by_step = phaseByStep;
    }
  }
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
  if ((state as any).__bootstrap_poll) {
    delete (state as any).__bootstrap_poll;
  }
  const fromArgs = String(rawState?.initial_user_message ?? "").trim();
  if (fromArgs && !String((state as any).initial_user_message ?? "").trim()) {
    (state as any).initial_user_message = fromArgs;
  }
  if (String(rawState?.started ?? "").trim().toLowerCase() === "true") {
    (state as any).started = "true";
  }
  syncDreamRuntimeMode(state);
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

  const hasRestartLegacyMarkers = rawLegacyMarkers.some((marker) =>
    marker === "state_version_mismatch" || marker.startsWith("legacy_")
  );
  const hasSeedableUserMessageForUpgrade =
    String(userMessageCandidate || "").trim().length > 0 &&
    !/^[0-9]+$/.test(String(userMessageCandidate || "").trim()) &&
    !String(userMessageCandidate || "").trim().startsWith("ACTION_");
  const shouldAutoUpgradeLegacyState =
    !isBootstrapPollCall &&
    hasRestartLegacyMarkers &&
    hasSeedableUserMessageForUpgrade;
  if (shouldAutoUpgradeLegacyState) {
    const preservedHostWidgetSessionId = String((state as any).host_widget_session_id || "").trim();
    const preservedSessionId = String((state as any).__session_id || "").trim();
    const preservedSessionStartedAt = String((state as any).__session_started_at || "").trim();
    const preservedSessionTurnIndex = Number((state as any).__session_turn_index || 0);
    const preservedSessionTurnId = String((state as any).__session_turn_id || "").trim();
    state = normalizeState({});
    if (preservedHostWidgetSessionId) (state as any).host_widget_session_id = preservedHostWidgetSessionId;
    if (preservedSessionId) (state as any).__session_id = preservedSessionId;
    if (preservedSessionStartedAt) (state as any).__session_started_at = preservedSessionStartedAt;
    if (Number.isFinite(preservedSessionTurnIndex) && preservedSessionTurnIndex > 0) {
      (state as any).__session_turn_index = Math.trunc(preservedSessionTurnIndex);
    }
    if (preservedSessionTurnId) (state as any).__session_turn_id = preservedSessionTurnId;
    if (localeHint) {
      (state as any).language = localeHint;
      (state as any).language_source = normalizeStateLanguageSource(
        localeHintSource === "message_detect" ? "message_detect" : "locale_hint"
      );
    }
    (state as any).initial_user_message = String(userMessageCandidate || "").trim();
    rawLegacyMarkers = rawLegacyMarkers.filter((marker) =>
      !(marker === "state_version_mismatch" || marker.startsWith("legacy_"))
    );
    bumpUiI18nCounter(uiI18nTelemetry, "state_hygiene_resets_count");
    console.log("[state_auto_upgrade]", {
      input_mode: inputMode,
      legacy_markers_removed: true,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      current_step: String((state as any).current_step || STEP_0_ID),
    });
  }

  const initialUserMessageForSeed = String((state as any).initial_user_message || "").trim();
  if (initialUserMessageForSeed) {
    const seededState = maybeSeedStep0CandidateFromInitialMessage(state, initialUserMessageForSeed);
    if (seededState !== state) {
      state = seededState;
      console.log("[step0_candidate_seed_from_initial_message]", {
        current_step: String((state as any).current_step || STEP_0_ID),
        business_name: String((state as any).business_name || "").trim(),
      });
    }
  }

  // If user clicks a numbered option button, the UI sends ActionCode (new system) or "1"/"2"/"3" or "choice:X" (old system).
  // Process ActionCode first (new hard-coded system), then fall back to old system for backwards compatibility.
  const lastSpecialistResult = (state as any)?.last_specialist_result;

  let actionCodeRaw = userMessageCandidate.startsWith("ACTION_") ? userMessageCandidate : "";
  const isActionCodeTurnForPolicy = actionCodeRaw !== "" && actionCodeRaw !== "ACTION_TEXT_SUBMIT";
  let userMessage = userMessageCandidate;
  let submittedUserText = "";
  let clickedLabelForNoRepeat = "";
  let clickedActionCodeForNoRepeat = "";
  let languageResolvedThisTurn = false;

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
    const explicitTranslationModel = String(process.env.UI_TRANSLATION_MODEL || "").trim();
    if (explicitTranslationModel) return explicitTranslationModel;
    if (!isUiTranslationFastModelV1Enabled()) return baselineModel;
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
    if (decision.source === "translation_model" && String(decision.model || "").trim()) {
      return String(decision.model || "").trim();
    }
    const candidate = String(decision.candidate_model || "").trim();
    if (decision.applied && candidate) return candidate;
    return "gpt-4o-mini";
  };

  const applyUiClientActionContract = (targetState: CanvasState | null | undefined): void => {
    if (!targetState || typeof targetState !== "object") return;
    const stateRef = targetState as any;
    const currentStep = String(stateRef.current_step || "").trim();
    const activeSpecialist = String(stateRef.active_specialist || "").trim();
    const lastSpecialist =
      stateRef.last_specialist_result && typeof stateRef.last_specialist_result === "object"
        ? (stateRef.last_specialist_result as Record<string, unknown>)
        : {};
    const scoringPhase = String(lastSpecialist.scoring_phase || "").trim().toLowerCase() === "true";
    const dreamRuntimeMode = getDreamRuntimeMode(targetState);
    const textSubmitUsesScores =
      currentStep === DREAM_STEP_ID &&
      activeSpecialist === DREAM_EXPLAINER_SPECIALIST &&
      (dreamRuntimeMode === "builder_scoring" || scoringPhase);
    stateRef.ui_action_start = "ACTION_START";
    stateRef.ui_action_text_submit = textSubmitUsesScores
      ? "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES"
      : "ACTION_TEXT_SUBMIT";
    stateRef.ui_action_text_submit_payload_mode = textSubmitUsesScores ? "scores" : "text";
    stateRef.ui_action_wording_pick_user = "ACTION_WORDING_PICK_USER";
    stateRef.ui_action_wording_pick_suggestion = "ACTION_WORDING_PICK_SUGGESTION";
    stateRef.ui_action_dream_start_exercise = "ACTION_DREAM_INTRO_START_EXERCISE";
    stateRef.ui_action_dream_switch_to_self = "ACTION_DREAM_SWITCH_TO_SELF";
  };

  const { finalizeResponse } = createRunStepResponseHelpers({
    applyUiClientActionContract,
    parseMenuFromContractIdForStep,
    labelKeysForMenuActionCodes,
    onUiParityError: () => bumpUiI18nCounter(uiI18nTelemetry, "parity_errors"),
    attachRegistryPayload: (payload, specialist, flagsOverride) =>
      attachRegistryPayload(payload, specialist, flagsOverride),
    uiI18nTelemetry,
    tokenLoggingEnabled,
    baselineModel,
    getMigrationApplied: () => migrationApplied,
    getMigrationFromVersion: () => migrationFromVersion,
    getBlockingMarkerClass: () => blockingMarkerClass,
    resolveTurnTokenUsage: () => ({
      usage: turnUsageFromAccumulator(llmTurnAccumulator),
      attempts: llmTurnAccumulator.attempts,
      models: [...llmTurnAccumulator.models.values()],
    }),
  });

  const ensureUiStrings = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    return ensureUiStringsForState(targetState, translationModel, uiI18nTelemetry, {
      allowBackgroundFull: isBootstrapPollCall,
    });
  };

  const ensureLanguage = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    const allowBackgroundFull = isBootstrapPollCall || inputMode === "chat";
    if (!isUiI18nV3LangBootstrapEnabled()) {
      return ensureUiStringsForState(targetState, translationModel, uiI18nTelemetry, {
        allowBackgroundFull,
      });
    }
    return resolveLanguageForTurn(
      targetState,
      routeOrText,
      localeHint,
      localeHintSource,
      inputMode,
      translationModel,
      uiI18nTelemetry,
      { allowBackgroundFull }
    );
  };

  const resolveLocaleAndUiStringsReady = async (
    targetState: CanvasState,
    routeOrText: string
  ): Promise<{ state: CanvasState; interactiveReady: boolean }> => {
    const nextState = await ensureLanguage(targetState, routeOrText);
    return {
      state: nextState,
      interactiveReady: isInteractiveLocaleReady(nextState),
    };
  };

  const ensureStartState = async (
    targetState: CanvasState,
    routeOrText: string
  ): Promise<{ state: CanvasState; interactiveReady: boolean }> => {
    const hasResolvedLanguage = Boolean(normalizeLangCode(String((targetState as any).language || "")));
    if (languageResolvedThisTurn && hasResolvedLanguage) {
      return {
        state: targetState,
        interactiveReady: isInteractiveLocaleReady(targetState),
      };
    }
    if (!isUiStartTriggerLangResolveV1Enabled()) {
      const stateWithUi = await ensureUiStrings(targetState, routeOrText);
      return {
        state: stateWithUi,
        interactiveReady: isInteractiveLocaleReady(stateWithUi),
      };
    }
    return resolveLocaleAndUiStringsReady(targetState, routeOrText);
  };

  if (isBootstrapPollCall && isUiLocaleReadyGateV1Enabled()) {
    const languageSeed = String((state as any).initial_user_message || "").trim();
    const localeResolution = await resolveLocaleAndUiStringsReady(state, languageSeed);
    state = localeResolution.state;
    const retrySpecialistSeed = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    const retrySpecialist = hasUsableSpecialistForRetry(retrySpecialistSeed)
      ? retrySpecialistSeed
      : buildTransientFallbackSpecialist(state);
    const retryStepId = String((state as any).current_step || STEP_0_ID);
    const retryActiveSpecialist = String((state as any).active_specialist || "").trim() ||
      (retryStepId === STEP_0_ID ? STEP_0_SPECIALIST : "");
    const retryState = {
      ...(state as any),
      active_specialist: retryActiveSpecialist,
      last_specialist_result: retrySpecialist,
    } as CanvasState;
    const bootstrapContract = deriveBootstrapContract(state);
    if (bootstrapContract.waiting) {
      return finalizeResponse(
        attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String((retryState as any).current_step || STEP_0_ID),
            active_specialist: String((retryState as any).active_specialist || ""),
            text: buildTextForWidget({ specialist: retrySpecialist }),
            prompt: pickPrompt(retrySpecialist),
            specialist: retrySpecialist,
            state: retryState,
          },
          retrySpecialist,
          {
            bootstrap_waiting_locale: bootstrapContract.waiting,
            bootstrap_interactive_ready: bootstrapContract.ready,
            bootstrap_retry_hint: bootstrapContract.retry_hint,
            locale_pending_background: bootstrapContract.waiting,
            bootstrap_phase: String(bootstrapContract.phase || ""),
          }
        )
      );
    }
    actionCodeRaw = "";
    userMessage = "";
    clickedActionCodeForNoRepeat = "";
    clickedLabelForNoRepeat = "";
    (state as any).__last_clicked_action_for_contract = "";
    (state as any).__last_clicked_label_for_contract = "";
  }

  const legacyMarkers = Array.from(
    new Set([
      ...rawLegacyMarkers,
      ...detectLegacySessionMarkers(state),
      ...detectInvalidContractStateMarkers(state as unknown as Record<string, unknown>),
    ])
  );
  if (legacyMarkers.length > 0) {
    const legacySpecialist = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    const requiresRestart = legacyMarkers.some((marker) =>
      marker === "state_version_mismatch" || marker.startsWith("legacy_")
    );
    if (requiresRestart) {
      if (legacyMarkers.some((marker) => marker.startsWith("legacy_"))) {
        blockingMarkerClass = "legacy_marker";
      } else if (legacyMarkers.includes("state_version_mismatch")) {
        blockingMarkerClass = "state_version_mismatch";
      } else {
        blockingMarkerClass = "legacy_other";
      }
    } else {
      blockingMarkerClass = "invalid_state";
    }
    const errorType = requiresRestart ? "session_upgrade_required" : "invalid_state";
    const blockedState = buildFailClosedState(
      state,
      requiresRestart ? "session_upgrade_required" : "invalid_state",
      {
        requestedLang: localeHint || String((state as any).language || ""),
      }
    );
    return finalizeResponse(
      attachRegistryPayload(
        {
          ok: false as const,
          tool: "run_step" as const,
          current_step_id: String(blockedState.current_step),
          active_specialist: String((blockedState as any).active_specialist || ""),
          text: "",
          prompt: "",
          specialist: legacySpecialist,
          state: blockedState,
          error: {
            type: errorType,
            message: requiresRestart
              ? "Legacy session state is blocked in strict contract mode."
              : "Incoming state violates the strict startup/i18n contract.",
            markers: legacyMarkers,
            required_action: "restart_session",
          },
        },
        legacySpecialist,
        {
          bootstrap_waiting_locale: false,
          bootstrap_interactive_ready: false,
          bootstrap_retry_hint: "",
          locale_pending_background: false,
          bootstrap_phase: "failed",
        }
      )
    );
  }

  if (actionCodeRaw) {
    const sourceStep = String(state.current_step || "").trim();
    const menuId = inferCurrentMenuForStep(state, sourceStep);
    if (menuId) {
      const expectedCount = ACTIONCODE_REGISTRY.menus[menuId]?.length;
      console.log("[actioncode_click]", {
        registry_version: ACTIONCODE_REGISTRY.version,
        contract_id: String(((state as any).__ui_phase_by_step || {})[sourceStep] || ""),
        step: sourceStep,
        expected_count: expectedCount,
        action_code: actionCodeRaw,
        input_mode: inputMode,
      });
    }
    const sourceMenu = inferCurrentMenuForStep(state, sourceStep);
    clickedActionCodeForNoRepeat = String(actionCodeRaw || "").trim().toUpperCase();
    clickedLabelForNoRepeat = labelForActionInMenu(sourceMenu, clickedActionCodeForNoRepeat);
    (state as any).__last_clicked_action_for_contract = clickedActionCodeForNoRepeat;
    (state as any).__last_clicked_label_for_contract = clickedLabelForNoRepeat;
  }

  if (actionCodeRaw === "ACTION_TEXT_SUBMIT") {
    const submitted = String(transientTextSubmit ?? "").trim();
    submittedUserText = submitted;
    userMessage = submitted;
    actionCodeRaw = "";
    clickedActionCodeForNoRepeat = "";
    clickedLabelForNoRepeat = "";
    (state as any).__last_clicked_action_for_contract = "";
    (state as any).__last_clicked_label_for_contract = "";
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
    const stateLanguage = normalizeLangCode(String((state as any).language ?? ""));
    const stateLanguageSource = normalizeLanguageSource((state as any).language_source);
    const localeHintTrustedSource =
      localeHintSource === "openai_locale" ||
      localeHintSource === "webplus_i18n" ||
      localeHintSource === "request_header" ||
      localeHintSource === "message_detect";
    const skipResetForChatLocaleHint =
      isUiStep0LangResetGuardV1Enabled() &&
      inputMode === "chat" &&
      Boolean(localeHint) &&
      (localeHintTrustedSource || stateLanguageSource === "locale_hint" || stateLanguage === localeHint);
    if (!hasOverride && !skipResetForChatLocaleHint) {
      (state as any).language = "";
      (state as any).language_locked = "false";
      (state as any).language_override = "false";
      (state as any).language_source = "";
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

  function buildBigWhyTooLongFeedback(stateForText: CanvasState): any {
    const message = uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.message",
      uiDefaultString(
        "bigwhy.tooLong.message",
        "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version."
      )
    );
    const question = uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.question",
      uiDefaultString("bigwhy.tooLong.question", "Can you rewrite it in 28 words or fewer?")
    );
    return {
      action: "REFINE",
      message,
      question,
      refined_formulation: "",
      bigwhy: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
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
    ACTION_STRATEGY_CONFIRM_SATISFIED: TARGETGROUP_STEP_ID,
    ACTION_STRATEGY_FINAL_CONTINUE: TARGETGROUP_STEP_ID,
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
        prev,
        getDreamRuntimeMode(state)
      )
    ) {
      const pendingSpecialist = { ...prev };
      const pendingChoice = buildWordingChoiceFromPendingSpecialist(
        pendingSpecialist,
        String((state as any).active_specialist || ""),
        prev,
        stepId,
        getDreamRuntimeMode(state)
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
        prev,
        getDreamRuntimeMode(state)
      )
    ) {
      state = clearStepInteractiveState(state, stepId);
      bumpUiI18nCounter(uiI18nTelemetry, "state_hygiene_resets_count");
    }
    const finalInfo = requireFinalValue(stepId, prev, state);
    const sourceMenuForTransition = inferCurrentMenuForStep(state, stepId);
    const resolvedTransition = resolveActionCodeTransition(
      actionCodeRaw,
      stepId,
      sourceMenuForTransition
    );
    // If we cannot find a required value, fall back to regular actioncode routing.
    if (finalInfo.field && !finalInfo.value) {
    } else {
      if (finalInfo.field && finalInfo.value) {
        (state as any)[finalInfo.field] = finalInfo.value;
        state = isUiStateHygieneSwitchV1Enabled()
          ? clearStepInteractiveState(state, stepId)
          : clearProvisionalValue(state, stepId);
      }
      const nextStepForProceed = resolvedTransition?.targetStepId || String(ACTIONCODE_STEP_TRANSITIONS[actionCodeRaw] || stepId);
      (state as any).current_step = String(nextStepForProceed || stepId);
      if (resolvedTransition) {
        setUiRenderModeByStep(
          state,
          resolvedTransition.targetStepId,
          resolvedTransition.renderMode
        );
        applyUiPhaseByStep(
          state,
          resolvedTransition.targetStepId,
          buildContractId(
            resolvedTransition.targetStepId,
            "incomplete_output",
            resolvedTransition.renderMode === "no_buttons"
              ? "NO_MENU"
              : resolvedTransition.targetMenuId
          )
        );
      } else {
        setUiRenderModeByStep(state, String((state as any).current_step || stepId), "menu");
      }
      (state as any).active_specialist = "";
      (state as any).last_specialist_result = {};
      if (String((state as any).current_step || "") !== DREAM_STEP_ID) {
        setDreamRuntimeMode(state, "self");
      }
      userMessage = "";
      forcedProceed = true;
    }
  }
  // NEW SYSTEM: Check if message is an ActionCode (starts with "ACTION_")
  if (!forcedProceed && userMessage.startsWith("ACTION_")) {
    const actionCodeInput = userMessage;
    const safeActionCodeInput = String(actionCodeInput || "").trim().toUpperCase();
    const currentStepForMenuTransition = String(state.current_step || "").trim();
    const sourceMenuForTransition = inferCurrentMenuForStep(state, currentStepForMenuTransition);
    const transitionSpec = NEXT_MENU_BY_ACTIONCODE[safeActionCodeInput];
    const resolvedTransition = resolveActionCodeTransition(
      safeActionCodeInput,
      currentStepForMenuTransition,
      sourceMenuForTransition
    );
    if (transitionSpec && !resolvedTransition) {
      const specialistSnapshot = (lastSpecialistResult || {}) as Record<string, unknown>;
      return finalizeResponse(attachRegistryPayload({
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: "",
        prompt: "",
        specialist: specialistSnapshot,
        state,
        error: {
          type: "contract_violation",
          message: "ActionCode transition violates menu contract.",
          reason: "missing_or_invalid_transition_for_actioncode",
          action_code: safeActionCodeInput,
          step: currentStepForMenuTransition,
          source_menu_id: sourceMenuForTransition || "",
        },
      }, specialistSnapshot));
    }
    if (resolvedTransition) {
      setUiRenderModeByStep(
        state,
        resolvedTransition.targetStepId,
        resolvedTransition.renderMode
      );
      applyUiPhaseByStep(
        state,
        resolvedTransition.targetStepId,
        buildContractId(
          resolvedTransition.targetStepId,
          "incomplete_output",
          resolvedTransition.renderMode === "no_buttons"
            ? "NO_MENU"
            : resolvedTransition.targetMenuId
        )
      );
    }
    if (currentStepForMenuTransition === DREAM_STEP_ID) {
      if (DREAM_START_EXERCISE_ACTION_CODES.has(safeActionCodeInput)) {
        setDreamRuntimeMode(state, "builder_collect");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST") {
        setDreamRuntimeMode(state, "builder_refine");
      } else if (safeActionCodeInput === "ACTION_DREAM_SWITCH_TO_SELF") {
        setDreamRuntimeMode(state, "self");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
        setDreamRuntimeMode(state, "builder_scoring");
      }
    }
    const routed = processActionCode(actionCodeInput, state.current_step, state, lastSpecialistResult);
    if (inputMode === "widget" && routed === actionCodeInput) {
      const errorPayload = {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: uiStringFromStateMap(
          state,
          "error.unknownAction",
          uiDefaultString("error.unknownAction", "We could not process this choice. Please refresh and try again.")
        ),
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
      pendingBeforeTurn,
      getDreamRuntimeMode(state)
    ) &&
    !isWordingPickRouteToken(userMessage) &&
    (!isGeneralOfftopicInput || shouldKeepPendingOnOfftopic)
  ) {
    const stateWithUi = await ensureUiStrings(state, userMessage);
    let pendingSpecialist = {
      ...pendingBeforeTurn,
      ...(isGeneralOfftopicInput ? { is_offtopic: true } : {}),
    };
    if (isGeneralOfftopicInput && String(state.current_step || "") !== STEP_0_ID) {
      pendingSpecialist = normalizeNonStep0OfftopicSpecialist({
        stepId: String(state.current_step || ""),
        activeSpecialist: String((state as any).active_specialist || ""),
        userMessage,
        specialistResult: pendingSpecialist,
        previousSpecialist: pendingBeforeTurn,
        state: stateWithUi,
      });
      if (shouldKeepPendingOnOfftopic) {
        pendingSpecialist = copyPendingWordingChoiceState(pendingSpecialist, pendingBeforeTurn);
      }
    }
    const pendingChoice = buildWordingChoiceFromPendingSpecialist(
      pendingSpecialist,
      String((state as any).active_specialist || ""),
      pendingBeforeTurn,
      String(state.current_step || ""),
      getDreamRuntimeMode(state)
    );
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
      telemetry: uiI18nTelemetry,
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
  languageResolvedThisTurn = true;
  const lang = langFromState(state);
  const pipelineHelpers = createRunStepPipelineHelpers<RunStepSuccess | RunStepError>({
    step0Id: STEP_0_ID,
    dreamStepId: DREAM_STEP_ID,
    bigwhyStepId: BIGWHY_STEP_ID,
    strategyStepId: STRATEGY_STEP_ID,
    dreamSpecialist: DREAM_SPECIALIST,
    dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
    strategySpecialist: STRATEGY_SPECIALIST,
    dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
    dreamForceRefineRoutePrefix: DREAM_FORCE_REFINE_ROUTE_PREFIX,
    strategyConsolidateRouteToken: STRATEGY_CONSOLIDATE_ROUTE_TOKEN,
    bigwhyMaxWords: BIGWHY_MAX_WORDS,
    uiContractVersion: UI_CONTRACT_VERSION,
    buildRoutingContext,
    callSpecialistStrictSafe,
    attachRegistryPayload,
    normalizeEntitySpecialistResult,
    applyCentralMetaTopicRouter,
    normalizeNonStep0OfftopicSpecialist,
    normalizeStep0AskDisplayContract,
    hasValidStep0Final,
    applyPostSpecialistStateMutations,
    getDreamRuntimeMode,
    isMetaOfftopicFallbackTurn,
    shouldTreatAsStepContributingInput,
    hasDreamSpecialistCandidate,
    buildDreamRefineFallbackSpecialist,
    strategyStatementsForConsolidateGuard,
    pickBigWhyCandidate,
    countWords,
    buildBigWhyTooLongFeedback,
    renderFreeTextTurnPolicy,
    validateRenderedContractOrRecover,
    applyUiPhaseByStep,
    buildContractId,
    isWordingChoiceEligibleContext,
    buildWordingChoiceFromTurn,
    buildWordingChoiceFromPendingSpecialist,
    enforceDreamBuilderQuestionProgress,
    applyMotivationQuotesContractV11,
    buildTextForWidget,
    pickPrompt,
    looksLikeMetaInstruction,
    bumpUiI18nCounter: (telemetry, key) =>
      bumpUiI18nCounter(
        telemetry as UiI18nTelemetryCounters | null | undefined,
        key as keyof UiI18nTelemetryCounters
      ),
  });

  const routeHelpers = createRunStepRouteHelpers<RunStepSuccess | RunStepError>({
    step0Id: STEP_0_ID,
    step0Specialist: STEP_0_SPECIALIST,
    dreamStepId: DREAM_STEP_ID,
    dreamSpecialist: DREAM_SPECIALIST,
    dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
    roleStepId: ROLE_STEP_ID,
    roleSpecialist: ROLE_SPECIALIST,
    presentationStepId: PRESENTATION_STEP_ID,
    presentationSpecialist: PRESENTATION_SPECIALIST,
    dreamPickOneRouteToken: DREAM_PICK_ONE_ROUTE_TOKEN,
    roleChooseForMeRouteToken: ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN,
    presentationMakeRouteToken: PRESENTATION_MAKE_ROUTE_TOKEN,
    switchToSelfDreamToken: SWITCH_TO_SELF_DREAM_TOKEN,
    dreamStartExerciseRouteToken: DREAM_START_EXERCISE_ROUTE_TOKEN,
    wordingSelectionMessage,
    pickPrompt,
    buildTextForWidget,
    applyStateUpdate,
    setDreamRuntimeMode,
    getDreamRuntimeMode,
    renderFreeTextTurnPolicy,
    validateRenderedContractOrRecover,
    applyUiPhaseByStep,
    ensureUiStrings,
    ensureStartState,
    attachRegistryPayload,
    finalizeResponse,
    pickDreamSuggestionFromPreviousState,
    pickDreamCandidateFromState,
    pickRoleSuggestionFromPreviousState,
    hasPresentationTemplate,
    generatePresentationPptx,
    convertPptxToPdf,
    convertPdfToPng,
    cleanupOldPresentationFiles,
    baseUrlFromEnv,
    uiStringFromStateMap,
    uiDefaultString,
    buildContractId,
    parseStep0Final,
    step0ReadinessQuestion,
    step0CardDescForState,
    step0QuestionForState,
    callSpecialistStrictSafe,
    buildRoutingContext,
    rememberLlmCall,
    isUiStateHygieneSwitchV1Enabled,
    clearStepInteractiveState,
    bumpUiI18nCounter: (telemetry, key) =>
      bumpUiI18nCounter(
        telemetry as UiI18nTelemetryCounters | null | undefined,
        key as keyof UiI18nTelemetryCounters
      ),
  });

  const specialRouteResponse = await routeHelpers.handleSpecialRouteRegistry({
    state,
    userMessage,
    actionCodeRaw,
    responseUiFlags,
    model,
    uiI18nTelemetry,
    transientPendingScores: transientPendingScores as number[][] | null,
    inputMode: inputMode === "widget" ? "widget" : "chat",
    wordingChoiceEnabled,
    languageResolvedThisTurn,
    isBootstrapPollCall,
    lang,
  });
  if (specialRouteResponse) return specialRouteResponse;
  const pipelinePayload = await pipelineHelpers.runPostSpecialistPipeline({
    state,
    userMessage,
    actionCodeRaw,
    responseUiFlags,
    model,
    uiI18nTelemetry,
    inputMode: inputMode === "widget" ? "widget" : "chat",
    wordingChoiceEnabled,
    motivationQuotesEnabled,
    submittedUserText,
    lang,
    rawNormalized,
    pristineAtEntry,
    decideOrchestration,
    ensureUiStrings,
    rememberLlmCall,
  });
  return finalizeResponse(pipelinePayload);
}
