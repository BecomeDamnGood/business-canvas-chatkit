/**
 * Main card rendering, choice buttons, stepper, formatText, error views.
 */

import {
  ORDER,
  t,
  titlesForLang,
  prestartContentForLang,
  prestartIntroVideoUrlForLang,
  benProfileVideoUrlForLang,
  dreamStepVideoUrlForLang,
  purposeStepVideoUrlForLang,
  bigWhyStepVideoUrlForLang,
  roleStepVideoUrlForLang,
  hasPrestartContentForLang,
  getSectionTitle,
  stepperLabelForLang,
  setRuntimeUiStrings,
} from "./ui_constants.js";
import {
  escapeHtml,
  renderInlineText,
  renderSingleValueCardContent,
  renderStructuredSuggestionsCardContent,
  renderStructuredText,
  stripInlineText,
} from "./ui_text.js";
import type { Choice } from "./ui_choices.js";
import {
  callRunStep,
  setLoading,
  setSendEnabled,
  setInlineNotice,
  clearInlineNotice,
  lockRateLimit,
  toolData,
  setLastToolOutput,
  resolveActionLivenessNotice,
  retainCanonicalStepContinuity,
  uiLang,
  resolveWidgetPayload,
  resetHydrationRetryCycle,
  applyPendingWidgetScroll,
} from "./ui_actions.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";
import { dreamBuilderExerciseLabelKey } from "../../src/handlers/dream_builder_resume.js";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type DreamBuilderContractPhase = "collect" | "compare" | "scoring" | "refine";

type NormalizedDreamBuilderCompareContract = {
  kind: "batch_rewrite_compare" | "overlap_merge_compare";
  rationale: string;
  currentLabel: string;
  suggestedLabel: string;
  currentValue: string;
  suggestedValue: string;
  currentItems: string[];
  suggestedItems: string[];
  retainedHeading: string;
  retainedItems: string[];
};

type NormalizedDreamBuilderScoringContract = {
  clusters: Array<{ theme: string; statementIndices: number[] }>;
  scores: string[][];
  submitEnabled: boolean;
  submitAction: string;
};

type NormalizedDreamBuilderContract = {
  phase: DreamBuilderContractPhase;
  statements: string[];
  statementsVisible: boolean;
  bodyMode: "" | "none" | "support_only" | "full_narrative";
  question: string;
  compare: NormalizedDreamBuilderCompareContract | null;
  scoring: NormalizedDreamBuilderScoringContract | null;
};

type NormalizedPendingInteraction = {
  id: string;
  kind: "text_compare" | "list_compare";
  status: "pending";
  allowedActions: Array<{
    id: string;
    actionCode: string;
    label: string;
    labelKey: string;
    role: string;
    surface: string;
    primary: boolean;
  }>;
  renderModel: {
    mode: "text" | "list";
    instruction: string;
    feedbackReasonText: string;
    userLabel: string;
    suggestionLabel: string;
    userText: string;
    suggestionText: string;
    userItems: string[];
    suggestionItems: string[];
    units: Array<{
      userItems: string[];
      suggestionItems: string[];
      feedbackReasonText: string;
    }>;
    retainedHeading: string;
    retainedItems: string[];
  };
};

function parseContractOwner(contractIdRaw: unknown): string {
  const contractId = String(contractIdRaw || "").trim();
  if (!contractId) return "";
  const parts = contractId.split(":");
  if (parts.length < 3) return "";
  const [, , ...ownerParts] = parts;
  return ownerParts.join(":").trim().toLowerCase();
}

