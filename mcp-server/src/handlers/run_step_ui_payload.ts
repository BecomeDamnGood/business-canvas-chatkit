import { readPendingInteractionState, type CanvasState } from "../core/state.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { ACTION_LABEL_DEFAULTS, ACTION_PRETRANSITION_BY_ACTIONCODE, UI_CONTRACT_VERSION, labelKeyForActionCode } from "../core/ui_contract_matrix.js";
import { parseUiContractStatusForStep } from "../core/ui_contract_id.js";
import { currentTurnSupportMode } from "../core/stuck_support.js";
import { DREAM_STEP_ID } from "../steps/dream.js";
import type { RenderedAction, UiContentPayload } from "../contracts/ui_actions.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import { isSingleValueTextPickerState } from "./run_step_compare_picker_contract.js";
import { readDreamBuilderCompareRuntime } from "./dream_builder_compare_runtime.js";

type CompareMode = "text" | "list";

export type CompareCompareFeedbackUiPayload = {
  text: string;
};

export type CompareUiPayload = {
  enabled: boolean;
  mode: CompareMode;
  compare_feedback?: CompareCompareFeedbackUiPayload;
  feedback_reason_text?: string;
  user_text: string;
  suggestion_text: string;
  user_label?: string;
  suggestion_label?: string;
  user_items: string[];
  suggestion_items: string[];
  instruction: string;
};

export type UiViewVariant =
  | "default"
  | "dream_builder_collect"
  | "dream_builder_scoring"
  | "dream_builder_refine";

export type DreamBuilderBodyMode = "none" | "support_only" | "full_narrative";

type UiViewModeRoute =
  | "prestart"
  | "interactive"
  | "blocked";

export type UiViewPayload = {
  mode?: UiViewModeRoute;
  waiting_locale?: false;
  variant?: Exclude<UiViewVariant, "default">;
  dream_builder_body_mode?: DreamBuilderBodyMode;
  dream_builder_statements_visible?: boolean;
};

type DreamBuilderContractPhase = "collect" | "compare" | "scoring" | "refine";

type DreamBuilderCompareContractPayload = {
  kind: "batch_rewrite_compare" | "overlap_merge_compare";
  rationale?: string;
  current_label?: string;
  suggested_label?: string;
  current_value?: string;
  suggested_value?: string;
  current_items?: string[];
  suggested_items?: string[];
  retained_items?: string[];
};

type DreamBuilderScoringClusterPayload = {
  theme?: string;
  statement_indices: number[];
};

type DreamBuilderScoringContractPayload = {
  clusters: DreamBuilderScoringClusterPayload[];
  scores?: Array<Array<string | number>>;
  submit_enabled?: boolean;
  submit_action?: string;
};

type DreamBuilderContractPayload = {
  version: "2026-03-17.dream_builder_contract.v2";
  phase: DreamBuilderContractPhase;
  statements: string[];
  statements_visible: boolean;
  body_mode?: DreamBuilderBodyMode;
  question?: string;
  compare?: DreamBuilderCompareContractPayload;
  scoring?: DreamBuilderScoringContractPayload;
};

export type UiContractMeta = {
  contractId?: string;
  contractVersion?: string;
  textKeys?: string[];
};

type BootstrapContractState = {
  waiting: boolean;
  ready: boolean;
  retry_hint: boolean | string;
  phase?: string;
};

type PromptInvariantContext = {
  stepId: string;
  status: TurnOutputStatus;
  specialist: Record<string, unknown>;
  state: CanvasState;
};

export type ResolvedActionCodeTransition = {
  actionCode: string;
  stepId: string;
  targetStepId: string;
  renderMode: "actions" | "no_buttons";
};

