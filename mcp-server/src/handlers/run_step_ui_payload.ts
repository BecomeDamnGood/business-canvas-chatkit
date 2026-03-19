import { type CanvasState } from "../core/state.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, labelKeyForMenuAction } from "../core/menu_contract.js";
import { NEXT_MENU_BY_ACTIONCODE, UI_CONTRACT_VERSION } from "../core/ui_contract_matrix.js";
import { parseUiContractMenuForStep, parseUiContractStatusForStep } from "../core/ui_contract_id.js";
import { currentTurnSupportMode } from "../core/stuck_support.js";
import {
  normalizeUiFeedbackContractSource,
  resolveWordingChoiceFeedbackSource,
  synthesizeUiFeedbackContractFromWordingChoice,
} from "../core/ui_feedback_contract.js";
import { DREAM_STEP_ID } from "../steps/dream.js";
import type { RenderedAction, UiContentPayload } from "../contracts/ui_actions.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import { isPickerPresentation, isSingleValueTextPickerState } from "./run_step_wording_picker_contract.js";

type WordingChoiceMode = "text" | "list";
type WordingChoiceVariant = "default" | "clarify_dual" | "grouped_list_units";

export type WordingChoiceCompareFeedbackUiPayload = {
  text: string;
};

export type WordingChoiceUiPayload = {
  enabled: boolean;
  mode: WordingChoiceMode;
  variant?: WordingChoiceVariant;
  compare_feedback?: WordingChoiceCompareFeedbackUiPayload;
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
  | "text_compare"
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
  retained_heading?: string;
  retained_items?: string[];
  instruction?: string;
  committed_statements?: string[];
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
  sourceMenuId: string;
  targetStepId: string;
  targetMenuId: string;
  renderMode: "menu" | "no_buttons";
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
  buildRenderedActionsFromMenu: (
    menuId: string,
    actionCodes: string[],
    state?: CanvasState | null
  ) => RenderedAction[];
  buildQuestionTextFromActions: (prompt: string) => string;
  sanitizeEscapeInWidget: (specialist: any) => any;
  isWidgetSuppressedEscapeMenuId: (menuId: string) => boolean;
  enforcePromptInvariants: (context: PromptInvariantContext) => Record<string, unknown>;
  isUiI18nV2Enabled: () => boolean;
  isMenuLabelKeysV1Enabled: () => boolean;
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

function menuBelongsToStep(menuId: string, stepId: string): boolean {
  const actions = ACTIONCODE_REGISTRY.menus[String(menuId || "").trim()];
  const safeStepId = String(stepId || "").trim();
  if (!Array.isArray(actions) || actions.length === 0 || !safeStepId) return false;
  return actions.every((actionCode) => {
    const actionStep = String(ACTIONCODE_REGISTRY.actions[actionCode]?.step || "").trim();
    return actionStep === safeStepId || actionStep === "system";
  });
}

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

function normalizeUiFeedbackContract(
  raw: unknown,
  specialistRaw?: unknown
): Record<string, unknown> | undefined {
  return normalizeUiFeedbackContractSource(raw, specialistRaw);
}

function normalizeDreamBuilderCompareContractFromFeedback(raw: unknown): DreamBuilderCompareContractPayload | undefined {
  const feedback = normalizeUiFeedbackContract(raw);
  if (!feedback) return undefined;
  if (String(feedback.kind || "").trim() !== "grouped_list_compare") return undefined;

  const normalized: DreamBuilderCompareContractPayload = {
    kind: "batch_rewrite_compare",
  };
  const rationale = String(feedback.rationale || "").trim();
  const currentLabel = String(feedback.current_label || "").trim();
  const suggestedLabel = String(feedback.suggested_label || "").trim();
  const currentValue = String(feedback.current_value || "").trim();
  const suggestedValue = String(feedback.suggested_value || "").trim();
  const retainedHeading = String(feedback.retained_heading || "").trim();
  const instruction = String(feedback.instruction || "").trim();
  const currentItems = Array.isArray(feedback.current_items)
    ? (feedback.current_items as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const suggestedItems = Array.isArray(feedback.suggested_items)
    ? (feedback.suggested_items as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const retainedItems = Array.isArray(feedback.retained_items)
    ? (feedback.retained_items as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const committedStatements = Array.isArray(feedback.committed_statements)
    ? (feedback.committed_statements as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (rationale) normalized.rationale = rationale;
  if (currentLabel) normalized.current_label = currentLabel;
  if (suggestedLabel) normalized.suggested_label = suggestedLabel;
  if (currentValue) normalized.current_value = currentValue;
  if (suggestedValue) normalized.suggested_value = suggestedValue;
  if (currentItems.length > 0) normalized.current_items = currentItems;
  if (suggestedItems.length > 0) normalized.suggested_items = suggestedItems;
  if (retainedHeading) normalized.retained_heading = retainedHeading;
  if (retainedItems.length > 0) normalized.retained_items = retainedItems;
  if (instruction) normalized.instruction = instruction;
  if (committedStatements.length > 0) normalized.committed_statements = committedStatements;
  return normalized;
}

function normalizeDreamBuilderCompareContractFromSpecialist(
  specialist: Record<string, unknown>
): DreamBuilderCompareContractPayload | undefined {
  if (String(specialist.__dream_builder_compare_pending || "").trim() !== "true") return undefined;
  const kindRaw = String(specialist.__dream_builder_compare_kind || "").trim();
  const kind =
    kindRaw === "batch_rewrite_compare" || kindRaw === "overlap_merge_compare"
      ? kindRaw
      : "";
  if (!kind) return undefined;
  const currentItems = Array.isArray(specialist.__dream_builder_compare_current_items)
    ? (specialist.__dream_builder_compare_current_items as unknown[])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
  const suggestedItems = Array.isArray(specialist.__dream_builder_compare_suggested_items)
    ? (specialist.__dream_builder_compare_suggested_items as unknown[])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
  if (currentItems.length === 0 || suggestedItems.length === 0) return undefined;
  const segments = Array.isArray(specialist.__dream_builder_compare_segments)
    ? (specialist.__dream_builder_compare_segments as Array<Record<string, unknown>>)
    : [];
  const normalized: DreamBuilderCompareContractPayload = {
    kind,
    current_items: currentItems,
    suggested_items: suggestedItems,
    ...(currentItems.length === 1 ? { current_value: currentItems[0] } : {}),
    ...(suggestedItems.length === 1 ? { suggested_value: suggestedItems[0] } : {}),
  };
  const rationale = String(specialist.__dream_builder_compare_rationale || "").trim();
  const currentLabel = String(specialist.__dream_builder_compare_current_label || "").trim();
  const suggestedLabel = String(specialist.__dream_builder_compare_suggested_label || "").trim();
  const instruction = String(specialist.__dream_builder_compare_instruction || "").trim();
  const committedStatements = Array.isArray(specialist.__dream_builder_compare_committed_statements)
    ? (specialist.__dream_builder_compare_committed_statements as unknown[])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
  if (rationale) normalized.rationale = rationale;
  if (currentLabel) normalized.current_label = currentLabel;
  if (suggestedLabel) normalized.suggested_label = suggestedLabel;
  normalized.instruction = instruction || "Choose the version that fits best.";
  if (committedStatements.length > 0) normalized.committed_statements = committedStatements;
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
  feedbackContractPayload?: Record<string, unknown>;
}): DreamBuilderContractPayload | undefined {
  if (params.stepId !== DREAM_STEP_ID) return undefined;
  void params.feedbackContractPayload;
  const compareFromFeedback = normalizeDreamBuilderCompareContractFromFeedback(params.feedbackContractPayload);
  const compareFromSpecialist = normalizeDreamBuilderCompareContractFromSpecialist(params.specialist);
  const compareContract = compareFromFeedback || compareFromSpecialist;
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
      contract.compare = {
        ...compareContract,
        committed_statements:
          Array.isArray(compareContract.committed_statements) && compareContract.committed_statements.length > 0
            ? compareContract.committed_statements
            : params.statements,
      };
    }
  }
  if (phase === "scoring" && scoringFromSpecialist) {
    contract.scoring = scoringFromSpecialist;
  }

  return contract;
}

export function resolveActionCodeTransition(
  actionCode: string,
  stepId: string,
  sourceMenuId: string
): ResolvedActionCodeTransition | null {
  const safeActionCode = String(actionCode || "").trim().toUpperCase();
  const safeStepId = String(stepId || "").trim();
  const safeSourceMenu = String(sourceMenuId || "").trim();
  const sourceMenuForMatch = safeSourceMenu || "NO_MENU";
  if (!safeActionCode || !safeStepId) return null;
  const transition = NEXT_MENU_BY_ACTIONCODE[safeActionCode];
  if (!transition) return null;
  if (String(transition.step_id || "").trim() !== safeStepId) return null;
  const fromMenus = Array.isArray(transition.from_menu_ids)
    ? transition.from_menu_ids.map((menu) => String(menu || "").trim()).filter(Boolean)
    : [];
  if (fromMenus.length > 0 && !fromMenus.includes(sourceMenuForMatch)) return null;
  const targetStepId = String(transition.to_step_id || safeStepId).trim();
  if (!targetStepId) return null;
  const renderMode: "menu" | "no_buttons" =
    String(transition.render_mode || "").trim() === "no_buttons" ? "no_buttons" : "menu";
  const targetMenuId = String(transition.to_menu_id || "").trim();
  if (renderMode === "menu") {
    if (!targetMenuId) return null;
    if (!menuBelongsToStep(targetMenuId, targetStepId)) return null;
  }
  return {
    actionCode: safeActionCode,
    stepId: safeStepId,
    sourceMenuId: sourceMenuForMatch,
    targetStepId,
    targetMenuId: renderMode === "menu" ? targetMenuId : "",
    renderMode,
  };
}

export function resolveActionCodeMenuTransition(
  actionCode: string,
  stepId: string,
  sourceMenuId: string
): string {
  const resolved = resolveActionCodeTransition(actionCode, stepId, sourceMenuId);
  if (!resolved) return "";
  if (resolved.renderMode !== "menu") return "";
  if (resolved.targetStepId !== String(stepId || "").trim()) return "";
  return resolved.targetMenuId;
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
    mode: "menu" | "no_buttons"
  ): void {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return;
    const existing = (state as any).__ui_render_mode_by_step;
    const next = existing && typeof existing === "object" ? { ...existing } : {};
    next[safeStepId] = mode;
    (state as any).__ui_render_mode_by_step = next;
  }

  function inferUiRenderModeForStep(state: CanvasState, stepId: string): "menu" | "no_buttons" {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return "menu";
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
    return String(existing[safeStepId] || "").trim() === "no_buttons" ? "no_buttons" : "menu";
  }

  function parseMenuFromContractIdForStep(contractIdRaw: unknown, stepId: string): string {
    return parseUiContractMenuForStep(contractIdRaw, stepId);
  }

  function parseStatusFromContractIdForStep(contractIdRaw: unknown, stepId: string): TurnOutputStatus | null {
    return parseUiContractStatusForStep(contractIdRaw, stepId);
  }

  function inferCurrentMenuForStep(state: CanvasState, stepId: string): string {
    const phaseMap =
      (state as any).__ui_phase_by_step && typeof (state as any).__ui_phase_by_step === "object"
        ? ((state as any).__ui_phase_by_step as Record<string, unknown>)
        : {};
    return parseMenuFromContractIdForStep(phaseMap[String(stepId || "").trim()], stepId);
  }

  function labelForActionInMenu(menuId: string, actionCode: string): string {
    const safeMenuId = String(menuId || "").trim();
    const safeActionCode = String(actionCode || "").trim();
    if (!safeMenuId || !safeActionCode) return "";
    const actionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
      ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim())
      : [];
    if (actionCodes.length === 0) return "";
    const idx = actionCodes.findIndex((code) => code === safeActionCode);
    if (idx < 0) return "";
    const labelKey = labelKeyForMenuAction(safeMenuId, safeActionCode, idx);
    return String(MENU_LABEL_DEFAULTS[labelKey] || "").trim();
  }

  function buildUiPayload(
    specialist: any,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    wordingChoiceOverride?: WordingChoiceUiPayload | null,
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
    feedback_contract?: Record<string, unknown>;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
    wording_choice?: WordingChoiceUiPayload;
  } | undefined {
    const localDev = deps.shouldLogLocalDevDiagnostics();
    const flags: Record<string, boolean | string> = { ...(flagsOverride || {}) };
    if (String(process.env.UI_I18N_V2 || process.env.UI_I18N_V3_TEXT_KEYS || "").trim()) {
      flags.ui_i18n_v2 = deps.isUiI18nV2Enabled();
    }
    if (String(process.env.MENU_LABEL_KEYS_V1 || process.env.UI_I18N_V3_MENU_KEY_ONLY || "").trim()) {
      flags.menu_label_keys_v1 = deps.isMenuLabelKeysV1Enabled();
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
    const contractMenuId = parseMenuFromContractIdForStep(contractMeta.contractId, effectiveStepId);
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
    const wordingPickPending =
      Boolean(wordingChoiceOverride?.enabled) ||
      String((specialist as any)?.wording_choice_pending || "").trim() === "true" ||
      Boolean((flagsOverride || {}).require_wording_pick);
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
          (
            contractMenuId === "DREAM_EXPLAINER_MENU_REFINE" ||
            String((effectiveState as any)?.dream_awaiting_direction || "").trim() === "false"
          )
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
        contractMenuId.startsWith("DREAM_EXPLAINER_MENU_")
      );
    const dreamBuilderCompareActive =
      effectiveStepId === DREAM_STEP_ID &&
      dreamBuilderFlowActive &&
      String((specialist as Record<string, unknown>).__dream_builder_compare_pending || "").trim() === "true";
    const resolvedWordingChoiceForFeedbackContract = resolveWordingChoiceFeedbackSource(
      wordingChoiceOverride,
      (specialist || {}) as Record<string, unknown>
    ) as WordingChoiceUiPayload | null;
    const explicitFeedbackContractPayload = normalizeUiFeedbackContract(
      (specialist as Record<string, unknown>)?.ui_feedback_contract,
      specialist as Record<string, unknown>
    );
    const comparePickerActive =
      wordingPickPending &&
      !dreamBuilderFlowActive &&
      isPickerPresentation((specialist as Record<string, unknown>)?.wording_choice_presentation);
    const rawFeedbackContractPayload =
      dreamBuilderFlowActive
        ? undefined
        : (
          explicitFeedbackContractPayload ||
          (comparePickerActive
            ? synthesizeUiFeedbackContractFromWordingChoice(resolvedWordingChoiceForFeedbackContract, flags)
            : undefined)
        );
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
        forceDreamBuilderRefine || contractMenuId === "DREAM_EXPLAINER_MENU_REFINE"
          ? "dream_builder_refine"
          : "dream_builder_collect";
    } else if (comparePickerActive) {
      viewVariant = "text_compare";
    }
    const questionTextPayload =
      viewVariant === "text_compare" && !dreamBuilderCompareActive
        ? {}
        : (questionText ? { questionText } : {});
    const rawContentPayload = normalizeUiContentPayload((specialist as Record<string, unknown>)?.ui_content);
    const shouldSuppressSingleValueContent =
      Boolean(rawContentPayload) &&
      isSingleValueTextPickerState({
        specialist: specialist as Record<string, unknown>,
        stepIdHint: effectiveStepId,
      });
    const contentPayload = shouldSuppressSingleValueContent ? undefined : rawContentPayload;
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
      feedbackContractPayload: rawFeedbackContractPayload,
    });
    const shouldExposeLegacyWordingChoice =
      Boolean(wordingChoiceOverride) &&
      effectiveStepId !== DREAM_STEP_ID &&
      !(effectiveStepId === DREAM_STEP_ID && dreamBuilderFlowActive) &&
      !rawFeedbackContractPayload &&
      !dreamBuilderCompareActive &&
      !(effectiveStepId === DREAM_STEP_ID && dreamBuilderContractPayload);
    const legacyWordingChoicePayload = shouldExposeLegacyWordingChoice
      ? (wordingChoiceOverride || undefined)
      : undefined;
    if (Array.isArray(actionCodesOverride)) {
      const safeOverrideCodes = deps.sanitizeWidgetActionCodes(
        actionCodesOverride.map((code) => String(code || "").trim()).filter(Boolean)
      );
      if (safeOverrideCodes.length !== actionCodesOverride.length && localDev) {
        flags.escape_actioncodes_suppressed = true;
      }
      if (safeOverrideCodes.length > 0) {
        const renderedActions = deps.buildRenderedActionsFromMenu(contractMenuId, safeOverrideCodes, effectiveState);
        return {
          action_codes: safeOverrideCodes,
          expected_choice_count: safeOverrideCodes.length,
          ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
          ...questionTextPayload,
          ...(contentPayload ? { content: contentPayload } : {}),
          ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
          ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(viewPayload ? { view: viewPayload } : {}),
          flags,
          ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
        };
      }
      if (
        Object.keys(flags).length > 0 ||
        shouldExposeLegacyWordingChoice ||
        contractMeta.contractId ||
        viewPayload ||
        contentPayload ||
        rawFeedbackContractPayload
      ) {
        return {
          ...questionTextPayload,
          ...(contentPayload ? { content: contentPayload } : {}),
          ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
          ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(viewPayload ? { view: viewPayload } : {}),
          flags,
          ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
        };
      }
      return undefined;
    }
    const menuId = contractMenuId;
    if (menuId) {
      if (deps.isWidgetSuppressedEscapeMenuId(menuId)) {
        if (localDev) flags.escape_menu_suppressed = true;
        if (
          Object.keys(flags).length > 0 ||
          shouldExposeLegacyWordingChoice ||
          contractMeta.contractId ||
          contentPayload ||
          rawFeedbackContractPayload
        ) {
          return {
            ...questionTextPayload,
            ...(contentPayload ? { content: contentPayload } : {}),
            ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
            ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
            ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
            ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
            ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
            flags,
            ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
          };
        }
        return undefined;
      }
      const actionCodes = ACTIONCODE_REGISTRY.menus[menuId];
      if (actionCodes && actionCodes.length > 0) {
        const safeCodes = deps.sanitizeWidgetActionCodes(
          actionCodes.map((code) => String(code || "").trim()).filter(Boolean)
        );
        if (safeCodes.length !== actionCodes.length && localDev) {
          flags.escape_actioncodes_suppressed = true;
        }
        if (safeCodes.length === 0) {
          if (
            Object.keys(flags).length > 0 ||
            shouldExposeLegacyWordingChoice ||
            contractMeta.contractId ||
            viewPayload ||
            contentPayload ||
            rawFeedbackContractPayload
          ) {
            return {
              ...questionTextPayload,
              ...(contentPayload ? { content: contentPayload } : {}),
              ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
              ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
              ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
              ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
              ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
              ...(viewPayload ? { view: viewPayload } : {}),
              flags,
              ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
            };
          }
          return undefined;
        }
        const renderedActions = deps.buildRenderedActionsFromMenu(menuId, safeCodes, effectiveState);
        return {
          action_codes: safeCodes,
          expected_choice_count: safeCodes.length,
          ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
          ...questionTextPayload,
          ...(contentPayload ? { content: contentPayload } : {}),
          ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
          ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(viewPayload ? { view: viewPayload } : {}),
          flags,
          ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
        };
      }
    }
    if (
      Object.keys(flags).length > 0 ||
      shouldExposeLegacyWordingChoice ||
      contractMeta.contractId ||
      viewPayload ||
      contentPayload ||
      rawFeedbackContractPayload
    ) {
      return {
        ...questionTextPayload,
        ...(contentPayload ? { content: contentPayload } : {}),
        ...(rawFeedbackContractPayload ? { feedback_contract: rawFeedbackContractPayload } : {}),
        ...(dreamBuilderContractPayload ? { dream_builder_contract: dreamBuilderContractPayload } : {}),
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        ...(viewPayload ? { view: viewPayload } : {}),
        flags,
        ...(legacyWordingChoicePayload ? { wording_choice: legacyWordingChoicePayload } : {}),
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
    wordingChoiceOverride?: WordingChoiceUiPayload | null,
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
      wordingChoiceOverride,
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
      wordingChoiceOverride,
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
    parseMenuFromContractIdForStep,
    parseStatusFromContractIdForStep,
    inferCurrentMenuForStep,
    resolveActionCodeMenuTransition,
    resolveActionCodeTransition,
    labelForActionInMenu,
    buildUiPayload,
    attachRegistryPayload,
  };
}