export function readUiContractOwner(resultData: Record<string, unknown> | null | undefined): string {
  const result = resultData && typeof resultData === "object" ? resultData : {};
  const uiPayload = toRecord(result.ui);
  const specialist = toRecord(result.specialist);
  const candidates = [
    uiPayload.contract_id,
    uiPayload.ui_contract_id,
    specialist.ui_contract_id,
  ];
  for (const candidate of candidates) {
    const owner = parseContractOwner(candidate);
    if (owner) return owner;
  }
  return "";
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeDreamBuilderContractPhase(raw: unknown): DreamBuilderContractPhase | "" {
  const phase = String(raw || "").trim();
  if (phase === "collect" || phase === "compare" || phase === "scoring" || phase === "refine") {
    return phase;
  }
  return "";
}


export function readDreamBuilderContract(
  uiPayloadRaw: Record<string, unknown> | null | undefined
): NormalizedDreamBuilderContract | null {
  const uiPayload = toRecord(uiPayloadRaw);
  const contract = toRecord(uiPayload.dream_builder_contract);
  const phase = normalizeDreamBuilderContractPhase(contract.phase);
  if (!phase) return null;
  const statements = normalizeStringArray(contract.statements);
  const statementsVisible = contract.statements_visible === true;
  const bodyModeRaw = String(contract.body_mode || "").trim();
  const bodyMode =
    bodyModeRaw === "none" ||
    bodyModeRaw === "support_only" ||
    bodyModeRaw === "full_narrative"
      ? bodyModeRaw
      : "";
  const compareRaw = toRecord(contract.compare);
  const compareKind = String(compareRaw.kind || "").trim();
  const compare =
    compareKind === "batch_rewrite_compare" || compareKind === "overlap_merge_compare"
      ? {
          kind: compareKind as "batch_rewrite_compare" | "overlap_merge_compare",
          rationale: String(compareRaw.rationale || "").trim(),
          currentLabel: String(compareRaw.current_label || "").trim(),
          suggestedLabel: String(compareRaw.suggested_label || "").trim(),
          currentValue: String(compareRaw.current_value || "").trim(),
          suggestedValue: String(compareRaw.suggested_value || "").trim(),
          currentItems: normalizeStringArray(compareRaw.current_items),
          suggestedItems: normalizeStringArray(compareRaw.suggested_items),
          retainedHeading: String(compareRaw.retained_heading || "").trim(),
          retainedItems: normalizeStringArray(compareRaw.retained_items),
        }
      : null;
  const scoringRaw = toRecord(contract.scoring);
  const scoringClusters = Array.isArray(scoringRaw.clusters)
    ? (scoringRaw.clusters as unknown[])
      .map((entry) => {
        const record = toRecord(entry);
        const statementIndices = Array.isArray(record.statement_indices)
          ? (record.statement_indices as unknown[])
              .map((value) => String(value ?? "").trim())
              .filter((value) => value !== "")
          : []
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
          .map((value) => Math.trunc(value));
        if (statementIndices.length === 0) return null;
        return {
          theme: String(record.theme || "").trim(),
          statementIndices,
        };
      })
      .filter((entry): entry is { theme: string; statementIndices: number[] } => Boolean(entry))
    : [];
  const scoringScores = Array.isArray(scoringRaw.scores)
    ? (scoringRaw.scores as unknown[]).map((row) =>
        Array.isArray(row) ? row.map((value) => String(value ?? "").trim()) : []
      )
    : [];
  const scoring =
    scoringClusters.length > 0
      ? {
          clusters: scoringClusters,
          scores: scoringScores,
          submitEnabled: scoringRaw.submit_enabled === true,
          submitAction: String(scoringRaw.submit_action || "").trim(),
        }
      : null;
  return {
    phase,
    statements,
    statementsVisible,
    bodyMode,
    question: String(contract.question || "").trim(),
    compare,
    scoring,
  };
}

function readSingleValueCardContent(uiPayload: Record<string, unknown>): {
  heading?: string;
  canonicalText?: string;
  supportText?: string;
  feedbackReasonText?: string;
} | null {
  const content = toRecord(uiPayload.content);
  if (String(content.kind || "").trim() !== "single_value") return null;
  const heading = String(content.heading || "").trim();
  const canonicalText = String(content.canonical_text || "").trim();
  const supportText = String(content.support_text || "").trim();
  const feedbackReasonText = String(content.feedback_reason_text || "").trim();
  if (!heading && !canonicalText && !supportText && !feedbackReasonText) return null;
  return {
    ...(heading ? { heading } : {}),
    ...(canonicalText ? { canonicalText } : {}),
    ...(supportText ? { supportText } : {}),
    ...(feedbackReasonText ? { feedbackReasonText } : {}),
  };
}

export function readStructuredSuggestionsCardContent(uiPayload: Record<string, unknown>): {
  heading?: string;
  items?: string[];
  outro?: string;
  itemStyle?: "bullets" | "blocks";
} | null {
  const content = toRecord(uiPayload.content);
  if (String(content.kind || "").trim() !== "structured_suggestions") return null;
  const heading = String(content.heading || "").trim();
  const items = normalizeStringArray(content.items);
  const outro = String(content.outro || "").trim();
  const itemStyle = String(content.item_style || "").trim() === "blocks" ? "blocks" : "bullets";
  if (!heading && items.length === 0 && !outro) return null;
  return {
    ...(heading ? { heading } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(outro ? { outro } : {}),
    itemStyle,
  };
}

export function decorateStructuredSuggestionItemsForStep(params: {
  stepId: string;
  lang: string | null | undefined;
  content: {
    heading?: string;
    items?: string[];
    outro?: string;
    itemStyle?: "bullets" | "blocks";
  } | null;
}): {
  heading?: string;
  items?: string[];
  outro?: string;
  itemStyle?: "bullets" | "blocks";
} | null {
  const content = params.content;
  if (!content) return null;
  if (params.stepId !== "strategy" || content.itemStyle !== "blocks" || !Array.isArray(content.items)) {
    return content;
  }
  const stepTitle = extractStepTitle(params.stepId, params.lang) || "Strategy";
  return {
    ...content,
    items: content.items.map((item, index) => `${stepTitle} ${index + 1}\n${String(item || "").trim()}`.trim()),
  };
}

export function shouldSuppressMainCardForCompare(
  uiPayloadRaw: Record<string, unknown> | null | undefined
): boolean {
  const uiPayload = uiPayloadRaw && typeof uiPayloadRaw === "object" ? uiPayloadRaw : {};
  return Boolean(readPendingInteraction(uiPayload));
}

export function shouldSuppressPromptForCompare(params: {
  compareActive?: boolean;
}): boolean {
  return params.compareActive === true;
}

export function shouldShowTextInputForCompare(params: {
  textSubmitAvailable?: boolean;
  compareActive?: boolean;
  dreamBuilderTextInputActive?: boolean;
}): boolean {
  return params.textSubmitAvailable === true;
}

export function shouldDisableTextInputForCompare(): boolean {
  return false;
}

export function shouldRenderPurposeStepIntroVideo(params: {
  currentStep?: string | null;
  showStepIntroChrome?: boolean;
  compareActive?: boolean;
  lang?: string | null;
}): boolean {
  if (String(params.currentStep || "").trim() !== "purpose") return false;
  if (params.showStepIntroChrome !== true) return false;
  if (params.compareActive === true) return false;
  return Boolean(purposeStepVideoUrlForLang(params.lang));
}

export function shouldRenderBigWhyStepIntroVideo(params: {
  currentStep?: string | null;
  showStepIntroChrome?: boolean;
  compareActive?: boolean;
  lang?: string | null;
}): boolean {
  if (String(params.currentStep || "").trim() !== "bigwhy") return false;
  if (params.showStepIntroChrome !== true) return false;
  if (params.compareActive === true) return false;
  return Boolean(bigWhyStepVideoUrlForLang(params.lang));
}

export function shouldRenderRoleStepIntroVideo(params: {
  currentStep?: string | null;
  showStepIntroChrome?: boolean;
  compareActive?: boolean;
  lang?: string | null;
}): boolean {
  if (String(params.currentStep || "").trim() !== "role") return false;
  if (params.showStepIntroChrome !== true) return false;
  if (params.compareActive === true) return false;
  return Boolean(roleStepVideoUrlForLang(params.lang));
}

export function dreamExerciseButtonLabelKeyForState(
  state: Record<string, unknown> | null | undefined
): "dreamBuilder.startExercise" | "dreamBuilder.resumeExercise" {
  return dreamBuilderExerciseLabelKey(state);
}

function actionContractActionsForResult(resultData: Record<string, unknown>): Array<Record<string, unknown>> {
  const uiPayload = toRecord(resultData.ui);
  const actionContract = toRecord(uiPayload.action_contract);
  if (Array.isArray(actionContract.actions)) {
    return (actionContract.actions as unknown[])
      .map((entry) => toRecord(entry))
      .filter((entry) => String(entry.action_code || "").trim().length > 0);
  }
  if (Array.isArray(uiPayload.actions) && uiPayload.actions.length > 0) {
    console.warn("[ui_action_contract_missing_actions]", {
      legacy_actions_count: uiPayload.actions.length,
      current_step: String((resultData.state as Record<string, unknown> | undefined)?.current_step || ""),
    });
  }
  return [];
}

function compareAllowedActionsFromUiPayload(
  uiPayloadRaw: Record<string, unknown> | null | undefined
): NormalizedPendingInteraction["allowedActions"] {
  const uiPayload = toRecord(uiPayloadRaw);
  const actionContract = toRecord(uiPayload.action_contract);
  const actions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as unknown[])
      .map((entry) => toRecord(entry))
      .filter((entry) => String(entry.action_code || "").trim().length > 0)
    : [];
  return actions
    .map((action) => {
      const id = String(action.id || "").trim();
      const actionCode = String(action.action_code || "").trim();
      const label = String(action.label || "").trim();
      const labelKey = String(action.label_key || "").trim();
      const role = String(action.role || "").trim();
      const surface = String(action.surface || "").trim();
      if (!id || !actionCode || !label || !labelKey || !role || !surface) return null;
      return {
        id,
        actionCode,
        label,
        labelKey,
        role,
        surface,
        primary: action.primary === true,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function readPendingInteraction(
  uiPayloadRaw: Record<string, unknown> | null | undefined
): NormalizedPendingInteraction | null {
  const uiPayload = toRecord(uiPayloadRaw);
  const pending = toRecord(uiPayload.pending_interaction);
  const kind = String(pending.kind || "").trim();
  const status = String(pending.status || "").trim();
  if ((kind === "text_compare" || kind === "list_compare") && status === "pending") {
    const renderModelRaw = toRecord(pending.render_model);
    const mode = String(renderModelRaw.mode || "").trim().toLowerCase() === "list" ? "list" : "text";
    if ((kind === "list_compare" && mode === "list") || (kind === "text_compare" && mode === "text")) {
      const allowedActions = compareAllowedActionsFromUiPayload({
        action_contract: uiPayload.action_contract,
        pending_interaction: pending,
      });
      const hasUserPickAction = allowedActions.some((action) => action.role === "compare_pick_user");
      const hasSuggestionPickAction = allowedActions.some((action) => action.role === "compare_pick_suggestion");
      const userLabel = String(renderModelRaw.user_label || "").trim();
      const suggestionLabel = String(renderModelRaw.suggestion_label || "").trim();
      const userItems = normalizeStringArray(renderModelRaw.user_items);
      const suggestionItems = normalizeStringArray(renderModelRaw.suggestion_items);
      const userText = String(renderModelRaw.user_text || "").trim();
      const suggestionText = String(renderModelRaw.suggestion_text || "").trim();
      const hasComparableValues =
        mode === "list"
          ? userItems.length > 0 || suggestionItems.length > 0 || Boolean(userText) || Boolean(suggestionText)
          : Boolean(userText) || Boolean(suggestionText);
      if (allowedActions.length > 0 && hasUserPickAction && hasSuggestionPickAction && userLabel && suggestionLabel && hasComparableValues) {
        return {
          id: String(pending.id || "").trim(),
          kind: kind as "text_compare" | "list_compare",
          status: "pending",
          allowedActions,
          renderModel: {
            mode,
            instruction: String(renderModelRaw.instruction || "").trim(),
            feedbackReasonText: String(renderModelRaw.feedback_reason_text || "").trim(),
            userLabel,
            suggestionLabel,
            userText,
            suggestionText,
            userItems,
            suggestionItems,
            units: Array.isArray(renderModelRaw.units)
              ? (renderModelRaw.units as unknown[])
                .map((entry) => {
                  const unit = toRecord(entry);
                  const normalizedUserItems = normalizeStringArray(unit.user_items);
                  const normalizedSuggestionItems = normalizeStringArray(unit.suggestion_items);
                  const feedbackReasonText = String(unit.feedback_reason_text || "").trim();
                  if (normalizedUserItems.length === 0 && normalizedSuggestionItems.length === 0) return null;
                  return {
                    userItems: normalizedUserItems,
                    suggestionItems: normalizedSuggestionItems,
                    feedbackReasonText,
                  };
                })
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
              : [],
            retainedHeading: String(renderModelRaw.retained_heading || "").trim(),
            retainedItems: normalizeStringArray(renderModelRaw.retained_items),
          },
        };
      }
    }
  }

  const dreamBuilderContract = readDreamBuilderContract(uiPayload);
  const compare = dreamBuilderContract?.compare;
  if (dreamBuilderContract?.phase !== "compare" || !compare) return null;
  const compareActions = compareAllowedActionsFromUiPayload(uiPayload);
  const hasCompareUserPickAction = compareActions.some((action) => action.role === "compare_pick_user");
  const hasCompareSuggestionPickAction = compareActions.some((action) => action.role === "compare_pick_suggestion");
  if (!hasCompareUserPickAction || !hasCompareSuggestionPickAction) return null;
  const compareHasComparableValues =
    compare.currentItems.length > 0 ||
    compare.suggestedItems.length > 0 ||
    Boolean(compare.currentValue) ||
    Boolean(compare.suggestedValue);
  if (!compareHasComparableValues) return null;
  return {
    id: String(pending.id || "dream_builder_compare").trim(),
    kind: "list_compare",
    status: "pending",
    allowedActions: compareActions,
    renderModel: {
      mode: "list",
      instruction: "",
      feedbackReasonText: compare.rationale,
      userLabel: compare.currentLabel,
      suggestionLabel: compare.suggestedLabel,
      userText: compare.currentValue,
      suggestionText: compare.suggestedValue,
      userItems: compare.currentItems,
      suggestionItems: compare.suggestedItems,
      units: [],
      retainedHeading: compare.retainedHeading,
      retainedItems: compare.retainedItems,
    },
  };
}

export function readCompareContractFailureReason(
  uiPayloadRaw: Record<string, unknown> | null | undefined
): string | null {
  const uiPayload = toRecord(uiPayloadRaw);
  const dreamBuilderContract = readDreamBuilderContract(uiPayload);
  if (dreamBuilderContract) return null;
  const pendingInteractionRaw = toRecord(uiPayload.pending_interaction);
  if (Object.keys(pendingInteractionRaw).length === 0) return null;
  return readPendingInteraction(uiPayload) ? null : "ui_pending_interaction_malformed_for_compare";
}

type ActionDescriptor = {
  actionCode: string;
  payloadMode: string;
};

type RenderableContractAction = {
  actionCode: string;
  label: string;
  labelKey: string;
  payloadMode: string;
  role: string;
  surface: string;
  primary: boolean;
};

const ACTION_ROLE_BY_STATE_KEY: Record<string, string> = {
  ui_action_start: "start",
  ui_action_text_submit: "text_submit",
  ui_action_score_submit: "score_submit",
  ui_action_compare_pick_user: "compare_pick_user",
  ui_action_compare_pick_suggestion: "compare_pick_suggestion",
  ui_action_dream_start_exercise: "dream_start_exercise",
  ui_action_dream_switch_to_self: "dream_switch_to_self",
};

const ACTION_PAYLOAD_MODE_STATE_KEY_BY_STATE_KEY: Record<string, string> = {
  ui_action_text_submit: "ui_action_text_submit_payload_mode",
};

function actionDescriptorForRole(resultData: Record<string, unknown>, role: string): ActionDescriptor | null {
  const roleNorm = String(role || "").trim().toLowerCase();
  if (!roleNorm) return null;
  const actions = actionContractActionsForResult(resultData);
  for (const action of actions) {
    if (String(action.role || "").trim().toLowerCase() !== roleNorm) continue;
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode) continue;
    return {
      actionCode,
      payloadMode: String(action.payload_mode || "").trim().toLowerCase(),
    };
  }
  return null;
}

function actionCodeForRole(resultData: Record<string, unknown>, role: string): string {
  return actionDescriptorForRole(resultData, role)?.actionCode || "";
}

export function actionRoleForStateKey(stateKey: string): string {
  return String(ACTION_ROLE_BY_STATE_KEY[String(stateKey || "").trim()] || "").trim();
}

export function resolveActionCodeForStateKey(
  resultData: Record<string, unknown>,
  stateRaw: Record<string, unknown> | null | undefined,
  stateKey: string
): string {
  void stateRaw;
  const role = actionRoleForStateKey(stateKey);
  if (role) {
    const actionCodeFromContract = actionCodeForRole(resultData, role);
    if (actionCodeFromContract) return actionCodeFromContract;
  }
  return "";
}

export function resolveActionPayloadModeForStateKey(
  resultData: Record<string, unknown>,
  stateRaw: Record<string, unknown> | null | undefined,
  stateKey: string
): string {
  void stateRaw;
  const role = actionRoleForStateKey(stateKey);
  if (role) {
    const payloadMode = String(actionDescriptorForRole(resultData, role)?.payloadMode || "").trim().toLowerCase();
    if (payloadMode) return payloadMode;
  }
  void ACTION_PAYLOAD_MODE_STATE_KEY_BY_STATE_KEY;
  return "";
}

function defaultSurfaceForActionRole(role: string): string {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (normalizedRole === "start") return "primary";
  if (normalizedRole === "text_submit") return "text_input";
  if (normalizedRole === "score_submit") return "primary";
  if (normalizedRole === "compare_pick_user" || normalizedRole === "compare_pick_suggestion") {
    return "compare_pick";
  }
  if (normalizedRole === "dream_start_exercise") {
    return "choice";
  }
  if (normalizedRole === "dream_switch_to_self") {
    return "auxiliary";
  }
  return "choice";
}

function normalizeRenderableContractAction(
  actionRaw: Record<string, unknown>,
  lang: string
): RenderableContractAction | null {
  const actionCode = String(actionRaw.action_code || "").trim();
  if (!actionCode) return null;
  const role = String(actionRaw.role || "").trim().toLowerCase() || "choice";
  const surface =
    String(actionRaw.surface || "").trim().toLowerCase() || defaultSurfaceForActionRole(role);
  const labelKey = String(actionRaw.label_key || "").trim();
  const labelFromPayload = stripInlineText(String(actionRaw.label || "")).trim();
  const label = labelFromPayload || (labelKey ? String(t(lang, labelKey) || "").trim() : "");
  if (!label) return null;
  return {
    actionCode,
    label,
    labelKey,
    payloadMode: String(actionRaw.payload_mode || "").trim().toLowerCase(),
    role,
    surface,
    primary: actionRaw.primary === true,
  };
}

export function surfaceActionsForResult(
  resultData: Record<string, unknown>,
  surface: string,
  langOverride?: string | null
): RenderableContractAction[] {
  const lang = String(langOverride || uiLang((resultData?.state as Record<string, unknown>) || {})).trim().toLowerCase() || "en";
  const normalizedSurface = String(surface || "").trim().toLowerCase();
  if (!normalizedSurface) return [];
  return actionContractActionsForResult(resultData)
    .map((action) => normalizeRenderableContractAction(action, lang))
    .filter((action): action is RenderableContractAction => Boolean(action))
    .filter((action) => action.surface === normalizedSurface);
}

function choiceActionsForResult(resultData: Record<string, unknown>): RenderableContractAction[] {
  return surfaceActionsForResult(resultData, "choice");
}

export function collectPendingScoresForContractAction(): number[][] | null {
  const canUseDomFallback = typeof document !== "undefined";
  if (canUseDomFallback) {
    const domPayload = collectPendingScoresFromDom(true);
    if (domPayload) return domPayload;
  }
  const scoringScores =
    (globalThis as unknown as { __dreamScoringScores?: unknown[][] }).__dreamScoringScores || [];
  if (!Array.isArray(scoringScores) || scoringScores.length === 0) {
    return null;
  }
  const payload: number[][] = [];
  for (let ci = 0; ci < scoringScores.length; ci += 1) {
    const row = Array.isArray(scoringScores[ci]) ? scoringScores[ci] : [];
    const normalizedRow: number[] = [];
    if (row.length === 0) return null;
    for (let si = 0; si < row.length; si += 1) {
      const raw = row[si];
      const value = Number(raw);
      if (raw === "" || raw === undefined || Number.isNaN(value) || value < 1 || value > 10) {
        return null;
      }
      normalizedRow.push(Math.round(value));
    }
    payload.push(normalizedRow);
  }
  return payload;
}

export function collectPartialPendingScoresForContractAction(): number[][] | null {
  const canUseDomFallback = typeof document !== "undefined";
  if (canUseDomFallback) {
    const domPayload = collectPendingScoresFromDom(false);
    if (domPayload) return domPayload;
  }
  const scoringScores =
    (globalThis as unknown as { __dreamScoringScores?: unknown[][] }).__dreamScoringScores || [];
  if (!Array.isArray(scoringScores) || scoringScores.length === 0) {
    return null;
  }
  const payload: number[][] = [];
  let hasAnyValue = false;
  for (let ci = 0; ci < scoringScores.length; ci += 1) {
    const row = Array.isArray(scoringScores[ci]) ? scoringScores[ci] : [];
    const normalizedRow: number[] = [];
    for (let si = 0; si < row.length; si += 1) {
      const normalized = normalizeDreamScoreValue(row[si]);
      if (normalized) hasAnyValue = true;
      normalizedRow.push(normalized ? Number(normalized) : 0);
    }
    payload.push(normalizedRow);
  }
  return hasAnyValue ? payload : null;
}

function collectPendingScoresFromDom(requireComplete: boolean): number[][] | null {
  const clusterEls = Array.from(
    document.querySelectorAll<HTMLElement>('.scoringCluster[data-cluster-index]')
  ).sort((left, right) => {
    const leftIndex = Number(left.getAttribute("data-cluster-index") || "0");
    const rightIndex = Number(right.getAttribute("data-cluster-index") || "0");
    return leftIndex - rightIndex;
  });
  if (clusterEls.length === 0) return null;
  const payload: number[][] = [];
  let hasAnyValue = false;
  for (const clusterEl of clusterEls) {
    const inputEls = Array.from(
      clusterEl.querySelectorAll<HTMLInputElement>('.scoreInput[data-statement]')
    ).sort((left, right) => {
      const leftIndex = Number(left.getAttribute("data-statement") || "0");
      const rightIndex = Number(right.getAttribute("data-statement") || "0");
      return leftIndex - rightIndex;
    });
    if (inputEls.length === 0) return null;
    const normalizedRow: number[] = [];
    for (const inputEl of inputEls) {
      const normalized = normalizeDreamScoreValue(inputEl.value);
      if (!normalized) {
        if (requireComplete) return null;
        normalizedRow.push(0);
        continue;
      }
      hasAnyValue = true;
      normalizedRow.push(Number(normalized));
    }
    payload.push(normalizedRow);
  }
  return requireComplete ? payload : hasAnyValue ? payload : null;
}

function dispatchContractAction(action: RenderableContractAction): void {
  if (getIsLoading()) return;
  if (action.role === "start") {
    setSessionStarted(true);
    setSessionWelcomeShown(false);
    callRunStep(action.actionCode, { started: "true" });
    return;
  }
  if (action.role === "score_submit") {
    const pendingScores = collectPendingScoresForContractAction();
    if (!pendingScores) return;
    callRunStep(action.actionCode, { __pending_scores: pendingScores });
    return;
  }
  callRunStep(action.actionCode);
}

function renderActionSurfaceButtons(params: {
  containerId: string;
  actions: RenderableContractAction[];
  className: string;
}): void {
  const container = document.getElementById(params.containerId);
  if (!container) return;
  container.innerHTML = "";
  if (params.actions.length === 0) {
    (container as HTMLElement).style.display = "none";
    return;
  }

  for (const action of params.actions) {
    const button = document.createElement("button");
    button.className = params.className;
    button.type = "button";
    button.textContent = action.label;
    button.disabled = getIsLoading();
    button.setAttribute("data-bsc-action-code", action.actionCode);
    button.setAttribute("data-bsc-action-role", action.role);
    button.setAttribute("data-bsc-action-surface", action.surface);
    button.addEventListener("click", () => {
      dispatchContractAction(action);
    });
    container.appendChild(button);
  }

  (container as HTMLElement).style.display = "flex";
}

function stepIndex(stepId: string): number {
  const idx = ORDER.indexOf(stepId as (typeof ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

export function extractStepTitle(stepId: string, lang: string | null | undefined): string {
  const titles = titlesForLang(lang);
  const fullTitle = titles[stepId] || "";
  return fullTitle.replace(/^[^\d]*\d+:\s*/, "");
}

function uiText(lang: string | null | undefined, key: string, _fallback: string): string {
  const translated = String(t(lang, key) || "").trim();
  if (translated) return translated;
  return "";
}

export function parseCompareInstruction(instructionRaw: string): {
  retainedHeading: string;
  retainedItems: string[];
  instructionText: string;
} {
  const instruction = String(instructionRaw || "").replace(/\r/g, "\n").trim();
  if (!instruction) {
    return { retainedHeading: "", retainedItems: [], instructionText: "" };
  }
  const lines = instruction
    .split("\n")
    .map((line) => String(line || "").trim());
  const firstBulletIndex = lines.findIndex((line) => /^(?:[-*•·]|\d+[\).])\s+/.test(line));
  if (firstBulletIndex < 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }

  let bulletEndIndex = firstBulletIndex;
  while (bulletEndIndex < lines.length && /^(?:[-*•·]|\d+[\).])\s+/.test(lines[bulletEndIndex])) {
    bulletEndIndex += 1;
  }

  const retainedHeading = lines
    .slice(0, firstBulletIndex)
    .filter(Boolean)
    .join("\n")
    .trim();
  const retainedItems = lines
    .slice(firstBulletIndex, bulletEndIndex)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[\).])\s+/, "").trim())
    .filter(Boolean);
  const instructionText = lines
    .slice(bulletEndIndex)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!retainedHeading || retainedItems.length === 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }
  return { retainedHeading, retainedItems, instructionText: instructionText || instruction };
}