type UiPayloadHelperDeps = {
  shouldLogLocalDevDiagnostics: () => boolean;
  pickPrompt: (specialist: any) => string;
  buildTextForWidget: (params: {
    specialist: any;
    hasWidgetActions?: boolean;
    questionTextOverride?: string;
    state?: CanvasState | null;
  }) => string;
  deriveBootstrapContract: (state: CanvasState | null | undefined) => BootstrapContractState;
  deriveUiViewPayload: (variant: UiViewVariant) => UiViewPayload | null;
  sanitizeWidgetActionCodes: (actionCodes: string[]) => string[];
  buildRenderedActionsFromActionCodes?: (
    actionCodes: string[],
    state?: CanvasState | null
  ) => RenderedAction[];
  buildQuestionTextFromActions: (prompt: string) => string;
  sanitizeEscapeInWidget: (specialist: any) => any;
  enforcePromptInvariants: (context: PromptInvariantContext) => Record<string, unknown>;
  isUiI18nV2Enabled: () => boolean;
  isUiI18nV3LangBootstrapEnabled: () => boolean;
  isUiLocaleMetaV1Enabled: () => boolean;
  isUiLangSourceResolverV1Enabled: () => boolean;
  isUiStrictNonEnPendingV1Enabled: () => boolean;
  isUiStep0LangResetGuardV1Enabled: () => boolean;
  isUiBootstrapStateV1Enabled: () => boolean;
  isUiPendingNoFallbackTextV1Enabled: () => boolean;
  isUiStartTriggerLangResolveV1Enabled: () => boolean;
  isUiLocaleReadyGateV1Enabled: () => boolean;
  isUiNoPendingTextSuppressV1Enabled: () => boolean;
  isUiBootstrapWaitRetryV1Enabled: () => boolean;
  isUiBootstrapEventParityV1Enabled: () => boolean;
  isUiBootstrapPollActionV1Enabled: () => boolean;
  isUiWaitShellV2Enabled: () => boolean;
  isUiTranslationFastModelV1Enabled: () => boolean;
  isUiI18nCriticalKeysV1Enabled: () => boolean;
};

