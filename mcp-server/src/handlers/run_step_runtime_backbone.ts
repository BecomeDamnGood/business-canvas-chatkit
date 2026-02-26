import type { LLMUsage } from "../core/llm.js";
import type { CanvasState } from "../core/state.js";

export function shouldLogLocalDevDiagnostics(): boolean {
  return process.env.LOCAL_DEV === "1" || process.env.MENU_POLICY_DEBUG === "1";
}

export type HolisticPolicyFlags = {
  holisticPolicyV2: boolean;
  offtopicV2: boolean;
  bulletRenderV2: boolean;
  wordingChoiceV2: boolean;
  timeoutGuardV2: boolean;
  motivationQuotesV11: boolean;
};

export type CallUsageSnapshot = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  provider_available: boolean;
};

export type TurnLlmAccumulator = {
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

export const WIDGET_ESCAPE_MENU_SUFFIX = "_MENU_ESCAPE";
export const DREAM_EXPLAINER_ESCAPE_MENU_ID = "DREAM_EXPLAINER_MENU_ESCAPE";
export const DREAM_EXPLAINER_SWITCH_SELF_MENU_ID = "DREAM_EXPLAINER_MENU_SWITCH_SELF";
export const DREAM_EXPLAINER_REFINE_MENU_ID = "DREAM_EXPLAINER_MENU_REFINE";

export type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

export const DREAM_START_EXERCISE_ACTION_CODES = new Set<string>([
  "ACTION_DREAM_INTRO_START_EXERCISE",
  "ACTION_DREAM_WHY_START_EXERCISE",
  "ACTION_DREAM_SUGGESTIONS_START_EXERCISE",
  "ACTION_DREAM_REFINE_START_EXERCISE",
]);
export const DREAM_PICK_ONE_ROUTE_TOKEN = "__ROUTE__DREAM_PICK_ONE__";
export const ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN = "__ROUTE__ROLE_CHOOSE_FOR_ME__";
export const DREAM_FORCE_REFINE_ROUTE_PREFIX = "__ROUTE__DREAM_FORCE_REFINE__";
export const STRATEGY_CONSOLIDATE_ROUTE_TOKEN = "__ROUTE__STRATEGY_CONSOLIDATE__";
export const PRESENTATION_MAKE_ROUTE_TOKEN = "__ROUTE__PRESENTATION_MAKE__";
export const SWITCH_TO_SELF_DREAM_TOKEN = "__SWITCH_TO_SELF_DREAM__";
export const DREAM_START_EXERCISE_ROUTE_TOKEN = "__ROUTE__DREAM_START_EXERCISE__";
export const ACTION_BOOTSTRAP_POLL_TOKEN = "ACTION_BOOTSTRAP_POLL";

export const WIDGET_ESCAPE_LABEL_PATTERNS: RegExp[] = [
  /\bfinish\s+later\b/i,
  /\bcontinue\b[^\n\r]{0,80}\bnow\b/i,
];

export function normalizeDreamRuntimeMode(raw: unknown): DreamRuntimeMode {
  const mode = String(raw || "").trim();
  if (mode === "builder_collect" || mode === "builder_scoring" || mode === "builder_refine") return mode;
  return "self";
}

export function setDreamRuntimeMode(state: CanvasState, mode: DreamRuntimeMode): void {
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

export function getDreamRuntimeMode(state: CanvasState): DreamRuntimeMode {
  return normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);
}

export function syncDreamRuntimeMode(params: {
  state: CanvasState;
  dreamStepId: string;
  dreamExplainerSpecialist: string;
  dreamExplainerRefineMenuId: string;
  parseMenuFromContractIdForStep: (contractIdLike: unknown, stepId: string) => string;
}): void {
  const currentStep = String((params.state as any).current_step || "").trim();
  if (currentStep !== params.dreamStepId) {
    setDreamRuntimeMode(params.state, "self");
    return;
  }
  const rawMode = String((params.state as any).__dream_runtime_mode || "").trim();
  if (rawMode) {
    setDreamRuntimeMode(params.state, normalizeDreamRuntimeMode(rawMode));
    return;
  }
  const activeSpecialist = String((params.state as any).active_specialist || "").trim();
  if (activeSpecialist !== params.dreamExplainerSpecialist) {
    setDreamRuntimeMode(params.state, "self");
    return;
  }
  const last = ((params.state as any).last_specialist_result || {}) as Record<string, unknown>;
  const scoringPhase = String((last as any).scoring_phase || "").trim();
  if (scoringPhase === "true") {
    setDreamRuntimeMode(params.state, "builder_scoring");
    return;
  }
  const phaseMap =
    (params.state as any).__ui_phase_by_step && typeof (params.state as any).__ui_phase_by_step === "object"
      ? ((params.state as any).__ui_phase_by_step as Record<string, unknown>)
      : {};
  const menuId = params.parseMenuFromContractIdForStep(phaseMap[params.dreamStepId], params.dreamStepId);
  if (menuId === params.dreamExplainerRefineMenuId) {
    setDreamRuntimeMode(params.state, "builder_refine");
    return;
  }
  setDreamRuntimeMode(params.state, "builder_collect");
}

export function envFlagEnabled(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw);
}