function normalizeDreamScoreValue(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const num = Number(trimmed);
  if (Number.isNaN(num) || num < 1 || num > 10) return "";
  return String(Math.round(num));
}

function normalizeDreamScoreMatrix(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) =>
    Array.isArray(row)
      ? row.map((value) => normalizeDreamScoreValue(value))
      : []
  );
}

export function buildInitialDreamScoringScores(params: {
  clientScores?: unknown;
  clientScoreMap?: unknown;
  persistedScores?: unknown;
  statements?: unknown;
  clusters: Array<{ statement_indices?: unknown[] }>;
}): string[][] {
  const clientScores = normalizeDreamScoreMatrix(params.clientScores);
  const clientScoreMap =
    params.clientScoreMap && typeof params.clientScoreMap === "object"
      ? (params.clientScoreMap as Record<string, unknown>)
      : {};
  const persistedScores = normalizeDreamScoreMatrix(params.persistedScores);
  const hasClientValues = clientScores.some((row) => row.some((value) => value !== ""));
  const sourceScores = hasClientValues ? clientScores : persistedScores;
  const statements = Array.isArray(params.statements)
    ? (params.statements as unknown[]).map((value) => String(value || "").trim())
    : [];

  return params.clusters.map((cluster, clusterIndex) => {
    const statementIndices = Array.isArray(cluster.statement_indices) ? cluster.statement_indices : [];
    const sourceRow = Array.isArray(sourceScores[clusterIndex]) ? sourceScores[clusterIndex] : [];
    return statementIndices.map((statementIndexRaw, statementIndex) => {
      const statementPosition = Number(statementIndexRaw);
      const statementText =
        Number.isFinite(statementPosition) && statementPosition >= 0
          ? String(statements[Math.trunc(statementPosition)] || "").trim()
          : "";
      const mappedValue = statementText
        ? normalizeDreamScoreValue(clientScoreMap[statementText])
        : "";
      return mappedValue || normalizeDreamScoreValue(sourceRow[statementIndex]);
    });
  });
}

export function shouldRetainDreamScoringClientScores(params: {
  currentStep?: string | null;
  isScoringView: boolean;
}): boolean {
  void params.isScoringView;
  return String(params.currentStep || "").trim() === "dream";
}

function benAvatarCandidates(): string[] {
  const candidates: string[] = [];
  try {
    const base = String(document.baseURI || window.location.href || "").trim();
    if (base) {
      candidates.push(new URL("assets/ben-steenstra.webp", base).href);
    }
  } catch {
    // Ignore URL/base issues in restricted embed contexts.
  }
  candidates.push("/ui/assets/ben-steenstra.webp");
  return Array.from(new Set(candidates.map((value) => String(value || "").trim()).filter(Boolean)));
}

function prependBenProfileAvatar(cardDescEl: HTMLElement): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-benAvatar")) return;
  const candidates = benAvatarCandidates();
  if (candidates.length === 0) return;
  const img = document.createElement("img");
  img.className = "cardDesc-benAvatar";
  img.alt = "Ben Steenstra";
  img.loading = "eager";
  img.decoding = "async";
  let index = 0;
  img.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      img.src = candidates[index];
      return;
    }
    img.remove();
  };
  img.src = candidates[index];
  cardDescEl.insertBefore(img, cardDescEl.firstChild);
}

function appendVideoEmbed(cardDescEl: HTMLElement, videoUrl: string, title: string, prepend = false): void {
  const safeVideoUrl = String(videoUrl || "").trim();
  if (!cardDescEl || !safeVideoUrl) return;
  const videoWrap = appendTextNode("div", "cardDesc-video", "");
  const video = document.createElement("video");
  video.src = safeVideoUrl;
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("aria-label", String(title || "").trim() || "embedded-video");
  video.setAttribute("controlsList", "nodownload");
  videoWrap.appendChild(video);
  if (prepend) {
    cardDescEl.insertBefore(videoWrap, cardDescEl.firstChild);
    return;
  }
  cardDescEl.appendChild(videoWrap);
}

function prependBenProfileVideo(cardDescEl: HTMLElement, lang: string | null | undefined): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-video")) return;
  const videoUrl = benProfileVideoUrlForLang(lang);
  if (!videoUrl) return;
  appendVideoEmbed(cardDescEl, videoUrl, "ben-profile-video", true);
}

function appendDreamStepIntroVideo(cardDescEl: HTMLElement, lang: string | null | undefined): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-video")) return;
  const videoUrl = dreamStepVideoUrlForLang(lang);
  if (!videoUrl) return;
  appendVideoEmbed(cardDescEl, videoUrl, "dream-step-video");
}

function appendPurposeStepIntroVideo(cardDescEl: HTMLElement, lang: string | null | undefined): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-video")) return;
  const videoUrl = purposeStepVideoUrlForLang(lang);
  if (!videoUrl) return;
  appendVideoEmbed(cardDescEl, videoUrl, "purpose-step-video");
}

function appendBigWhyStepIntroVideo(cardDescEl: HTMLElement, lang: string | null | undefined): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-video")) return;
  const videoUrl = bigWhyStepVideoUrlForLang(lang);
  if (!videoUrl) return;
  appendVideoEmbed(cardDescEl, videoUrl, "bigwhy-step-video");
}

function appendRoleStepIntroVideo(cardDescEl: HTMLElement, lang: string | null | undefined): void {
  if (!cardDescEl || cardDescEl.querySelector(".cardDesc-video")) return;
  const videoUrl = roleStepVideoUrlForLang(lang);
  if (!videoUrl) return;
  appendVideoEmbed(cardDescEl, videoUrl, "role-step-video");
}