function splitComparableSentences(text: string): string[] {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split(/(?:[.!?]+\s+|\n+)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferDreamBuilderBodyMode(bodyRaw: string): DreamBuilderBodyMode {
  const body = String(bodyRaw || "").trim();
  if (!body) return "none";
  const paragraphs = body
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "none";
  const allSupportOnly = paragraphs.every((paragraph) => {
    const words = paragraph.split(/\s+/).map((token) => token.trim()).filter(Boolean).length;
    const sentenceCount = splitComparableSentences(paragraph).length;
    return words > 0 && words <= 18 && sentenceCount <= 1;
  });
  return allSupportOnly ? "support_only" : "full_narrative";
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeUiContentPayload(raw: unknown): UiContentPayload | undefined {
  const record = toRecord(raw);
  const kind = String(record.kind || "").trim();
  if (kind === "single_value") {
    const heading = String(record.heading || "").trim();
    const canonicalText = String(record.canonical_text || "").trim();
    const supportText = String(record.support_text || "").trim();
    const feedbackReasonText = String(record.feedback_reason_text || "").trim();
    if (!heading && !canonicalText && !supportText && !feedbackReasonText) return undefined;
    return {
      kind: "single_value",
      ...(heading ? { heading } : {}),
      ...(canonicalText ? { canonical_text: canonicalText } : {}),
      ...(supportText ? { support_text: supportText } : {}),
      ...(feedbackReasonText ? { feedback_reason_text: feedbackReasonText } : {}),
    };
  }
  if (kind === "structured_suggestions") {
    const heading = String(record.heading || "").trim();
    const items = Array.isArray(record.items)
      ? record.items.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const outro = String(record.outro || "").trim();
    const itemStyle = String(record.item_style || "").trim() === "blocks" ? "blocks" : "bullets";
    if (!heading || items.length !== 3 || !outro) return undefined;
    return {
      kind: "structured_suggestions",
      heading,
      items,
      outro,
      item_style: itemStyle,
    };
  }
  return undefined;
}

function normalizeDreamBuilderCompareContractFromSpecialist(
  specialist: Record<string, unknown>
): DreamBuilderCompareContractPayload | undefined {
  const compareRuntime = readDreamBuilderCompareRuntime(specialist);
  if (!compareRuntime) return undefined;
  const kind = compareRuntime.kind;
  const currentItems = compareRuntime.current_items;
  const suggestedItems = compareRuntime.suggested_items;
  if (currentItems.length === 0 || suggestedItems.length === 0) return undefined;
  const normalized: DreamBuilderCompareContractPayload = {
    kind,
    current_items: currentItems,
    suggested_items: suggestedItems,
    ...(currentItems.length === 1 ? { current_value: currentItems[0] } : {}),
    ...(suggestedItems.length === 1 ? { suggested_value: suggestedItems[0] } : {}),
  };
  const rationale = compareRuntime.rationale;
  const currentLabel = compareRuntime.current_label;
  const suggestedLabel = compareRuntime.suggested_label;
  if (rationale) normalized.rationale = rationale;
  if (currentLabel) normalized.current_label = currentLabel;
  if (suggestedLabel) normalized.suggested_label = suggestedLabel;
  return normalized;
}

function normalizeDreamBuilderScoringContract(params: {
  specialist: Record<string, unknown>;
  state: CanvasState | null;
}): DreamBuilderScoringContractPayload | undefined {
  const clusters = Array.isArray(params.specialist.clusters)
    ? (params.specialist.clusters as unknown[])
      .map((entry) => {
        const record = entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : {};
        const statementIndices = Array.isArray(record.statement_indices)
          ? (record.statement_indices as unknown[])
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value >= 0)
            .map((value) => Math.trunc(value))
          : [];
        if (statementIndices.length === 0) return null;
        return {
          ...(String(record.theme || "").trim() ? { theme: String(record.theme || "").trim() } : {}),
          statement_indices: statementIndices,
        } satisfies DreamBuilderScoringClusterPayload;
      })
      .filter((entry): entry is DreamBuilderScoringClusterPayload => Boolean(entry))
    : [];
  if (clusters.length === 0) return undefined;
  const scores = Array.isArray((params.state as any)?.dream_scores)
    ? (((params.state as any).dream_scores as unknown[]) as Array<unknown[]>).map((row) =>
        Array.isArray(row) ? row.map((value) => String(value ?? "").trim()) : []
      )
    : undefined;
  const submitEnabled = Boolean(
    scores &&
      scores.length === clusters.length &&
      clusters.every((cluster, clusterIndex) => {
        const row = Array.isArray(scores[clusterIndex]) ? scores[clusterIndex] : [];
        return (
          row.length === cluster.statement_indices.length &&
          row.every((value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric >= 1 && numeric <= 10;
          })
        );
      })
  );
  const normalized: DreamBuilderScoringContractPayload = {
    clusters,
    submit_enabled: submitEnabled,
    submit_action: "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES",
  };
  if (scores && scores.length > 0) normalized.scores = scores;
  return normalized;
}

function buildDreamBuilderContract(params: {
  stepId: string;
  dreamBuilderFlowActive: boolean;
  viewVariant: UiViewVariant;
  questionText: string;
  bodyMode?: DreamBuilderBodyMode;
  statements: string[];
  statementsVisible: boolean;
  specialist: Record<string, unknown>;
  state: CanvasState | null;
}): DreamBuilderContractPayload | undefined {
  if (params.stepId !== DREAM_STEP_ID) return undefined;
  const compareFromSpecialist = normalizeDreamBuilderCompareContractFromSpecialist(params.specialist);
  const compareContract = compareFromSpecialist;
  const scoringFromSpecialist = normalizeDreamBuilderScoringContract({
    specialist: params.specialist,
    state: params.state,
  });
  const hasDreamBuilderContext =
    params.dreamBuilderFlowActive ||
    params.viewVariant === "dream_builder_collect" ||
    params.viewVariant === "dream_builder_refine" ||
    params.viewVariant === "dream_builder_scoring" ||
    Boolean(compareContract) ||
    Boolean(scoringFromSpecialist);
  if (!hasDreamBuilderContext) return undefined;

  let phase: DreamBuilderContractPhase = "collect";
  if (params.viewVariant === "dream_builder_scoring") {
    phase = "scoring";
  } else if (compareContract) {
    phase = "compare";
  } else if (params.viewVariant === "dream_builder_refine") {
    phase = "refine";
  }

  const contract: DreamBuilderContractPayload = {
    version: "2026-03-17.dream_builder_contract.v2",
    phase,
    statements: params.statements,
    statements_visible: params.statementsVisible,
  };
  if (params.bodyMode) contract.body_mode = params.bodyMode;
  if (params.questionText) contract.question = params.questionText;

  if (phase === "compare") {
    if (compareContract) {
      contract.compare = compareContract;
    }
  }
  if (phase === "scoring" && scoringFromSpecialist) {
    contract.scoring = scoringFromSpecialist;
  }

  return contract;
}

export function resolveActionCodeTransition(
  actionCode: string,
  stepId: string
): ResolvedActionCodeTransition | null {
  const safeActionCode = String(actionCode || "").trim().toUpperCase();
  const safeStepId = String(stepId || "").trim();
  if (!safeActionCode || !safeStepId) return null;
  const transition = ACTION_PRETRANSITION_BY_ACTIONCODE[safeActionCode];
  if (!transition) return null;
  const targetStepId = String(transition.targetStepId || safeStepId).trim();
  if (!targetStepId) return null;
  const renderMode: "actions" | "no_buttons" =
    String(transition.renderMode || "").trim() === "no_buttons" ? "no_buttons" : "actions";
  return {
    actionCode: safeActionCode,
    stepId: safeStepId,
    targetStepId,
    renderMode,
  };
}

export function createRunStepUiPayloadHelpers(deps: UiPayloadHelperDeps) {
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

  function setUiRenderModeByStep(
    state: CanvasState,
    stepId: string,
    mode: "actions" | "no_buttons"
  ): void {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return;
    const existing = (state as any).__ui_render_mode_by_step;
    const next = existing && typeof existing === "object" ? { ...existing } : {};
    next[safeStepId] = mode;
    (state as any).__ui_render_mode_by_step = next;
  }

  function inferUiRenderModeForStep(state: CanvasState, stepId: string): "actions" | "no_buttons" {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return "actions";
    const supportMode = currentTurnSupportMode({
      state,
      stepId: safeStepId,
      activeSpecialist: String((state as any).active_specialist || ""),
    });
    if (supportMode === "stuck_questions" || supportMode === "stuck_exit") {
      return "no_buttons";
    }
    const existing =
      (state as any).__ui_render_mode_by_step && typeof (state as any).__ui_render_mode_by_step === "object"
        ? ((state as any).__ui_render_mode_by_step as Record<string, unknown>)
        : {};
    return String(existing[safeStepId] || "").trim() === "no_buttons" ? "no_buttons" : "actions";
  }

  function parseStatusFromContractIdForStep(contractIdRaw: unknown, stepId: string): TurnOutputStatus | null {
    return parseUiContractStatusForStep(contractIdRaw, stepId);
  }

  function labelForActionCode(actionCode: string): string {
    const safeActionCode = String(actionCode || "").trim();
    if (!safeActionCode) return "";
    const labelKey = labelKeyForActionCode(safeActionCode);
    return String(ACTION_LABEL_DEFAULTS[labelKey] || "").trim();
  }

  function buildUiPayload(
    specialist: any,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    compareOverride?: CompareUiPayload | null,
    stateOverride?: CanvasState | null,
    stepIdOverride?: string,
    contractMetaOverride?: UiContractMeta | null,
    canonicalTextOverride?: string | null
  ): {
    action_codes?: string[];
    expected_choice_count?: number;
    actions?: RenderedAction[];
    questionText?: string;
    content?: UiContentPayload;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
  } | undefined {
    const localDev = deps.shouldLogLocalDevDiagnostics();
    const flags: Record<string, boolean | string> = { ...(flagsOverride || {}) };
    if (String(process.env.UI_I18N_V2 || process.env.UI_I18N_V3_TEXT_KEYS || "").trim()) {
      flags.ui_i18n_v2 = deps.isUiI18nV2Enabled();
    }
    if (String(process.env.UI_I18N_V3_LANG_BOOTSTRAP || "").trim()) {
      flags.ui_i18n_v3_lang_bootstrap = deps.isUiI18nV3LangBootstrapEnabled();
    }
    if (String(process.env.UI_LOCALE_META_V1 || "").trim()) {
      flags.ui_locale_meta_v1 = deps.isUiLocaleMetaV1Enabled();
    }
    if (String(process.env.UI_LANG_SOURCE_RESOLVER_V1 || "").trim()) {
      flags.ui_lang_source_resolver_v1 = deps.isUiLangSourceResolverV1Enabled();
    }
    if (String(process.env.UI_STRICT_NON_EN_PENDING_V1 || "").trim()) {
      flags.ui_strict_non_en_pending_v1 = deps.isUiStrictNonEnPendingV1Enabled();
    }
    if (String(process.env.UI_STEP0_LANG_RESET_GUARD_V1 || "").trim()) {
      flags.ui_step0_lang_reset_guard_v1 = deps.isUiStep0LangResetGuardV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_STATE_V1 || "").trim()) {
      flags.ui_bootstrap_state_v1 = deps.isUiBootstrapStateV1Enabled();
    }
    if (String(process.env.UI_PENDING_NO_FALLBACK_TEXT_V1 || "").trim()) {
      flags.ui_pending_no_fallback_text_v1 = deps.isUiPendingNoFallbackTextV1Enabled();
    }
    if (String(process.env.UI_START_TRIGGER_LANG_RESOLVE_V1 || "").trim()) {
      flags.ui_start_trigger_lang_resolve_v1 = deps.isUiStartTriggerLangResolveV1Enabled();
    }
    if (String(process.env.UI_LOCALE_READY_GATE_V1 || "").trim()) {
      flags.ui_locale_ready_gate_v1 = deps.isUiLocaleReadyGateV1Enabled();
    }
    if (String(process.env.UI_NO_PENDING_TEXT_SUPPRESS_V1 || "").trim()) {
      flags.ui_no_pending_text_suppress_v1 = deps.isUiNoPendingTextSuppressV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_WAIT_RETRY_V1 || "").trim()) {
      flags.ui_bootstrap_wait_retry_v1 = deps.isUiBootstrapWaitRetryV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_EVENT_PARITY_V1 || "").trim()) {
      flags.ui_bootstrap_event_parity_v1 = deps.isUiBootstrapEventParityV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_POLL_ACTION_V1 || "").trim()) {
      flags.ui_bootstrap_poll_action_v1 = deps.isUiBootstrapPollActionV1Enabled();
    }
    if (String(process.env.UI_WAIT_SHELL_V2 || "").trim()) {
      flags.ui_wait_shell_v2 = deps.isUiWaitShellV2Enabled();
    }
    if (String(process.env.UI_TRANSLATION_FAST_MODEL_V1 || "").trim()) {
      flags.ui_translation_fast_model_v1 = deps.isUiTranslationFastModelV1Enabled();
    }
    if (String(process.env.UI_I18N_CRITICAL_KEYS_V1 || "").trim()) {
      flags.ui_i18n_critical_keys_v1 = deps.isUiI18nCriticalKeysV1Enabled();
    }
    const introChromeRaw = String((specialist as any)?.ui_show_step_intro_chrome || "").trim().toLowerCase();
    if ((specialist as any)?.ui_show_step_intro_chrome === true || introChromeRaw === "true") {
      flags.show_step_intro_chrome = true;
    }
    const contractMeta = normalizeUiContractMeta(specialist, contractMetaOverride);
    const rawQuestionText = deps.pickPrompt(specialist);
    const questionText = deps.buildQuestionTextFromActions(rawQuestionText);
    void renderedActionsOverride;
    const effectiveState = (stateOverride && typeof stateOverride === "object" ? stateOverride : null) as
      | CanvasState
      | null;
    if (effectiveState && deps.isUiLocaleReadyGateV1Enabled()) {
      const bootstrap = deps.deriveBootstrapContract(effectiveState);
      flags.bootstrap_waiting_locale = bootstrap.waiting;
      flags.bootstrap_interactive_ready = bootstrap.ready;
      flags.bootstrap_retry_hint = bootstrap.retry_hint;
      flags.bootstrap_phase = String(bootstrap.phase || "");
      flags.locale_pending_background = bootstrap.waiting;
    }
    const effectiveStepId = String(stepIdOverride || (effectiveState as any)?.current_step || "").trim();
    const dreamRuntimeMode = String((effectiveState as any)?.__dream_runtime_mode || "").trim();
    const canonicalText = String(canonicalTextOverride || "").trim();
    const statementsCount = Array.isArray((specialist as any)?.statements)
      ? ((specialist as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
      : 0;
    const canonicalStatementsCount =
      Array.isArray((effectiveState as any)?.dream_builder_statements)
        ? ((effectiveState as any).dream_builder_statements as unknown[]).length
        : 0;
    const scoringPhase = String((specialist as any)?.scoring_phase || "").trim() === "true";
    const hasClusters =
      Array.isArray((specialist as any)?.clusters) &&
      ((specialist as any).clusters as unknown[]).length > 0;
    const suggestDreamBuilder = String((specialist as any)?.suggest_dreambuilder || "").trim() === "true";
    const persistedDreamScores =
      Array.isArray((effectiveState as any)?.dream_scores) &&
      ((effectiveState as any).dream_scores as unknown[]).some(
        (row) => Array.isArray(row) && row.length > 0
      );
    const persistedDreamTopClusters =
      Array.isArray((effectiveState as any)?.dream_top_clusters) &&
      ((effectiveState as any).dream_top_clusters as unknown[]).length > 0;
    const persistedDreamScoreContext = persistedDreamScores && persistedDreamTopClusters;
    const forceDreamBuilderRefine =
      effectiveStepId === DREAM_STEP_ID &&
      (
        dreamRuntimeMode === "builder_refine" ||
        (
          persistedDreamScoreContext &&
          String((effectiveState as any)?.dream_awaiting_direction || "").trim() === "false"
        )
      );
    const dreamBuilderFlowActive =
      effectiveStepId === DREAM_STEP_ID &&
      (
        dreamRuntimeMode === "builder_collect" ||
        dreamRuntimeMode === "builder_refine" ||
        dreamRuntimeMode === "builder_scoring" ||
        forceDreamBuilderRefine ||
        suggestDreamBuilder ||
        Boolean(readDreamBuilderCompareRuntime(specialist))
      );
    const dreamBuilderCompareActive =
      effectiveStepId === DREAM_STEP_ID &&
      dreamBuilderFlowActive &&
      Boolean(readDreamBuilderCompareRuntime(specialist));
    let viewVariant: UiViewVariant = "default";
    if (
      effectiveStepId === DREAM_STEP_ID &&
      !forceDreamBuilderRefine &&
      ((scoringPhase && hasClusters && Math.max(statementsCount, canonicalStatementsCount) >= 20) ||
        dreamRuntimeMode === "builder_scoring")
    ) {
      viewVariant = "dream_builder_scoring";
    } else if (dreamBuilderFlowActive) {
      viewVariant =
        forceDreamBuilderRefine || dreamRuntimeMode === "builder_refine"
          ? "dream_builder_refine"
          : "dream_builder_collect";
    }
    const questionTextPayload = questionText ? { questionText } : {};
    const rawContentPayload = normalizeUiContentPayload((specialist as Record<string, unknown>)?.ui_content);
    const shouldSuppressSingleValueContent =
      Boolean(rawContentPayload) &&
      isSingleValueTextPickerState({
        compareState: readPendingInteractionState(effectiveState),
        stepIdHint: effectiveStepId,
      });
    const contentPayload = shouldSuppressSingleValueContent
      ? undefined
      : rawContentPayload;
    const view = deps.deriveUiViewPayload(viewVariant);
    const dreamBuilderStatementsVisible =
      dreamBuilderFlowActive &&
      canonicalStatementsCount > 0;
    const dreamBuilderBodyMode =
      dreamBuilderFlowActive && viewVariant !== "dream_builder_scoring"
        ? inferDreamBuilderBodyMode(canonicalText)
        : undefined;
    const canonicalDreamBuilderStatements =
      Array.isArray((effectiveState as any)?.dream_builder_statements)
        ? ((effectiveState as any).dream_builder_statements as unknown[])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
        : [];
    const specialistDreamBuilderStatements =
      Array.isArray((specialist as any)?.statements)
        ? ((specialist as any).statements as unknown[])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
        : [];
    const dreamBuilderStatements =
      canonicalDreamBuilderStatements.length > 0
        ? canonicalDreamBuilderStatements
        : specialistDreamBuilderStatements;
    const viewPayload =
      view && dreamBuilderFlowActive
        ? {
            ...view,
            ...(dreamBuilderBodyMode ? { dream_builder_body_mode: dreamBuilderBodyMode } : {}),
            dream_builder_statements_visible: dreamBuilderStatementsVisible,
          }
        : view;
    const dreamBuilderContractPayload = buildDreamBuilderContract({
      stepId: effectiveStepId,
      dreamBuilderFlowActive,
      viewVariant,
      questionText,
      bodyMode: dreamBuilderBodyMode,
      statements: dreamBuilderStatements,
      statementsVisible: dreamBuilderStatementsVisible,
      specialist: (specialist || {}) as Record<string, unknown>,
      state: effectiveState,
    });
    void compareOverride;
    if (Array.isArray(actionCodesOverride)) {
      const safeOverrideCodes = deps.sanitizeWidgetActionCodes(
        actionCodesOverride.map((code) => String(code || "").trim()).filter(Boolean)
      );
      if (safeOverrideCodes.length !== actionCodesOverride.length && localDev) {
        flags.escape_actioncodes_suppressed = true;
      }
      if (safeOverrideCodes.length > 0) {
        const renderedActions =
          Array.isArray(renderedActionsOverride) && renderedActionsOverride.length > 0
            ? renderedActionsOverride
            : deps.buildRenderedActionsFromActionCodes
              ? deps.buildRenderedActionsFromActionCodes(safeOverrideCodes, effectiveState)
              : [];
        return {
          action_codes: safeOverrideCodes,
          expected_choice_count: safeOverrideCodes.length,
          ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
          ...questionTextPayload,
          ...(contentPayload ? { content: contentPayload } : {}),
          ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(viewPayload ? { view: viewPayload } : {}),
          flags,
        };
      }
      if (
        Object.keys(flags).length > 0 ||
        contractMeta.contractId ||
        viewPayload ||
        contentPayload
      ) {
        return {
          ...questionTextPayload,
          ...(contentPayload ? { content: contentPayload } : {}),
          ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(viewPayload ? { view: viewPayload } : {}),
          flags,
        };
      }
      return undefined;
    }
    if (
      Object.keys(flags).length > 0 ||
      contractMeta.contractId ||
      viewPayload ||
      contentPayload
    ) {
      return {
        ...questionTextPayload,
        ...(contentPayload ? { content: contentPayload } : {}),
        ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        ...(viewPayload ? { view: viewPayload } : {}),
        flags,
      };
    }
    return undefined;
  }

  function attachRegistryPayload<T extends Record<string, unknown>>(
    payload: T,
    specialist: any,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    compareOverride?: CompareUiPayload | null,
    contractMetaOverride?: UiContractMeta | null
  ): T & { registry_version: string; ui?: ReturnType<typeof buildUiPayload> } {
    let safeSpecialist = deps.sanitizeEscapeInWidget(specialist);
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
    const contractIdForStatus = String(
      effectiveContractOverride.contractId || (safeSpecialist as any)?.ui_contract_id || ""
    ).trim();
    const statusForInvariants =
      payloadState && payloadStepId
        ? parseStatusFromContractIdForStep(contractIdForStatus, payloadStepId)
        : null;
    if (payloadState && payloadStepId && statusForInvariants) {
      safeSpecialist = deps.enforcePromptInvariants({
        stepId: payloadStepId,
        status: statusForInvariants,
        specialist: safeSpecialist as Record<string, unknown>,
        state: payloadState,
      });
    }
    const provisionalUi = buildUiPayload(
      safeSpecialist,
      flagsOverride,
      actionCodesOverride,
      renderedActionsOverride,
      compareOverride,
      payloadState,
      payloadStepId,
      effectiveContractOverride
    );
    const provisionalHasWidgetActions =
      (Array.isArray(provisionalUi?.action_codes) && provisionalUi.action_codes.length > 0) ||
      (Array.isArray(provisionalUi?.actions) && provisionalUi.actions.length > 0);
    const canonicalText = Object.prototype.hasOwnProperty.call(payload, "text")
      ? deps.buildTextForWidget({
          specialist: safeSpecialist,
          hasWidgetActions: provisionalHasWidgetActions,
          questionTextOverride: String(provisionalUi?.questionText || ""),
          state: payloadState || null,
        })
      : String((payload as Record<string, unknown>).text || "");
    const ui = buildUiPayload(
      safeSpecialist,
      flagsOverride,
      actionCodesOverride,
      renderedActionsOverride,
      compareOverride,
      payloadState,
      payloadStepId,
      effectiveContractOverride,
      canonicalText
    );
    const existingMeta = toRecord((payload as Record<string, unknown>)._meta);
    const payloadMeta = existingMeta;
    const safePayload = {
      ...payload,
      specialist: safeSpecialist,
      ...(Object.keys(payloadMeta).length > 0 ? { _meta: payloadMeta } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "text")
        ? {
            text: canonicalText,
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "prompt")
        ? { prompt: deps.pickPrompt(safeSpecialist) }
        : {}),
    } as T;
    return {
      ...safePayload,
      registry_version: ACTIONCODE_REGISTRY.version,
      ...(ui ? { ui } : {}),
    };
  }

  return {
    normalizeUiContractMeta,
    applyUiPhaseByStep,
    setUiRenderModeByStep,
    inferUiRenderModeForStep,
    parseStatusFromContractIdForStep,
    resolveActionCodeTransition,
    labelForActionCode,
    buildUiPayload,
    attachRegistryPayload,
  };
}