export function resolveHolisticPolicyFlags(): HolisticPolicyFlags {
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

export function createTurnLlmAccumulator(): TurnLlmAccumulator {
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

export function normalizeUsage(usage?: LLMUsage | null): CallUsageSnapshot {
  return {
    input_tokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
    output_tokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    total_tokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
    provider_available: Boolean(usage?.provider_available),
  };
}

export function registerTurnLlmCall(acc: TurnLlmAccumulator, meta: TurnLlmCallMeta): void {
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

export function turnUsageFromAccumulator(acc: TurnLlmAccumulator): CallUsageSnapshot {
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

function languageModeFromEnv(): string {
  return String(process.env.LANGUAGE_MODE || "").trim().toLowerCase();
}

export function isForceEnglishLanguageMode(): boolean {
  const mode = languageModeFromEnv();
  if (mode === "force_en") return true;
  if (mode === "detect_once") return false;
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") return false;
  return process.env.LOCAL_DEV === "1";
}

export function isUiI18nV2Enabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_TEXT_KEYS", envFlagEnabled("UI_I18N_V2", true));
}

export function isMenuLabelKeysV1Enabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_MENU_KEY_ONLY", envFlagEnabled("MENU_LABEL_KEYS_V1", true));
}

export function isUiI18nV3LangBootstrapEnabled(): boolean {
  return envFlagEnabled("UI_I18N_V3_LANG_BOOTSTRAP", true);
}

export function isUiLocaleMetaV1Enabled(): boolean {
  return envFlagEnabled("UI_LOCALE_META_V1", true);
}

export function isUiLangSourceResolverV1Enabled(): boolean {
  return envFlagEnabled("UI_LANG_SOURCE_RESOLVER_V1", true);
}

export function isUiStrictNonEnPendingV1Enabled(): boolean {
  return envFlagEnabled("UI_STRICT_NON_EN_PENDING_V1", true);
}

export function isUiStep0LangResetGuardV1Enabled(): boolean {
  return envFlagEnabled("UI_STEP0_LANG_RESET_GUARD_V1", true);
}

export function isUiBootstrapStateV1Enabled(): boolean {
  return true;
}

export function isUiPendingNoFallbackTextV1Enabled(): boolean {
  return envFlagEnabled("UI_PENDING_NO_FALLBACK_TEXT_V1", true);
}

export function isUiStartTriggerLangResolveV1Enabled(): boolean {
  return envFlagEnabled("UI_START_TRIGGER_LANG_RESOLVE_V1", true);
}

export function isUiLocaleReadyGateV1Enabled(): boolean {
  return true;
}

export function isUiNoPendingTextSuppressV1Enabled(): boolean {
  return envFlagEnabled("UI_NO_PENDING_TEXT_SUPPRESS_V1", true);
}

export function isUiBootstrapWaitRetryV1Enabled(): boolean {
  return envFlagEnabled("UI_BOOTSTRAP_WAIT_RETRY_V1", true);
}

export function isUiBootstrapEventParityV1Enabled(): boolean {
  return envFlagEnabled("UI_BOOTSTRAP_EVENT_PARITY_V1", true);
}

export function isUiBootstrapPollActionV1Enabled(): boolean {
  return true;
}

export function isUiWaitShellV2Enabled(): boolean {
  return envFlagEnabled("UI_WAIT_SHELL_V2", true);
}

export function isUiTranslationFastModelV1Enabled(): boolean {
  return envFlagEnabled("UI_TRANSLATION_FAST_MODEL_V1", true);
}

export function isUiI18nCriticalKeysV1Enabled(): boolean {
  return envFlagEnabled("UI_I18N_CRITICAL_KEYS_V1", true);
}

export function isWordingPanelCleanBodyV1Enabled(): boolean {
  return envFlagEnabled("UI_WORDING_PANEL_CLEAN_BODY_V1", true);
}

export function isUiSemanticInvariantsV1Enabled(): boolean {
  return envFlagEnabled("UI_SEMANTIC_INVARIANTS_V1", true);
}

export function isUiWordingFeedbackKeyedV1Enabled(): boolean {
  return envFlagEnabled("UI_WORDING_FEEDBACK_KEYED_V1", true);
}

export function isUiStateHygieneSwitchV1Enabled(): boolean {
  return envFlagEnabled("UI_STATE_HYGIENE_SWITCH_V1", true);
}