function activeStepLabel(
  stepId: string,
  stepTitle: string | null | undefined,
  lang: string | null | undefined
): string {
  const explicitTitle = String(stepTitle || "").trim();
  if (explicitTitle) return explicitTitle;
  const stepperLabel = stepperLabelForLang(stepId, lang);
  if (stepperLabel) return stepperLabel;
  return extractStepTitle(stepId, lang);
}

export function buildStepper(
  activeIdx: number,
  stepTitle: string | null | undefined,
  lang?: string | null
): void {
  const el = document.getElementById("stepper");
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < ORDER.length; i++) {
    const stepId = ORDER[i];
    const s = document.createElement("div");
    let className = "step-item step";
    if (stepId === "presentation") className += " step-item--presentation";
    if (i < activeIdx) className += " completed";
    if (i === activeIdx) className += " active";
    s.className = className;
    s.dataset.stepId = stepId;
    const label = document.createElement("div");
    label.className = "step-item-label";
    /* Only the active step shows a label, now always full-length. */
    label.textContent = i === activeIdx ? activeStepLabel(stepId, stepTitle, lang) : "";
    s.appendChild(label);
    const bar = document.createElement("div");
    bar.className = "step-bar";
    s.appendChild(bar);
    el.appendChild(s);
  }
}

export function dedupeBodyAgainstPrompt(bodyRaw: string, promptRaw: string): string {
  const body = String(bodyRaw || "");
  const prompt = String(promptRaw || "").trim();
  if (!body.trim() || !prompt) return body;

  const bodyTrimmed = body.trim();
  if (bodyTrimmed === prompt) return "";

  const bodyLeadingTrimmed = body.trimStart();
  if (!bodyLeadingTrimmed.startsWith(prompt)) return body;
  const rest = bodyLeadingTrimmed.slice(prompt.length);
  if (!/^\s+/.test(rest)) return body;
  return rest.replace(/^\s+/, "");
}

export function readDreamBuilderViewContract(
  uiViewRaw: Record<string, unknown> | null | undefined
): {
  active: boolean;
  bodyMode: "" | "none" | "support_only" | "full_narrative";
  hasExplicitStatementsVisible: boolean;
  statementsVisible: boolean;
} {
  const uiView = uiViewRaw && typeof uiViewRaw === "object" ? uiViewRaw : {};
  const variant = String(uiView.variant || "").trim();
  const active =
    variant === "dream_builder_collect" ||
    variant === "dream_builder_refine" ||
    variant === "dream_builder_scoring";
  const bodyModeRaw = String(uiView.dream_builder_body_mode || "").trim();
  const bodyMode =
    bodyModeRaw === "none" || bodyModeRaw === "support_only" || bodyModeRaw === "full_narrative"
      ? bodyModeRaw
      : "";
  const rawStatementsVisible = uiView.dream_builder_statements_visible;
  const hasExplicitStatementsVisible = rawStatementsVisible === true || rawStatementsVisible === false;
  return {
    active,
    bodyMode,
    hasExplicitStatementsVisible,
    statementsVisible: rawStatementsVisible === true,
  };
}

export function resolveWidgetBodyText(params: {
  currentStep: string;
  resultText: unknown;
  specialist: Record<string, unknown>;
  promptBody?: unknown;
  dreamBuilderViewContract?: ReturnType<typeof readDreamBuilderViewContract>;
  isDreamBuilderRefineView?: boolean;
}): string {
  const resultText = typeof params.resultText === "string" ? String(params.resultText || "").trim() : "";
  const promptBody = String(params.promptBody || "");
  const specialist = params.specialist || {};
  const refinedFormulation = String(specialist.refined_formulation || "").trim();
  const specialistText =
    String(specialist.message || "").trim() ||
    refinedFormulation ||
    String(specialist.question || "").trim();
  const dreamBuilderViewContract = params.dreamBuilderViewContract || readDreamBuilderViewContract(null);
  if (params.currentStep === "dream" && params.isDreamBuilderRefineView && refinedFormulation) {
    return refinedFormulation;
  }
  if (params.currentStep === "dream" && dreamBuilderViewContract.active) {
    if (typeof params.resultText === "string") return resultText;
    if (dreamBuilderViewContract.bodyMode === "none") return "";
  }
  return resultText || specialistText || promptBody;
}

function normalizeChoiceLine(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function stripStructuredChoiceLines(promptRaw: string, lang?: string | null): string {
  const blockedLines = [
    t(lang, "compareInstruction"),
    t(lang, "invariant.prompt.ask.default"),
    t(lang, "generic.choicePrompt.shareOrOption"),
    t(lang, "compare.choice.context.default"),
  ]
    .map((line) => normalizeChoiceLine(line))
    .filter(Boolean);
  const blockedSet = new Set(blockedLines);
  const kept = String(promptRaw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^\d+[\)\.]\s+/.test(line))
    .filter((line) => !blockedSet.has(normalizeChoiceLine(line)));
  return kept.join("\n").trim();
}

function setStaticStrings(lang: string): void {
  const uiSubtitle = document.getElementById("uiSubtitle");
  const byText = document.getElementById("byText");
  const btnStartText = document.getElementById("btnStartText");
  const send = document.getElementById("send");
  if (uiSubtitle) {
    uiSubtitle.textContent = "";
    (uiSubtitle as HTMLElement).style.display = "none";
  }
  if (byText) byText.textContent = t(lang, "byText");
  if (btnStartText) btnStartText.textContent = t(lang, "btnStart");
  if (send) send.setAttribute("title", t(lang, "sendTitle"));
}

function clearElement(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendTextNode(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  if (className) el.className = className;
  el.textContent = String(text || "");
  return el;
}

function renderPrestartContent(cardDesc: HTMLElement, lang: string): void {
  const content = prestartContentForLang(lang);
  clearElement(cardDesc);
  cardDesc.appendChild(appendTextNode("p", "card-headline", content.headline));

  const sectionProven = appendTextNode("div", "section", "");
  sectionProven.appendChild(appendTextNode("div", "section-title", content.provenTitle));
  sectionProven.appendChild(appendTextNode("div", "section-body", content.provenBody));
  cardDesc.appendChild(sectionProven);

  cardDesc.appendChild(appendTextNode("div", "divider", ""));

  const introVideoUrl = prestartIntroVideoUrlForLang(lang);
  if (introVideoUrl) {
    appendVideoEmbed(cardDesc, introVideoUrl, String(content.headline || "").trim() || "prestart-video");
  }

  const sectionOutcomes = appendTextNode("div", "section", "");
  sectionOutcomes.appendChild(appendTextNode("div", "section-title", content.outcomesTitle));
  const deliverables = appendTextNode("div", "deliverables", "");
  for (const item of [content.outcome1, content.outcome2, content.outcome3]) {
    const deliverable = appendTextNode("div", "deliverable", "");
    deliverable.appendChild(appendTextNode("div", "deliverable-dot", ""));
    deliverable.appendChild(document.createTextNode(item));
    deliverables.appendChild(deliverable);
  }
  sectionOutcomes.appendChild(deliverables);
  cardDesc.appendChild(sectionOutcomes);

  cardDesc.appendChild(appendTextNode("div", "divider", ""));

  const metaRow = appendTextNode("div", "meta-row", "");
  const metaHow = appendTextNode("div", "meta-item", "");
  metaHow.appendChild(appendTextNode("div", "meta-label", content.howLabel));
  metaHow.appendChild(appendTextNode("div", "meta-value", content.howValue));
  metaRow.appendChild(metaHow);
  const metaTime = appendTextNode("div", "meta-item", "");
  metaTime.appendChild(appendTextNode("div", "meta-label", content.timeLabel));
  metaTime.appendChild(appendTextNode("div", "meta-value", content.timeValue));
  metaRow.appendChild(metaTime);
  cardDesc.appendChild(metaRow);
}

function renderPrestartSkeleton(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const skeleton = appendTextNode("div", "skeleton-stack", "");
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  cardDesc.appendChild(skeleton);
}

function renderBootstrapWaitShell(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "14px";
  const waitTitle = uiText(lang, "prestart.loading", "");
  if (waitTitle) {
    shell.appendChild(appendTextNode("div", "bootstrap-wait-title", waitTitle));
  }
  for (const width of ["68%", "92%", "84%", "56%"]) {
    const line = appendTextNode("div", "skeleton-line", "");
    (line as HTMLElement).style.width = width;
    (line as HTMLElement).style.height = "12px";
    (line as HTMLElement).style.borderRadius = "999px";
    (line as HTMLElement).style.opacity = "0.9";
    shell.appendChild(line);
  }
  cardDesc.appendChild(shell);
}

function renderHydrationRecovery(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "12px";
  shell.appendChild(appendTextNode("div", "bootstrap-recovery-title", uiText(lang, "hydration.retry.title", "")));
  shell.appendChild(appendTextNode("div", "bootstrap-recovery-copy", uiText(lang, "hydration.retry.body", "")));
  const btn = appendTextNode("button", "choiceBtn", uiText(lang, "hydration.retry.action", "")) as HTMLButtonElement;
  btn.id = "btnHydrationRetry";
  btn.type = "button";
  shell.appendChild(btn);
  cardDesc.appendChild(shell);
}

function blockedMessageForReason(
  lang: string,
  reason: string,
  fallbackMessage: string
): { title: string; body: string } {
  if (reason === "session_upgrade_required") {
    return {
      title: uiText(lang, "error.session_upgrade.title", ""),
      body: uiText(lang, "error.session_upgrade.body", "") || fallbackMessage || "",
    };
  }
  if (reason === "contract_violation") {
    return {
      title: uiText(lang, "error.contract.title", ""),
      body: uiText(lang, "error.contract.body", "") || fallbackMessage || "",
    };
  }
  return {
    title: uiText(lang, "error.generic.title", ""),
    body: uiText(lang, "error.generic.body", "") || fallbackMessage || "",
  };
}

function readActionLiveness(
  result: Record<string, unknown>,
  state: Record<string, unknown>
): {
  ack_status: string;
  state_advanced: boolean;
  reason_code: string;
  action_code_echo: string;
  client_action_id_echo: string;
} | null {
  const stateLiveness = toRecord(state.ui_action_liveness);
  const ackStatus = String(result.ack_status || state.ack_status || stateLiveness.ack_status || "")
    .trim()
    .toLowerCase();
  if (!ackStatus) return null;
  const stateAdvancedRaw =
    result.state_advanced ??
    state.state_advanced ??
    stateLiveness.state_advanced ??
    true;
  const stateAdvanced =
    stateAdvancedRaw === true ||
    String(stateAdvancedRaw || "").trim().toLowerCase() === "true";
  return {
    ack_status: ackStatus,
    state_advanced: stateAdvanced,
    reason_code: String(result.reason_code || state.reason_code || stateLiveness.reason_code || "")
      .trim()
      .toLowerCase(),
    action_code_echo: String(result.action_code_echo || state.action_code_echo || stateLiveness.action_code_echo || "")
      .trim()
      .toUpperCase(),
    client_action_id_echo: String(
      result.client_action_id_echo || state.client_action_id_echo || stateLiveness.client_action_id_echo || ""
    ).trim(),
  };
}

function renderBlockedState(cardDesc: HTMLElement, lang: string, title: string, body: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "12px";
  shell.appendChild(appendTextNode("div", "bootstrap-blocked-title", title));
  shell.appendChild(appendTextNode("div", "bootstrap-blocked-copy", body));
  cardDesc.appendChild(shell);
}

function renderContractFailureState(cardDesc: HTMLElement, lang: string, reasonCode: string, fallbackMessage: string): void {
  const blocked = blockedMessageForReason(lang, "contract_violation", fallbackMessage);
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "12px";
  shell.appendChild(appendTextNode("div", "bootstrap-blocked-title", blocked.title));
  shell.appendChild(appendTextNode("div", "bootstrap-blocked-copy", blocked.body));
  shell.appendChild(appendTextNode("div", "bootstrap-blocked-copy", `Reason code: ${reasonCode || "contract_violation"}`));
  cardDesc.appendChild(shell);
}

function warnWidgetRootVisibilityIssue(reason: "missing_body" | "attribute_still_hidden"): void {
  const root = globalThis as Record<string, unknown>;
  const signature = `warned:${reason}`;
  if (root.__BSC_UI_VISIBILITY_WARNING__ === signature) return;
  root.__BSC_UI_VISIBILITY_WARNING__ = signature;
  const body =
    typeof document !== "undefined" && document.body
      ? (document.body as HTMLElement & { getAttribute?: (name: string) => string | null })
      : null;
  console.warn("[ui_root_visibility_issue]", {
    reason,
    body_present: Boolean(body),
    data_bsc_ready: body && typeof body.getAttribute === "function" ? body.getAttribute("data-bsc-ready") || "" : "",
  });
}

function revealWidgetRoot(): void {
  if ((globalThis as Record<string, unknown>).__BSC_UI_REVEALED__ === true) return;
  (globalThis as Record<string, unknown>).__BSC_UI_REVEALED__ = true;
  if (typeof document === "undefined" || !document.body) {
    warnWidgetRootVisibilityIssue("missing_body");
    return;
  }
  document.body.setAttribute("data-bsc-ready", "1");
  if (
    typeof (document.body as HTMLElement & { getAttribute?: (name: string) => string | null }).getAttribute === "function" &&
    (document.body as HTMLElement & { getAttribute: (name: string) => string | null }).getAttribute("data-bsc-ready") !== "1"
  ) {
    warnWidgetRootVisibilityIssue("attribute_still_hidden");
  }
}

export function renderChoiceButtons(choices: Choice[] | null | undefined, resultData: Record<string, unknown>): void {
  const wrap = document.getElementById("choiceWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const state = (resultData?.state as Record<string, unknown>) || {};
  const uiPayload = toRecord(resultData?.ui);
  const structuredActions = choiceActionsForResult(resultData);
  const _unusedChoices = Array.isArray(choices) ? choices : [];
  void _unusedChoices;
  const lang = uiLang(state);
  if (structuredActions.length === 0) {
    const hasLegacyActions = Array.isArray(uiPayload.actions) && uiPayload.actions.length > 0;
    if (hasLegacyActions) {
      setInlineNotice(uiText(lang, "error.contract.body", ""));
    }
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "flex";
  const isLoading = getIsLoading();
  for (const action of structuredActions) {
    const labelKey = String(action.labelKey || "").trim();
    const labelFromPayload = stripInlineText(String(action.label || "")).trim();
    const label = labelFromPayload || (labelKey ? String(t(lang, labelKey) || "").trim() : "");
    const actionCode = String(action.actionCode || "").trim();
    if (!label || !actionCode) continue;
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = isLoading;
    btn.addEventListener("click", () => {
      if (getIsLoading()) return;
      callRunStep(actionCode);
    });
    wrap.appendChild(btn);
  }
  if (wrap.childNodes.length === 0) {
    wrap.style.display = "none";
    setInlineNotice(t(lang, "optionsDisplayError"));
  }
}

function renderComparePanel(resultData: Record<string, unknown>, lang: string): boolean {
  const wrap = document.getElementById("compareWrap");
  const feedbackEl = document.getElementById("compareFeedback");
  const userTextEl = document.getElementById("compareUserText");
  const userListEl = document.getElementById("compareUserList");
  const suggestionTextEl = document.getElementById("compareSuggestionText");
  const suggestionListEl = document.getElementById("compareSuggestionList");
  const retainedWrapEl = document.getElementById("compareRetained");
  const retainedHeadingEl = document.getElementById("compareRetainedHeading");
  const retainedListEl = document.getElementById("compareRetainedList");
  const instructionEl = document.getElementById("compareInstruction");
  const userBtn = document.getElementById("comparePickUser") as HTMLButtonElement | null;
  const suggestionBtn = document.getElementById("comparePickSuggestion") as HTMLButtonElement | null;
  if (
    !wrap ||
    !feedbackEl ||
    !userTextEl ||
    !userListEl ||
    !suggestionTextEl ||
    !suggestionListEl ||
    !retainedWrapEl ||
    !retainedHeadingEl ||
    !retainedListEl ||
    !instructionEl ||
    !userBtn ||
    !suggestionBtn
  ) {
    return false;
  }

  const uiPayload =
    resultData && typeof resultData.ui === "object" && resultData.ui
      ? (resultData.ui as Record<string, unknown>)
      : {};
  const pendingInteraction = readPendingInteraction(uiPayload);
  if (!pendingInteraction) {
    (wrap as HTMLElement).style.display = "none";
    return false;
  }
  const mode = pendingInteraction.renderModel.mode;
  const feedbackReasonText = pendingInteraction.renderModel.feedbackReasonText;
  const userText = pendingInteraction.renderModel.userText;
  const suggestionText = pendingInteraction.renderModel.suggestionText;
  const userLabelFromPayload = pendingInteraction.renderModel.userLabel;
  const suggestionLabelFromPayload = pendingInteraction.renderModel.suggestionLabel;
  const userItems = pendingInteraction.renderModel.userItems;
  const suggestionItems = pendingInteraction.renderModel.suggestionItems;
  const userPickAction = pendingInteraction.allowedActions.find((action) => action.role === "compare_pick_user") || null;
  const suggestionPickAction = pendingInteraction.allowedActions.find((action) => action.role === "compare_pick_suggestion") || null;
  const instruction = pendingInteraction.renderModel.instruction || t(lang, "compareInstruction");
  const instructionParts = {
    retainedHeading: pendingInteraction.renderModel.retainedHeading,
    retainedItems: pendingInteraction.renderModel.retainedItems,
    instructionText: instruction,
  };
  const ensureLabelColon = (value: string): string => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /[:]\s*$/.test(trimmed) ? trimmed : `${trimmed}:`;
  };
  const userLabel = userLabelFromPayload
    ? ensureLabelColon(userLabelFromPayload)
    : ensureLabelColon(t(lang, "compareHeading"));
  const suggestionLabel = suggestionLabelFromPayload
    ? ensureLabelColon(suggestionLabelFromPayload)
    : ensureLabelColon(t(lang, "compareSuggestionLabel"));
  const normalizeListItem = (value: unknown): string =>
    String(value || "")
      .replace(/^\s*(?:[-*•·]\s+|\d+[\.\)]\s+)/, "")
      .trim();

  (feedbackEl as HTMLElement).innerHTML = "";
  if (feedbackReasonText) {
    renderStructuredText(feedbackEl, feedbackReasonText);
  }
  (feedbackEl as HTMLElement).style.display = feedbackReasonText ? "block" : "none";
  retainedHeadingEl.textContent = instructionParts.retainedHeading;
  retainedListEl.innerHTML = "";
  for (const item of instructionParts.retainedItems) {
    const li = document.createElement("li");
    li.textContent = item;
    retainedListEl.appendChild(li);
  }
  (retainedWrapEl as HTMLElement).style.display =
    instructionParts.retainedHeading && instructionParts.retainedItems.length > 0 ? "block" : "none";
  instructionEl.textContent = instructionParts.instructionText || instruction;
  userTextEl.textContent = userLabel || uiText(lang, "compareHeading", "");
  suggestionTextEl.textContent =
    suggestionLabel || uiText(lang, "compareSuggestionLabel", "");

  if (mode === "list") {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "block";
    (suggestionListEl as HTMLElement).style.display = "block";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    for (const item of userItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = normalizeListItem(item);
      userListEl.appendChild(li);
    }
    for (const item of suggestionItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = normalizeListItem(item);
      suggestionListEl.appendChild(li);
    }
    userBtn.textContent =
      String(userPickAction?.label || "").trim() ||
      uiText(lang, "compare.chooseVersion", "");
    suggestionBtn.textContent =
      String(suggestionPickAction?.label || "").trim() ||
      uiText(lang, "compare.chooseVersion", "");
  } else {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "none";
    (suggestionListEl as HTMLElement).style.display = "none";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    userBtn.textContent = userText || uiText(lang, "compare.useInputFallback", "");
    suggestionBtn.textContent = suggestionText || suggestionLabel;
  }
  userBtn.disabled = getIsLoading();
  suggestionBtn.disabled = getIsLoading();
  (wrap as HTMLElement).style.display = "flex";
  return true;
}

export function render(overrideToolOutput?: unknown): void {
  const data = toolData(overrideToolOutput);

  if (data && Object.keys(data).length) setLastToolOutput(data);

  const resolved = resolveWidgetPayload(data);
  const result = resolved.result;
  const state = (result?.state as Record<string, unknown>) || {};
  const startupPayloadMissing =
    Object.keys(result || {}).length === 0 &&
    Object.keys(state).length === 0;
  if (!startupPayloadMissing) revealWidgetRoot();
  const errorObj = result?.error as { type?: string; user_message?: string; retry_after_ms?: number; reason?: string } | null;
  const transientError = errorObj && (errorObj.type === "rate_limited" || errorObj.type === "timeout");
  const uiPayload =
    result?.ui && typeof result.ui === "object"
      ? (result.ui as Record<string, unknown>)
      : {};
  const uiFlags =
    uiPayload && typeof uiPayload.flags === "object" && uiPayload.flags
      ? (uiPayload.flags as Record<string, unknown>)
      : {};
  const uiI18n =
    uiPayload && typeof uiPayload.i18n === "object" && uiPayload.i18n
      ? (uiPayload.i18n as Record<string, unknown>)
      : {};
  void uiI18n;

  const overrideStrings =
    (state?.ui_strings && typeof state.ui_strings === "object" ? state.ui_strings : null);
  const overrideLang = String((state?.ui_strings_lang || "") as string)
    .trim()
    .toLowerCase();
  const localeCandidate = resolved.resolved_language ||
    String((state?.language || "") as string).trim().toLowerCase();
  const lang = overrideLang || localeCandidate || "en";

  const latestRoot = (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__;
  const latestState = latestRoot?.state && typeof latestRoot.state === "object"
    ? (latestRoot.state as Record<string, unknown>)
    : {};
  const stateForLatest = retainCanonicalStepContinuity(
    Object.keys(state).length > 0 ? state : latestState,
    latestState
  );
  (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ = {
    state: stateForLatest,
    lang,
  };

  const uiView =
    uiPayload && typeof uiPayload.view === "object" && uiPayload.view
      ? (uiPayload.view as Record<string, unknown>)
      : {};
  const uiStringsStatus = String((state?.ui_strings_status || "")).trim().toLowerCase();
  const actionLiveness = readActionLiveness(result, state);
  const hasExplicitActionError =
    Boolean(actionLiveness) &&
    (String(actionLiveness?.ack_status || "") !== "accepted" || actionLiveness?.state_advanced !== true);
  const viewModeRaw = String(uiView.mode || "").trim().toLowerCase();
  const viewMode =
    viewModeRaw === "waiting_locale" ||
    viewModeRaw === "recovery" ||
    viewModeRaw === "blocked" ||
    viewModeRaw === "failed"
      ? "prestart"
      : viewModeRaw;
  const uiGateReason = String((state?.ui_gate_reason || "")).trim().toLowerCase();
  const serverExplicitWaiting = false;
  const serverExplicitPrestart = viewMode === "prestart";
  const serverExplicitInteractive = viewMode === "interactive";
  const serverExplicitRecovery = false;
  const serverExplicitBlocked = false;
  const serverExplicitFailed = false;
  const hasExplicitServerRouting =
    serverExplicitWaiting ||
    serverExplicitPrestart ||
    serverExplicitInteractive ||
    serverExplicitRecovery ||
    serverExplicitBlocked ||
    serverExplicitFailed;
  const overrideStringsMap = overrideStrings as Record<string, string> | null;
  const hasOverrideStrings = Boolean(overrideStringsMap) && Object.keys(overrideStringsMap || {}).length > 0;
  if (hasOverrideStrings) setRuntimeUiStrings(overrideStringsMap);
  const badge = document.getElementById("badge");
  const inputWrap = document.getElementById("inputWrap");
  const btnStart = document.getElementById("btnStart");
  const startHint = document.getElementById("startHint");
  const primaryActionWrap = document.getElementById("primaryActionWrap");
  const auxiliaryActionWrap = document.getElementById("auxiliaryActionWrap");
  if (!inputWrap || !btnStart || !startHint) return;
  const isLoading = getIsLoading();
  const startActionCode = actionCodeForRole(result, "start");
  const hasStartAction = startActionCode.length > 0;
  if (!hasExplicitServerRouting) {
    console.warn("[ui_contract_missing_view_mode_fail_closed]", {
      payload_source: resolved.source,
      view_mode: viewMode || "",
      ui_gate_status: String((state?.ui_gate_status || "")).trim().toLowerCase(),
      bootstrap_phase: String((state?.bootstrap_phase || "")).trim().toLowerCase(),
    });
    const choiceWrap = document.getElementById("choiceWrap");
    const compareWrap = document.getElementById("compareWrap");
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    const uiSubtitle = document.getElementById("uiSubtitle");
    const sectionTitleEl = document.getElementById("sectionTitle");
    inputWrap.style.display = "none";
    if (choiceWrap) choiceWrap.style.display = "none";
    if (compareWrap) compareWrap.style.display = "none";
    if (primaryActionWrap) (primaryActionWrap as HTMLElement).style.display = "none";
    if (auxiliaryActionWrap) (auxiliaryActionWrap as HTMLElement).style.display = "none";
    if (prompt) prompt.textContent = "";
    if (uiSubtitle) {
      uiSubtitle.textContent = "";
      (uiSubtitle as HTMLElement).style.display = "none";
    }
    if (sectionTitleEl) sectionTitleEl.textContent = getSectionTitle(lang, "step_0", "");
    (btnStart as HTMLElement).style.display = "none";
    if (badge) {
      badge.textContent = "";
      (badge as HTMLElement).style.display = "none";
    }
    if (cardDesc) {
      const blockedEl = cardDesc as HTMLElement;
      blockedEl.classList.remove("has-grid");
      blockedEl.classList.remove("is-step0-ask-layout");
      renderContractFailureState(blockedEl, lang, "ui_view_mode_missing", "");
    }
    startHint.textContent = uiText(lang, "error.contract.body", "");
    (startHint as HTMLElement).style.display = startHint.textContent ? "block" : "none";
    setInlineNotice(uiText(lang, "error.contract.body", ""));
    if (isLoading) setLoading(false);
    return;
  }

  if (transientError) {
    if (errorObj.type === "rate_limited") {
      setInlineNotice(
        errorObj.user_message ||
          uiText(lang, "transient.rate_limited", "")
      );
      lockRateLimit(errorObj.retry_after_ms ?? 1500);
    } else {
      setInlineNotice(
        errorObj.user_message ||
          uiText(lang, "transient.timeout", "")
      );
    }
    if (result?.ok === false) return;
  } else {
    if (hasExplicitActionError && actionLiveness) {
      const livenessNotice = resolveActionLivenessNotice(state, actionLiveness);
      setInlineNotice(livenessNotice.message);
    } else {
      clearInlineNotice();
    }
  }

  const showPreStart = serverExplicitPrestart;

  const current = !showPreStart ? (state.current_step as string) || "step_0" : "step_0";
  const idx = stepIndex(current);
  const stepTitle = serverExplicitWaiting
    ? ""
    : stepperLabelForLang(current, lang) || extractStepTitle(current, lang);
  buildStepper(idx, stepTitle, lang);
  if (badge) badge.textContent = String(idx + 1).padStart(2, "0");

  const compareContractFailureReason = readCompareContractFailureReason(uiPayload);
  const contractFailureReason =
    errorObj?.type === "contract_warning"
      ? String(errorObj.reason || state.reason_code || "contract_violation").trim().toLowerCase()
      : compareContractFailureReason;
  if (contractFailureReason) {
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const compareWrap = document.getElementById("compareWrap");
    if (compareWrap) compareWrap.style.display = "none";
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    const uiSubtitle = document.getElementById("uiSubtitle");
    if (prompt) prompt.textContent = "";
    if (uiSubtitle) {
      uiSubtitle.textContent = "";
      (uiSubtitle as HTMLElement).style.display = "none";
    }
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    (btnStart as HTMLElement).style.display = "none";
    if (primaryActionWrap) (primaryActionWrap as HTMLElement).style.display = "none";
    if (auxiliaryActionWrap) (auxiliaryActionWrap as HTMLElement).style.display = "none";
    if (cardDesc) {
      const blockedEl = cardDesc as HTMLElement;
      blockedEl.classList.remove("has-grid");
      blockedEl.classList.remove("is-step0-ask-layout");
      renderContractFailureState(
        blockedEl,
        lang,
        contractFailureReason,
        String(errorObj?.user_message || "")
      );
    }
    setInlineNotice(uiText(lang, "error.contract.body", ""));
    if (isLoading) setLoading(false);
    return;
  }

  if (serverExplicitWaiting || serverExplicitRecovery || serverExplicitBlocked || serverExplicitFailed) {
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const compareWrap = document.getElementById("compareWrap");
    if (compareWrap) compareWrap.style.display = "none";
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    const uiSubtitle = document.getElementById("uiSubtitle");
    if (badge) {
      badge.textContent = "";
      (badge as HTMLElement).style.display = "none";
    }
    const waitingSectionTitle = document.getElementById("sectionTitle");
    if (waitingSectionTitle) waitingSectionTitle.textContent = "";
    if (cardDesc) {
      const prestartEl = cardDesc as HTMLElement;
      prestartEl.classList.remove("has-grid");
      prestartEl.classList.remove("is-step0-ask-layout");
      renderPrestartContent(prestartEl, lang);
    }
    if (prompt) prompt.textContent = "";
    if (uiSubtitle) {
      uiSubtitle.textContent = "";
      (uiSubtitle as HTMLElement).style.display = "none";
    }
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    (btnStart as HTMLElement).style.display = "none";
    if (primaryActionWrap) (primaryActionWrap as HTMLElement).style.display = "none";
    if (auxiliaryActionWrap) (auxiliaryActionWrap as HTMLElement).style.display = "none";
    setSessionStarted(false);
    setSessionWelcomeShown(false);
    if (isLoading) setLoading(false);
    return;
  }

  setStaticStrings(lang);

  const specialist = (result?.specialist as Record<string, unknown>) || {};
  const sectionTitleEl = document.getElementById("sectionTitle");
  const showStepIntroChrome = uiFlags.show_step_intro_chrome === true;
  const showBadge = showPreStart || showStepIntroChrome;
  if (badge) {
    (badge as HTMLElement).style.display = showBadge ? "block" : "none";
  }

  if (sectionTitleEl) {
    if (showPreStart && current === "step_0") {
      sectionTitleEl.textContent = getSectionTitle(lang, "step_0", "");
    } else if (!showPreStart && current !== "step_0" && showStepIntroChrome) {
      const businessName = String((state?.business_name || "")).trim();
      sectionTitleEl.textContent = getSectionTitle(lang, current, businessName);
    } else {
      sectionTitleEl.textContent = "";
    }
  }

  const activeSpecialist = String(state?.active_specialist || "");
  const dreamRuntimeMode = (() => {
    const raw = String((state as Record<string, unknown> | undefined)?.__dream_runtime_mode || "").trim();
    if (raw === "builder_collect" || raw === "builder_scoring" || raw === "builder_refine") return raw;
    return "self";
  })();
  const isDreamExplainerMode = current === "dream" && dreamRuntimeMode !== "self";
  const lastSpecialist = (state?.last_specialist_result as Record<string, unknown>) || {};
  const isDreamStepPreExercise = false;

  if (showPreStart) {
    const startActions = surfaceActionsForResult(result, "primary", lang).filter(
      (action) => action.role === "start"
    );
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const compareWrap = document.getElementById("compareWrap");
    if (compareWrap) compareWrap.style.display = "none";
    (btnStart as HTMLElement).style.display = "none";
    renderActionSurfaceButtons({
      containerId: "primaryActionWrap",
      actions: startActions,
      className: "btn primary",
    });
    if (auxiliaryActionWrap) (auxiliaryActionWrap as HTMLElement).style.display = "none";
    if (!hasStartAction) {
      console.warn("[ui_contract_missing_start_action]", {
        current_step: String((state?.current_step || "")).trim() || "step_0",
        ui_gate_status: String((state?.ui_gate_status || "")).trim().toLowerCase(),
      });
    }
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    if (cardDesc) {
      const prestartEl = cardDesc as HTMLElement;
      prestartEl.classList.remove("has-grid");
      prestartEl.classList.remove("is-step0-ask-layout");
      renderPrestartContent(prestartEl, lang);
    }
    if (prompt) prompt.textContent = "";
    if (!hasStartAction) {
      startHint.textContent = uiText(lang, "error.contract.body", "");
      (startHint as HTMLElement).style.display = "block";
    } else {
      startHint.textContent = "";
      (startHint as HTMLElement).style.display = "none";
    }
    if (isLoading) setLoading(false);
    (btnStart as HTMLButtonElement).disabled = getIsLoading() || !hasStartAction;
    return;
  }

  inputWrap.style.display = "none";
  inputWrap.classList.toggle("is-step0-ask-layout", current === "step_0");
  (btnStart as HTMLElement).style.display = "none";
  startHint.textContent = "";
  (startHint as HTMLElement).style.display = "none";

  const isDreamDirectionView =
    current === "dream" && String(state.dream_awaiting_direction || "").trim() === "true";

  const uiViewVariant = String((uiView.variant || "")).trim();
  const dreamBuilderContract = readDreamBuilderContract(uiPayload);
  const dreamBuilderPhase = dreamBuilderContract?.phase || "";
  const isViewModeDreamBuilderCollect =
    uiViewVariant === "dream_builder_collect" || dreamBuilderPhase === "collect";
  const isViewModeDreamBuilderRefine =
    uiViewVariant === "dream_builder_refine" || dreamBuilderPhase === "refine";
  const isViewModeDreamBuilderScoring =
    uiViewVariant === "dream_builder_scoring" || dreamBuilderPhase === "scoring";
  const dreamBuilderViewContract = readDreamBuilderViewContract(uiView);
  const uiQuestionText = String(uiPayload.questionText || "").trim();
  const compareActive = shouldSuppressMainCardForCompare(uiPayload);
  const isViewModeCompare = compareActive;
  const singleValueContent = compareActive ? null : readSingleValueCardContent(uiPayload);
  const structuredSuggestionsContent = compareActive
    ? null
    : decorateStructuredSuggestionItemsForStep({
        stepId: current,
        lang,
        content: readStructuredSuggestionsCardContent(uiPayload),
      });
  const structuredActions = choiceActionsForResult(result);
  const hasStructuredActions = structuredActions.length > 0;
  const promptBody =
    uiPayload.prompt && typeof (uiPayload.prompt as Record<string, unknown>).body === "string"
      ? String((uiPayload.prompt as Record<string, unknown>).body || "")
      : "";
  const promptRaw = (
    uiQuestionText ||
    String(specialist.question || "").trim() ||
    (result?.prompt && typeof result.prompt === "string" ? result.prompt : "") ||
    promptBody
  ) as string;
  const bodyRaw = resolveWidgetBodyText({
    currentStep: current,
    resultText: result?.text,
    specialist,
    promptBody,
    dreamBuilderViewContract,
    isDreamBuilderRefineView: isViewModeDreamBuilderRefine,
  });
  let promptSource = promptRaw;
  let body: string;
  if (isDreamDirectionView && promptSource) {
    body = promptSource;
  } else {
    body = bodyRaw || "";
  }
  const cardDescEl = document.getElementById("cardDesc");
  const promptFailureEl = document.getElementById("prompt");
  const uiSubtitleFailureEl = document.getElementById("uiSubtitle");

  const hasSemanticCardContent = Boolean(singleValueContent) || Boolean(structuredSuggestionsContent);
  const hasBodyContent = stripInlineText(String(body || "")).trim().length > 0;
  const hasPromptContent = stripInlineText(String(promptSource || "")).trim().length > 0;
  const contractOwner = readUiContractOwner(result);
  const hasSpecialOwner = contractOwner === "no_feedback" || contractOwner === "terminal";
  const hasRenderableInteractiveContent =
    compareActive ||
    Boolean(dreamBuilderContract) ||
    hasSemanticCardContent ||
    hasBodyContent ||
    hasPromptContent ||
    hasStructuredActions ||
    hasSpecialOwner;
  if (!hasRenderableInteractiveContent) {
    console.warn("[ui_contract_interactive_content_absent]", {
      current_step: current,
      view_mode: viewMode || "",
      payload_source: resolved.source,
      reason_code: "interactive_content_absent",
      has_body_content: hasBodyContent,
      has_prompt_content: hasPromptContent,
      has_structured_actions: hasStructuredActions,
      contract_owner: contractOwner,
    });
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const compareWrap = document.getElementById("compareWrap");
    if (compareWrap) compareWrap.style.display = "none";
    if (promptFailureEl) promptFailureEl.textContent = "";
    if (uiSubtitleFailureEl) {
      uiSubtitleFailureEl.textContent = "";
      (uiSubtitleFailureEl as HTMLElement).style.display = "none";
    }
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    (btnStart as HTMLElement).style.display = "none";
    if (primaryActionWrap) (primaryActionWrap as HTMLElement).style.display = "none";
    if (auxiliaryActionWrap) (auxiliaryActionWrap as HTMLElement).style.display = "none";
    if (cardDescEl) {
      const blockedEl = cardDescEl as HTMLElement;
      blockedEl.classList.remove("has-grid");
      blockedEl.classList.remove("is-step0-ask-layout");
      renderContractFailureState(blockedEl, lang, "ui_interactive_content_absent", "");
    }
    setInlineNotice(uiText(lang, "error.contract.body", ""));
    if (isLoading) setLoading(false);
    return;
  }

  if (cardDescEl) {
    cardDescEl.style.display = "block";
    cardDescEl.classList.add("has-grid");
    const isBenProfile = String((specialist as Record<string, unknown>).meta_topic || "").trim().toUpperCase() === "BEN_PROFILE";
    const isStep0AskLayout = current === "step_0" && !isBenProfile;
    const shouldAppendDreamStepVideo =
      current === "dream" &&
      showStepIntroChrome &&
      dreamRuntimeMode === "self" &&
      !isDreamDirectionView &&
      !compareActive;
    const shouldAppendPurposeStepVideo =
      shouldRenderPurposeStepIntroVideo({
        currentStep: current,
        showStepIntroChrome,
        compareActive,
        lang,
      });
    const shouldAppendBigWhyStepVideo =
      shouldRenderBigWhyStepIntroVideo({
        currentStep: current,
        showStepIntroChrome,
        compareActive,
        lang,
      });
    const shouldAppendRoleStepVideo =
      shouldRenderRoleStepIntroVideo({
        currentStep: current,
        showStepIntroChrome,
        compareActive,
        lang,
      });
    cardDescEl.classList.toggle("is-step0-ask-layout", isStep0AskLayout);
    cardDescEl.classList.toggle("is-ben-profile", isBenProfile);
    const renderedSemanticContent =
      renderStructuredSuggestionsCardContent(cardDescEl, structuredSuggestionsContent) ||
      renderSingleValueCardContent(cardDescEl, singleValueContent);
    if (!renderedSemanticContent && !compareActive) {
      renderStructuredText(cardDescEl, body || "");
      if (shouldAppendDreamStepVideo) {
        appendDreamStepIntroVideo(cardDescEl, lang);
      } else if (shouldAppendPurposeStepVideo) {
        appendPurposeStepIntroVideo(cardDescEl, lang);
      } else if (shouldAppendBigWhyStepVideo) {
        appendBigWhyStepIntroVideo(cardDescEl, lang);
      } else if (shouldAppendRoleStepVideo) {
        appendRoleStepIntroVideo(cardDescEl, lang);
      }
    }
    if (isBenProfile) {
      prependBenProfileAvatar(cardDescEl);
      prependBenProfileVideo(cardDescEl, lang);
    }
  }

  const previewWrap = document.getElementById("presentationPreview");
  const previewImg = document.getElementById("presentationThumb") as HTMLImageElement;
  const previewLink = document.getElementById("presentationThumbLink") as HTMLAnchorElement;
  const previewDownload = document.getElementById("presentationDownload") as HTMLAnchorElement;
  const presentationAssets = result?.presentation_assets as { png_url?: string; pdf_url?: string } | null;
  if (previewWrap && previewImg && previewLink && previewDownload) {
    if (presentationAssets?.png_url && presentationAssets?.pdf_url) {
      previewWrap.classList.add("visible");
      previewImg.src = String(presentationAssets.png_url);
      previewLink.href = String(presentationAssets.pdf_url);
      previewDownload.href = String(presentationAssets.pdf_url);
    } else {
      previewWrap.classList.remove("visible");
      previewImg.removeAttribute("src");
      previewLink.removeAttribute("href");
      previewDownload.removeAttribute("href");
    }
  }

  applyPendingWidgetScroll();

  const purposeInstructionHintEl = document.getElementById("purposeInstructionHint");
  if (purposeInstructionHintEl) {
    const showPurposeHint =
      current === "purpose" &&
      (uiFlags.showPurposeHint as boolean) === true;
    if (showPurposeHint) {
      purposeInstructionHintEl.style.display = "block";
      purposeInstructionHintEl.textContent = uiText(
        lang,
        "purposeInstructionHint",
        ""
      );
    } else {
      purposeInstructionHintEl.style.display = "none";
    }
  }

  const statementsPanelEl = document.getElementById("statementsPanel");
  const statementsTitleEl = document.getElementById("statementsTitle");
  const statementsCountEl = document.getElementById("statementsCount");
  const statementsListEl = document.getElementById("statementsList");
  const specialistStatements = (result?.specialist as Record<string, unknown>)?.statements;
  const canonicalDreamStatements =
    Array.isArray(state.dream_builder_statements) &&
    (state.dream_builder_statements as unknown[]).length > 0
      ? (state.dream_builder_statements as string[])
      : [];
  let statementsArray =
    dreamBuilderContract?.statements && dreamBuilderContract.statements.length > 0
      ? dreamBuilderContract.statements
      : canonicalDreamStatements.length > 0
        ? canonicalDreamStatements
        : (Array.isArray(specialistStatements) ? (specialistStatements as string[]) : []);
  const lastStatements = Array.isArray((lastSpecialist as { statements?: unknown[] }).statements)
    ? (lastSpecialist as { statements: unknown[] }).statements
    : [];
  if (
    current === "dream" &&
    isDreamExplainerMode &&
    (!statementsArray || statementsArray.length === 0)
  ) {
    if (lastStatements.length > 0) {
      statementsArray = lastStatements as string[];
    } else if (canonicalDreamStatements.length > 0) {
      statementsArray = canonicalDreamStatements;
    }
  }

  const isScoringView =
    current === "dream" &&
    dreamBuilderContract?.phase === "scoring";

  if (isScoringView) {
    const clusters = (dreamBuilderContract?.scoring?.clusters || []).map((cluster) => ({
      statement_indices: cluster.statementIndices,
      theme: cluster.theme,
    }));
    if (cardDescEl) cardDescEl.style.display = "none";
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const compareWrap = document.getElementById("compareWrap");
    if (compareWrap) compareWrap.style.display = "none";
    const showPrompt = document.getElementById("prompt");
    if (showPrompt) {
      showPrompt.textContent = t(lang, "scoringDreamQuestion");
      showPrompt.style.display = "none";
    }
    inputWrap.style.display = "flex";

    const scoringPanelEl = document.getElementById("scoringPanel");
    if (scoringPanelEl) {
      scoringPanelEl.classList.add("visible");
      scoringPanelEl.style.display = "block";
    }
    const scoringIntro = document.getElementById("scoringIntro");
    if (scoringIntro) {
      const introLines = [t(lang, "scoringIntro1"), t(lang, "scoringIntro2"), t(lang, "scoringIntro3")]
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      scoringIntro.textContent = introLines.join("\n");
    }

    const win = globalThis as unknown as {
      __dreamScoringScores?: unknown[][];
      __dreamScoringScoreByStatement?: Record<string, string>;
    };
    win.__dreamScoringScores = buildInitialDreamScoringScores({
      clientScores: win.__dreamScoringScores,
      clientScoreMap: win.__dreamScoringScoreByStatement,
      persistedScores: dreamBuilderContract?.scoring?.scores || [],
      statements: statementsArray,
      clusters,
    });
    const scoringScores = win.__dreamScoringScores;
    if (!win.__dreamScoringScoreByStatement || typeof win.__dreamScoringScoreByStatement !== "object") {
      win.__dreamScoringScoreByStatement = {};
    }
    const scoringScoreByStatement = win.__dreamScoringScoreByStatement;

    const scoringClustersEl = document.getElementById("scoringClusters");
    if (!scoringClustersEl) return;
    scoringClustersEl.innerHTML = "";
    for (let cii = 0; cii < clusters.length; cii++) {
      const cluster = clusters[cii];
      const indices = cluster.statement_indices || [];
      const themeName = String(cluster.theme || "").trim();
      const clusterDiv = document.createElement("div");
      clusterDiv.className = "scoringCluster";
      clusterDiv.setAttribute("data-cluster-index", String(cii));
      let filled = 0,
        sum = 0;
      for (let si = 0; si < indices.length; si++) {
        const v = scoringScores[cii][si];
        const n = Number(v);
        if (v !== "" && v !== undefined && !isNaN(n) && n >= 1 && n <= 10) {
          filled++;
          sum += n;
        }
      }
      const avgText = filled === 0 ? uiText(lang, "scoring.avg.empty", "") : (sum / filled).toFixed(1);
      const showStats = filled > 0;
      const avgHtml = showStats
        ? '<span class="avgScore">' + t(lang, "scoringAvg").replace("X", avgText) + "</span>"
        : "";
      clusterDiv.innerHTML =
        '<div class="scoringClusterHeader"><span class="themeName">' +
        escapeHtml(themeName) +
        "</span>" +
        avgHtml +
        '</div><div class="scoringClusterRows"></div>';
      const rowsEl = clusterDiv.querySelector(".scoringClusterRows");
      for (let si = 0; si < indices.length; si++) {
        const stIdx = indices[si];
        const numIdx = typeof stIdx !== "number" ? parseInt(String(stIdx), 10) : stIdx;
        if (isNaN(numIdx) || numIdx < 0 || !statementsArray || numIdx >= statementsArray.length)
          continue;
        const stText = statementsArray[numIdx];
        const row = document.createElement("div");
        row.className = "scoringRow";
        const stSpan = document.createElement("span");
        stSpan.className = "statementText";
        stSpan.textContent = stText;
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.className = "scoreInput";
        input.setAttribute("data-cluster", String(cii));
        input.setAttribute("data-statement", String(si));
        const rawVal = scoringScores[cii][si];
        const numVal = rawVal !== "" && rawVal !== undefined ? Number(rawVal) : NaN;
        input.value =
          !isNaN(numVal) && numVal >= 1 && numVal <= 10 ? String(Math.round(numVal)) : "";
        input.placeholder = uiText(lang, "scoring.input.placeholder", "");
        input.setAttribute("aria-label", uiText(lang, "scoring.aria.scoreInput", ""));
        row.appendChild(stSpan);
        row.appendChild(input);
        if (rowsEl) rowsEl.appendChild(row);
      }
      scoringClustersEl.appendChild(clusterDiv);
    }

    function updateScoringClusterHeader(ci: number): void {
      const clusterDiv = document.querySelector(
        '.scoringCluster[data-cluster-index="' + ci + '"]'
      );
      if (!clusterDiv) return;
      const indices = clusters[ci].statement_indices || [];
      let filled = 0,
        sum = 0;
      for (let si = 0; si < indices.length; si++) {
        const v = scoringScores[ci][si];
        const n = Number(v);
        if (v !== "" && v !== undefined && !isNaN(n) && n >= 1 && n <= 10) {
          filled++;
          sum += n;
        }
      }
      const avgText = filled === 0 ? uiText(lang, "scoring.avg.empty", "") : (sum / filled).toFixed(1);
      const themeName = String(clusters[ci].theme || "").trim();
      const showStats = filled > 0;
      const avgHtml = showStats
        ? '<span class="avgScore">' + t(lang, "scoringAvg").replace("X", avgText) + "</span>"
        : "";
      const headerEl = clusterDiv.querySelector(".scoringClusterHeader");
      if (headerEl)
        headerEl.innerHTML =
          '<span class="themeName">' + escapeHtml(themeName) + "</span>" + avgHtml;
    }

    function allScoringFilled(): boolean {
      for (let ci = 0; ci < clusters.length; ci++) {
        for (let si = 0; si < (scoringScores[ci] || []).length; si++) {
          const v = scoringScores[ci][si];
          const n = Number(v);
          if (v === "" || v === undefined || isNaN(n) || n < 1 || n > 10) return false;
        }
      }
      return true;
    }

    function syncScoringScoreMap(): void {
      for (let ci = 0; ci < clusters.length; ci++) {
        const indices = clusters[ci].statement_indices || [];
        for (let si = 0; si < indices.length; si++) {
          const stIdx = typeof indices[si] !== "number" ? parseInt(String(indices[si]), 10) : indices[si];
          if (isNaN(stIdx) || stIdx < 0 || stIdx >= statementsArray.length) continue;
          const statementText = String(statementsArray[stIdx] || "").trim();
          if (!statementText) continue;
          const normalized = normalizeDreamScoreValue(scoringScores[ci][si]);
          if (normalized) {
            scoringScoreByStatement[statementText] = normalized;
          } else {
            delete scoringScoreByStatement[statementText];
          }
        }
      }
    }

    function updateScoringDreamQuestionVisibility(): void {
      const filled = allScoringFilled();
      const promptEl = document.getElementById("prompt");
      if (promptEl) promptEl.style.display = filled ? "block" : "none";
    }

    function syncScoringActionAvailability(): void {
      const scoreSubmitEnabled = allScoringFilled();
      document.querySelectorAll('[data-bsc-action-role="score_submit"]').forEach((button) => {
        const submitButton = button as HTMLButtonElement;
        submitButton.disabled = getIsLoading() || !scoreSubmitEnabled;
        submitButton.style.display = "";
      });
      const primaryActionWrap = document.getElementById("primaryActionWrap");
      if (primaryActionWrap) {
        const hasVisibleButtons = Array.from(primaryActionWrap.querySelectorAll("button")).some(
          (button) => (button as HTMLButtonElement).style.display !== "none"
        );
        (primaryActionWrap as HTMLElement).style.display = hasVisibleButtons ? "flex" : "none";
      }
    }

    renderActionSurfaceButtons({
      containerId: "primaryActionWrap",
      actions: surfaceActionsForResult(result, "primary", lang).filter((action) => action.role !== "start"),
      className: "btn primary",
    });
    renderActionSurfaceButtons({
      containerId: "auxiliaryActionWrap",
      actions: surfaceActionsForResult(result, "auxiliary", lang),
      className: "btn",
    });

    syncScoringScoreMap();
    updateScoringDreamQuestionVisibility();
    syncScoringActionAvailability();

    scoringClustersEl.querySelectorAll(".scoreInput").forEach((input) => {
      input.addEventListener("input", () => {
        const ci = parseInt((input as HTMLElement).getAttribute("data-cluster") || "0", 10);
        const si = parseInt((input as HTMLElement).getAttribute("data-statement") || "0", 10);
        let val = (input as HTMLInputElement).value.trim();
        const n = Number(val);
        if (val !== "" && (isNaN(n) || n < 1 || n > 10)) {
          (input as HTMLInputElement).value = "";
          val = "";
        } else if (val !== "" && n >= 1 && n <= 10) {
          (input as HTMLInputElement).value = String(Math.round(n));
          val = (input as HTMLInputElement).value;
        }
        scoringScores[ci][si] = val;
        syncScoringScoreMap();
        updateScoringClusterHeader(ci);
        syncScoringActionAvailability();
        updateScoringDreamQuestionVisibility();
      });
    });

    const input = document.getElementById("input");
    if (input) {
      (input as HTMLInputElement).disabled = false;
      (input as HTMLInputElement).readOnly = false;
      (input as HTMLInputElement).placeholder = t(lang, "inputPlaceholder");
      setSendEnabled(String((input as HTMLInputElement).value || "").trim().length > 0);
    } else {
      setSendEnabled(false);
    }

    const latestScoringState = retainCanonicalStepContinuity(
      state,
      latestState
    );
    (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ =
      { state: latestScoringState, lang };

    if (isLoading) setLoading(false);
    return;
  }

  const scoringPanelPost = document.getElementById("scoringPanel");
  if (scoringPanelPost) {
    scoringPanelPost.classList.remove("visible");
    scoringPanelPost.style.display = "none";
  }
  const scoringWindow = globalThis as unknown as {
    __dreamScoringScores?: unknown[][];
    __dreamScoringScoreByStatement?: Record<string, string>;
  };
  if (!shouldRetainDreamScoringClientScores({ currentStep: current, isScoringView })) {
    scoringWindow.__dreamScoringScores = [];
    scoringWindow.__dreamScoringScoreByStatement = {};
  }
  if (cardDescEl) cardDescEl.style.display = "block";
  const promptPost = document.getElementById("prompt");
  if (promptPost) promptPost.style.display = "block";

  if (isViewModeCompare) {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  } else if (isDreamDirectionView) {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  } else if (
    current === "dream" &&
    (
      dreamBuilderViewContract.hasExplicitStatementsVisible
        ? dreamBuilderViewContract.statementsVisible
        : (isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine)
    ) &&
    Array.isArray(statementsArray) &&
    statementsArray.length > 0 &&
    statementsArray.length < 20
  ) {
    if (statementsPanelEl) statementsPanelEl.style.display = "block";
    if (statementsTitleEl)
      statementsTitleEl.textContent = t(lang, "dreamBuilder.statements.title");
    if (statementsCountEl)
      statementsCountEl.textContent = t(lang, "dreamBuilder.statements.count").replace(
        "N",
        String(statementsArray.length)
      );
    if (statementsListEl) {
      statementsListEl.innerHTML = "";
      const ordered = document.createElement("ol");
      ordered.className = "statementsListOrdered";
      for (let i = 0; i < statementsArray.length; i += 1) {
        const statementText = String(statementsArray[i] || "")
          .replace(/^\s*\d+[\.\)]\s*/, "")
          .trim();
        const li = document.createElement("li");
        li.className = "statementsListItem";

        const num = document.createElement("span");
        num.className = "statementsListNum";
        num.textContent = `${i + 1}.`;

        const text = document.createElement("span");
        text.className = "statementsListText";
        text.textContent = statementText;

        li.appendChild(num);
        li.appendChild(text);
        ordered.appendChild(li);
      }
      statementsListEl.appendChild(ordered);
    }
  } else {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  }

  const comparePanelVisible = renderComparePanel(result, lang);

  let choicesArr: Choice[] = [];
  let promptText = isDreamDirectionView ? "" : promptSource;
  const shouldStripStructuredPrompt = isViewModeCompare || !hasStructuredActions;
  if (shouldStripStructuredPrompt) {
    promptText = isDreamDirectionView ? "" : stripStructuredChoiceLines(promptSource, lang);
  } else if (hasStructuredActions) {
    promptText = isDreamDirectionView ? "" : promptSource;
  } else {
    choicesArr = [];
    promptText = isDreamDirectionView ? "" : promptSource;
  }
  if (shouldSuppressPromptForCompare({
    compareActive,
  })) {
    promptText = "";
  }

  const promptEl = document.getElementById("prompt");
  if (promptEl) {
    const hasPromptText = String(promptText || "").trim().length > 0;
    const hasBodyText = stripInlineText(String(body || "")).trim().length > 0;
    const showPromptDivider = hasPromptText && hasBodyText;
    promptEl.classList.toggle("with-divider", showPromptDivider);
    promptEl.classList.toggle("choice-pending", comparePanelVisible);
    renderInlineText(promptEl, promptText || "");
  }
  if (comparePanelVisible) {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) {
      choiceWrap.innerHTML = "";
      choiceWrap.style.display = "none";
    }
  } else {
    renderChoiceButtons(choicesArr, result);
  }

  const renderedChoiceButtons = (() => {
    const choiceWrap = document.getElementById("choiceWrap");
    if (!choiceWrap) return false;
    return choiceWrap.childNodes.length > 0;
  })();
  const choiceMode =
    !comparePanelVisible && (renderedChoiceButtons || hasStructuredActions);

  const textSubmitActionCode = actionCodeForRole(result, "text_submit");
  const textSubmitAvailable = textSubmitActionCode.length > 0;
  const dreamBuilderTextInputActive = isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine;
  const showTextSubmit = shouldShowTextInputForCompare({
    textSubmitAvailable,
    compareActive,
    dreamBuilderTextInputActive,
  });
  const disableTextSubmit = shouldDisableTextInputForCompare();
  inputWrap.style.display = showTextSubmit ? "flex" : "none";
  const inputEl = document.getElementById("input") as HTMLTextAreaElement | null;
  if (inputEl) {
    if (disableTextSubmit) inputEl.value = "";
    inputEl.disabled = disableTextSubmit;
    inputEl.readOnly = disableTextSubmit;
    inputEl.setAttribute("aria-disabled", disableTextSubmit ? "true" : "false");
    inputEl.tabIndex = disableTextSubmit ? -1 : 0;
  }
  if (!showTextSubmit || disableTextSubmit) setSendEnabled(false);
  if (choiceMode) {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "flex";
  } else {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
  }
  const primaryActions = comparePanelVisible
    ? []
    : surfaceActionsForResult(result, "primary", lang).filter((action) => action.role !== "start");
  const auxiliaryActions = comparePanelVisible
    ? []
    : surfaceActionsForResult(result, "auxiliary", lang);
  renderActionSurfaceButtons({
    containerId: "primaryActionWrap",
    actions: primaryActions,
    className: "btn primary",
  });
  renderActionSurfaceButtons({
    containerId: "auxiliaryActionWrap",
    actions: auxiliaryActions,
    className: "btn",
  });

  const debugMode = /\bdebug=1\b/.test(String(typeof window !== "undefined" ? window.location.search : ""));
  const debugEl = document.getElementById("debugOverlay");
  if (debugEl) {
    if (debugMode) {
      const debugPayload = {
        current_step: current,
        active_specialist: activeSpecialist,
        "specialist.action": String(specialist.action || ""),
        promptRaw200: (promptRaw || "").slice(0, 200),
        choicesLength: choicesArr.length,
        choiceLabels: choicesArr.map((c) => c.label),
        isDreamStepPreExercise,
        isDreamExplainerMode,
        isLoading: getIsLoading(),
      };
      debugEl.textContent = JSON.stringify(debugPayload, null, 2);
      debugEl.classList.add("visible");
      debugEl.setAttribute("aria-hidden", "false");
    } else {
      debugEl.textContent = "";
      debugEl.classList.remove("visible");
      debugEl.setAttribute("aria-hidden", "true");
    }
  }

  const input = document.getElementById("input");
  if (input) (input as HTMLInputElement).placeholder = t(lang, "inputPlaceholder");

  const inputVal = ((document.getElementById("input") as HTMLInputElement)?.value || "").trim();
  setSendEnabled(inputVal.length > 0);

  const latestInteractiveState = retainCanonicalStepContinuity(
    state,
    latestState
  );
  (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ =
    { state: latestInteractiveState, lang };

  if (getIsLoading()) setLoading(false);
}
