import { createHash } from "node:crypto";

import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { VIEW_CONTRACT_VERSION as LOCALE_START_VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import type { CanvasState } from "../core/state.js";
import {
  normalizeStringArray,
  parseRetainedInstruction,
} from "../core/ui_feedback_contract.js";
import { labelKeyForMenuAction } from "../core/menu_contract.js";
import { UI_STRINGS_DEFAULT, UI_STRINGS_WITH_MENU_KEYS } from "../i18n/ui_strings_defaults.js";
import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
import { buildCanonicalWidgetState } from "./run_step_canonical_widget_state.js";
import { dreamBuilderExerciseLabelKey } from "./dream_builder_resume.js";
import { stampResponseContentLocale } from "./locale_continuity.js";
import {
  CONTRACT_BOOTSTRAP_PHASES,
  CONTRACT_UI_FALLBACK_REASONS,
  CONTRACT_UI_GATE_REASONS,
  CONTRACT_UI_GATE_STATUSES,
  CONTRACT_UI_STRINGS_STATUSES,
  CONTRACT_UI_VIEW_MODES,
  normalizeContractLang,
  normalizeContractLocale,
} from "./ingress.js";

type RunStepContractResponse = Record<string, unknown>;
type UiActionRole =
  | "choice"
  | "start"
  | "text_submit"
  | "score_submit"
  | "compare_pick_user"
  | "compare_pick_suggestion"
  | "dream_start_exercise"
  | "dream_switch_to_self";

type UiActionSurface =
  | "choice"
  | "primary"
  | "text_input"
  | "compare_pick"
  | "auxiliary";

type PendingInteractionAllowedAction = {
  id: string;
  action_code: string;
  label: string;
  label_key: string;
  role: string;
  surface: string;
  primary: boolean;
};

type PendingInteractionCompareRenderModel = {
  mode: "text" | "list";
  variant: "default" | "clarify_dual" | "grouped_list_units";
  instruction: string;
  feedback_reason_text: string;
  user_label: string;
  suggestion_label: string;
  user_text: string;
  suggestion_text: string;
  user_items: string[];
  suggestion_items: string[];
  retained_heading: string;
  retained_items: string[];
};

type UiParityDeps = {
  parseMenuFromContractIdForStep: (contractIdRaw: unknown, stepId: string) => string;
  labelKeysForMenuActionCodes: (menuId: string, actionCodes: string[]) => string[];
};

type FinalizeContractInternalsOptions = UiParityDeps & {
  applyUiClientActionContract: (targetState: CanvasState | null | undefined) => void;
  onUiParityError: () => void;
  attachRegistryPayload: (
    payload: Record<string, unknown>,
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null
  ) => Record<string, unknown>;
};

export type CanonicalViewDecisionSnapshot = {
  started: boolean;
  ui_view_mode: string;
  interaction_state: string;
  has_renderable_content: boolean;
  has_start_action: boolean;
  is_mutable: boolean;
  editable_fields: string[];
  invariant_ok: boolean;
  reason_code: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeEditableFields(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const values = raw
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

const UI_ACTION_ROLES = new Set<UiActionRole>([
  "choice",
  "start",
  "text_submit",
  "score_submit",
  "compare_pick_user",
  "compare_pick_suggestion",
  "dream_start_exercise",
  "dream_switch_to_self",
]);

const UI_ACTION_SURFACES = new Set<UiActionSurface>([
  "choice",
  "primary",
  "text_input",
  "compare_pick",
  "auxiliary",
]);

function stripLegacyUiCompareShadows(response: RunStepContractResponse): void {
  const ui = toRecord(response.ui);
  if (Object.keys(ui).length === 0) return;
  delete ui.compare;
  delete ui.feedback_contract;
  response.ui = ui;
}

function defaultSurfaceForRole(role: UiActionRole): UiActionSurface {
  if (role === "start") return "primary";
  if (role === "text_submit") return "text_input";
  if (role === "score_submit") return "primary";
  if (role === "compare_pick_user" || role === "compare_pick_suggestion") return "compare_pick";
  if (role === "dream_start_exercise") return "choice";
  if (role === "dream_switch_to_self") return "auxiliary";
  return "choice";
}

function normalizeUiActionRole(rawRole: unknown, fallback: UiActionRole = "choice"): UiActionRole {
  const normalized = String(rawRole || "").trim();
  if (UI_ACTION_ROLES.has(normalized as UiActionRole)) return normalized as UiActionRole;
  return fallback;
}

function normalizeUiActionSurface(rawSurface: unknown, fallback: UiActionSurface): UiActionSurface {
  const normalized = String(rawSurface || "").trim();
  if (UI_ACTION_SURFACES.has(normalized as UiActionSurface)) return normalized as UiActionSurface;
  return fallback;
}

function normalizePendingInteractionAllowedAction(
  actionRaw: Record<string, unknown> | null | undefined,
  id: string
): PendingInteractionAllowedAction | null {
  const action = toRecord(actionRaw);
  const actionCode = String(action.action_code || "").trim();
  const label = String(action.label || "").trim();
  const labelKey = String(action.label_key || "").trim();
  const role = String(action.role || "").trim();
  const surface = String(action.surface || "").trim();
  if (!actionCode || !label || !labelKey || !role || !surface) return null;
  return {
    id,
    action_code: actionCode,
    label,
    label_key: labelKey,
    role,
    surface,
    primary: action.primary === true,
  };
}

function normalizePendingInteractionVariant(raw: unknown): PendingInteractionCompareRenderModel["variant"] {
  const value = String(raw || "").trim();
  if (value === "clarify_dual" || value === "grouped_list_units") return value;
  return "default";
}

function buildNormalCompareRenderModel(
  response: RunStepContractResponse
): PendingInteractionCompareRenderModel | null {
  const state = toRecord(response.state);
  const specialist = toRecord(response.specialist);
  if (String(specialist.compare_pending || "").trim() !== "true") return null;
  if (String(specialist.compare_presentation || "").trim() === "canonical") return null;
  const defaultUserLabel = uiLabelForKey(state, "compareHeading");
  const defaultSuggestionLabel = uiLabelForKey(state, "compareSuggestionLabel");
  const mode = String(specialist.compare_mode || "text").trim().toLowerCase() === "list"
    ? "list"
    : "text";
  const instructionSource = String(
    specialist.compare_instruction || specialist.compare_instruction || uiLabelForKey(state, "compareInstruction")
  ).trim();
  const parsedInstruction = parseRetainedInstruction(instructionSource);
  const feedbackReasonText = String(
    specialist.feedback_reason_text || specialist.pending_suggestion_feedback_text || ""
  ).trim();
  const userText = String(specialist.compare_user_normalized || specialist.compare_user_raw || "").trim();
  const suggestionText = String(specialist.compare_agent_current || specialist.refined_formulation || "").trim();
  const userItems = normalizeStringArray(specialist.compare_user_items);
  const suggestionItems = normalizeStringArray(specialist.compare_suggestion_items);
  const hasComparableValues =
    mode === "list"
      ? userItems.length > 0 && suggestionItems.length > 0
      : Boolean(userText && suggestionText);
  if (!feedbackReasonText || !hasComparableValues) return null;
  return {
    mode,
    variant: normalizePendingInteractionVariant(specialist.compare_variant),
    instruction: parsedInstruction.instructionText,
    feedback_reason_text: feedbackReasonText,
    user_label: String(specialist.compare_user_label || "").trim() || defaultUserLabel,
    suggestion_label: String(specialist.compare_suggestion_label || "").trim() || defaultSuggestionLabel,
    user_text: userText,
    suggestion_text: suggestionText,
    user_items: userItems,
    suggestion_items: suggestionItems,
    retained_heading: parsedInstruction.retainedHeading,
    retained_items: parsedInstruction.retainedItems,
  };
}

function buildPendingInteractionRenderModel(
  response: RunStepContractResponse
): PendingInteractionCompareRenderModel | null {
  return buildNormalCompareRenderModel(response);
}

function comparePendingInteractionId(params: {
  stepId: string;
  contractId: string;
  allowedActions: PendingInteractionAllowedAction[];
  renderModel: PendingInteractionCompareRenderModel;
}): string {
  const fingerprint = createHash("sha1")
    .update(JSON.stringify({
      step_id: params.stepId,
      contract_id: params.contractId,
      allowed_actions: params.allowedActions.map((action) => ({
        id: action.id,
        action_code: action.action_code,
        role: action.role,
      })),
      render_model: params.renderModel,
    }))
    .digest("hex")
    .slice(0, 20);
  return `pi_compare_${fingerprint}`;
}

function ensurePendingInteractionContract(response: RunStepContractResponse): void {
  const ui = toRecord(response.ui);
  const view = toRecord(ui.view);
  const actionContract = toRecord(ui.action_contract);
  const actions = Array.isArray(actionContract.actions) ? (actionContract.actions as Array<Record<string, unknown>>) : [];
  const userPickAction = normalizePendingInteractionAllowedAction(
    actions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_user"),
    "pick_user"
  );
  const suggestionPickAction = normalizePendingInteractionAllowedAction(
    actions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_suggestion"),
    "pick_suggestion"
  );
  const renderModel = buildPendingInteractionRenderModel(response);
  const state = toRecord(response.state);
  const lastSpecialist = toRecord(state.last_specialist_result);
  if (!userPickAction || !suggestionPickAction || !renderModel) {
    delete ui.pending_interaction;
    if (String(view.variant || "").trim().toLowerCase() === "text_compare") {
      delete view.variant;
    }
    ui.view = view;
    delete state.__pending_interaction_id;
    if (Object.keys(lastSpecialist).length > 0 && Object.prototype.hasOwnProperty.call(lastSpecialist, "pending_interaction_id")) {
      delete lastSpecialist.pending_interaction_id;
      state.last_specialist_result = lastSpecialist;
    }
    response.ui = ui;
    response.state = state as CanvasState;
    return;
  }

  const stepId = String(response.current_step_id || state.current_step || STEP_0_ID).trim() || STEP_0_ID;
  const contractId = String(ui.contract_id || "").trim();
  const interactionId = comparePendingInteractionId({
    stepId,
    contractId,
    allowedActions: [userPickAction, suggestionPickAction],
    renderModel,
  });
  ui.pending_interaction = {
    version: "2026-03-18.pending_interaction.v1",
    id: interactionId,
    kind: renderModel.mode === "list" ? "list_compare" : "text_compare",
    status: "pending",
    source: "server_contract",
    response_contract_id: contractId,
    allowed_actions: [userPickAction, suggestionPickAction],
    render_model: renderModel,
  };
  view.variant = "text_compare";
  ui.view = view;
  state.__pending_interaction_id = interactionId;
  if (Object.keys(lastSpecialist).length > 0) {
    lastSpecialist.pending_interaction_id = interactionId;
    state.last_specialist_result = lastSpecialist;
  }
  response.ui = ui;
  response.state = state as CanvasState;
}

function hasDreamBuilderCompareSource(ui: Record<string, unknown>): boolean {
  const dreamBuilder = toRecord(ui.dream_builder_contract);
  const dreamBuilderCompare = toRecord(dreamBuilder.compare);
  return (
    String(dreamBuilder.phase || "").trim() === "compare" &&
    (
      String(dreamBuilderCompare.kind || "").trim() === "batch_rewrite_compare" ||
      String(dreamBuilderCompare.kind || "").trim() === "overlap_merge_compare"
    )
  );
}

function hasActiveNormalCompareSource(response: RunStepContractResponse): boolean {
  const ui = toRecord(response.ui);
  const pending = toRecord(ui.pending_interaction);
  const kind = String(pending.kind || "").trim().toLowerCase();
  return (
    (kind === "text_compare" || kind === "list_compare") &&
    String(pending.status || "").trim().toLowerCase() === "pending"
  );
}

function validatePendingInteractionCompareInvariant(response: RunStepContractResponse): string | null {
  const ui = toRecord(response.ui);
  if (hasDreamBuilderCompareSource(ui)) return null;
  const view = toRecord(ui.view);
  const viewVariant = String(view.variant || "").trim().toLowerCase();
  const normalCompareActive = hasActiveNormalCompareSource(response);
  if (!normalCompareActive) {
    return viewVariant === "text_compare" ? "ui_pending_interaction_missing_for_compare" : null;
  }

  const state = toRecord(response.state);
  const pending = toRecord(ui.pending_interaction);
  if (Object.keys(pending).length === 0) {
    return "ui_pending_interaction_missing_for_compare";
  }
  if (viewVariant !== "text_compare") {
    return "ui_pending_interaction_malformed_for_compare";
  }

  const pendingKind = String(pending.kind || "").trim();
  if (
    (pendingKind !== "text_compare" && pendingKind !== "list_compare") ||
    String(pending.status || "").trim() !== "pending"
  ) {
    return "ui_pending_interaction_malformed_for_compare";
  }

  const allowedActions = Array.isArray(pending.allowed_actions)
    ? (pending.allowed_actions as Array<Record<string, unknown>>)
    : [];
  const userPickAction = normalizePendingInteractionAllowedAction(
    allowedActions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_user"),
    "pick_user"
  );
  const suggestionPickAction = normalizePendingInteractionAllowedAction(
    allowedActions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_suggestion"),
    "pick_suggestion"
  );
  const expectedRenderModel = buildPendingInteractionRenderModel(response);
  const actualRenderModel = toRecord(pending.render_model);
  if (!userPickAction || !suggestionPickAction || !expectedRenderModel) {
    return "ui_pending_interaction_malformed_for_compare";
  }

  const actualUserLabel = String(actualRenderModel.user_label || "").trim();
  const actualSuggestionLabel = String(actualRenderModel.suggestion_label || "").trim();
  if (!actualUserLabel || !actualSuggestionLabel) {
    return "ui_pending_interaction_malformed_for_compare";
  }

  const actualMode = String(actualRenderModel.mode || "").trim().toLowerCase() === "list" ? "list" : "text";
  if (
    (actualMode === "list" && pendingKind !== "list_compare") ||
    (actualMode === "text" && pendingKind !== "text_compare")
  ) {
    return "ui_pending_interaction_malformed_for_compare";
  }
  const actualUserItems = normalizeStringArray(actualRenderModel.user_items);
  const actualSuggestionItems = normalizeStringArray(actualRenderModel.suggestion_items);
  const actualUserText = String(actualRenderModel.user_text || "").trim();
  const actualSuggestionText = String(actualRenderModel.suggestion_text || "").trim();
  const hasComparableValues =
    actualMode === "list"
      ? actualUserItems.length > 0 || actualSuggestionItems.length > 0 || Boolean(actualUserText) || Boolean(actualSuggestionText)
      : Boolean(actualUserText) || Boolean(actualSuggestionText);
  if (!hasComparableValues) {
    return "ui_pending_interaction_malformed_for_compare";
  }

  if (
    actualUserLabel !== expectedRenderModel.user_label ||
    actualSuggestionLabel !== expectedRenderModel.suggestion_label
  ) {
    return "ui_pending_interaction_malformed_for_compare";
  }

  const stateUserAction = String(state.ui_action_compare_pick_user || "").trim();
  const stateSuggestionAction = String(state.ui_action_compare_pick_suggestion || "").trim();
  if (
    (stateUserAction && stateUserAction !== userPickAction.action_code) ||
    (stateSuggestionAction && stateSuggestionAction !== suggestionPickAction.action_code)
  ) {
    return "ui_pending_interaction_action_mismatch";
  }

  const actionContract = toRecord(ui.action_contract);
  const actionContractActions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>)
    : [];
  const contractUserAction = String(
    toRecord(actionContractActions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_user"))
      .action_code || ""
  ).trim();
  const contractSuggestionAction = String(
    toRecord(actionContractActions.find((action) => normalizeUiActionRole(action.role, "choice") === "compare_pick_suggestion"))
      .action_code || ""
  ).trim();
  if (
    (contractUserAction && contractUserAction !== userPickAction.action_code) ||
    (contractSuggestionAction && contractSuggestionAction !== suggestionPickAction.action_code)
  ) {
    return "ui_pending_interaction_action_mismatch";
  }

  const stepId = String(response.current_step_id || state.current_step || "").trim();
  if (stepId === "dream") {
    const content = toRecord(ui.content);
    if (Object.keys(content).length > 0) {
      return "dream_compare_generic_card_content_present";
    }
  }

  return null;
}

function hasRenderableResponseContent(response: RunStepContractResponse): boolean {
  const uiPayload = toRecord(response.ui);
  const uiPrompt = toRecord(uiPayload.prompt);
  const uiView = toRecord(uiPayload.view);
  const uiContent = toRecord(uiPayload.content);
  const uiPendingInteraction = toRecord(uiPayload.pending_interaction);
  const actionContract = toRecord(uiPayload.action_contract);
  const specialist = toRecord(response.specialist);
  const stateRecord =
    response.state && typeof response.state === "object"
      ? (response.state as Record<string, unknown>)
      : {};
  const hasActions = Array.isArray(actionContract.actions) && actionContract.actions.length > 0;
  const viewVariant = String(uiView.variant || "").trim();
  const hasDreamBuilderStatements =
    (
      uiView.dream_builder_statements_visible === true ||
      (
        (viewVariant === "dream_builder_collect" || viewVariant === "dream_builder_refine") &&
        uiView.dream_builder_statements_visible !== false
      )
    ) &&
    (
      Array.isArray(specialist.statements) && specialist.statements.length > 0 ||
      Array.isArray(stateRecord.dream_builder_statements) &&
      (stateRecord.dream_builder_statements as unknown[]).length > 0
    );
  const prompt = String(response.prompt || "").trim();
  const body =
    String(response.text || "").trim() ||
    String(uiPrompt.body || "").trim() ||
    String(specialist.message || "").trim() ||
    String(specialist.refined_formulation || "").trim();
  const question =
    String(uiPayload.questionText || "").trim() ||
    String(specialist.question || "").trim();
  const uiContentKind = String(uiContent.kind || "").trim();
  const hasStructuredContent =
    (
      uiContentKind === "structured_suggestions" &&
      (
        String(uiContent.heading || "").trim().length > 0 ||
        normalizeStringArray(uiContent.items).length > 0 ||
        String(uiContent.outro || "").trim().length > 0
      )
    ) ||
    (
      uiContentKind !== "structured_suggestions" &&
      (
        String(uiContent.heading || "").trim().length > 0 ||
        String(uiContent.canonical_text || "").trim().length > 0 ||
        String(uiContent.support_text || "").trim().length > 0 ||
        String(uiContent.feedback_reason_text || "").trim().length > 0
      )
    );
  const pendingKind = String(uiPendingInteraction.kind || "").trim().toLowerCase();
  const hasPendingCompare =
    (pendingKind === "text_compare" || pendingKind === "list_compare") &&
    String(uiPendingInteraction.status || "").trim().toLowerCase() === "pending";
  return (
    hasActions ||
    hasDreamBuilderStatements ||
    hasStructuredContent ||
    hasPendingCompare ||
    Boolean(prompt) ||
    Boolean(body) ||
    Boolean(question)
  );
}

function hasStartAction(response: RunStepContractResponse, state: Record<string, unknown>): boolean {
  if (String(state.ui_action_start || "").trim() === "ACTION_START") return true;
  const uiPayload = toRecord(response.ui);
  const actionContract = toRecord(uiPayload.action_contract);
  const actions = Array.isArray(actionContract.actions) ? (actionContract.actions as Array<Record<string, unknown>>) : [];
  return actions.some((action) => String(action?.action_code || "").trim() === "ACTION_START");
}

function uiLabelForKey(state: Record<string, unknown>, labelKey: string): string {
  const stateUiStrings = toRecord(state.ui_strings);
  const localized = String(stateUiStrings[labelKey] || "").trim();
  if (localized) return localized;
  return String(UI_STRINGS_WITH_MENU_KEYS[labelKey] || UI_STRINGS_DEFAULT[labelKey] || "").trim();
}

function actionLabelKeyMatchesState(
  state: Record<string, unknown>,
  actionCode: string,
  actualLabelKey: string,
  expectedLabelKey: string
): boolean {
  if (actualLabelKey === expectedLabelKey) return true;
  if (actionCode !== "ACTION_DREAM_INTRO_START_EXERCISE") return false;
  return actualLabelKey === dreamBuilderExerciseLabelKey(state);
}

function inferUiActionRoleFromActionCode(actionCodeRaw: unknown): UiActionRole {
  const actionCode = String(actionCodeRaw || "").trim();
  if (!actionCode) return "choice";
  if (actionCode === "ACTION_START") return "start";
  if (actionCode === "ACTION_TEXT_SUBMIT") return "text_submit";
  if (actionCode === "ACTION_COMPARE_PICK_USER") return "compare_pick_user";
  if (actionCode === "ACTION_COMPARE_PICK_SUGGESTION") return "compare_pick_suggestion";
  if (actionCode === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") return "score_submit";
  const registryEntry = toRecord(ACTIONCODE_REGISTRY.actions[actionCode]);
  const route = String(registryEntry.route || "").trim();
  const step = String(registryEntry.step || "").trim().toLowerCase();
  if (step === "dream" && route === "__ROUTE__DREAM_START_EXERCISE__") {
    return "dream_start_exercise";
  }
  if (step === "dream" && route === "__SWITCH_TO_SELF_DREAM__") {
    return "dream_switch_to_self";
  }
  return "choice";
}

function buildStateActionDescriptor(
  state: Record<string, unknown>,
  role: UiActionRole
): {
  actionCode: string;
  label: string;
  labelKey: string;
  surface: UiActionSurface;
  intent: Record<string, unknown>;
  primary: boolean;
  payloadMode?: string;
} | null {
  if (role === "start") {
    const actionCode = String(state.ui_action_start || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      label: uiLabelForKey(state, "btnStart"),
      labelKey: "btnStart",
      surface: "primary",
      intent: { type: "CONTINUE" },
      primary: true,
    };
  }
  if (role === "text_submit") {
    const actionCode = String(state.ui_action_text_submit || "").trim();
    if (!actionCode) return null;
    const payloadMode = String(state.ui_action_text_submit_payload_mode || "text").trim().toLowerCase();
    const labelKey = payloadMode === "scores" ? "btnScoringContinue" : "sendTitle";
    return {
      actionCode,
      label: uiLabelForKey(state, labelKey),
      labelKey,
      surface: "text_input",
      intent: payloadMode === "scores" ? { type: "SUBMIT_SCORES", scores: [] } : { type: "SUBMIT_TEXT", text: "" },
      primary: true,
      payloadMode: payloadMode === "scores" ? "scores" : "text",
    };
  }
  if (role === "score_submit") {
    const actionCode = String((state as Record<string, unknown>).ui_action_score_submit || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      label: uiLabelForKey(state, "btnScoringContinue"),
      labelKey: "btnScoringContinue",
      surface: "primary",
      intent: { type: "SUBMIT_SCORES", scores: [] },
      primary: true,
    };
  }
  if (role === "compare_pick_user") {
    const actionCode = String(state.ui_action_compare_pick_user || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      label: uiLabelForKey(state, "compare.chooseVersion"),
      labelKey: "compare.chooseVersion",
      surface: "compare_pick",
      intent: { type: "COMPARE_PICK", choice: "user" },
      primary: false,
    };
  }
  if (role === "compare_pick_suggestion") {
    const actionCode = String(state.ui_action_compare_pick_suggestion || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      label: uiLabelForKey(state, "compare.chooseVersion"),
      labelKey: "compare.chooseVersion",
      surface: "compare_pick",
      intent: { type: "COMPARE_PICK", choice: "suggestion" },
      primary: false,
    };
  }
  if (role === "dream_start_exercise") {
    const actionCode = String(state.ui_action_dream_start_exercise || "").trim();
    if (!actionCode) return null;
    const labelKey = dreamBuilderExerciseLabelKey(state);
    return {
      actionCode,
      label: uiLabelForKey(state, labelKey),
      labelKey,
      surface: "choice",
      intent: { type: "START_EXERCISE", exerciseType: "dream_builder" },
      primary: false,
    };
  }
  if (role === "dream_switch_to_self") {
    const actionCode = String(state.ui_action_dream_switch_to_self || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      label: uiLabelForKey(state, "btnSwitchToSelfDream"),
      labelKey: "btnSwitchToSelfDream",
      surface: "auxiliary",
      intent: { type: "ROUTE", route: "__ROUTE__DREAM_SWITCH_TO_SELF__" },
      primary: false,
    };
  }
  return null;
}

function ensureUnifiedUiActionContract(response: RunStepContractResponse, deps?: UiParityDeps): void {
  const state = toRecord(response.state);
  const ui = toRecord(response.ui);
  const existingActions = Array.isArray(ui.actions) ? (ui.actions as Array<Record<string, unknown>>) : [];
  const actionCodes = Array.isArray(ui.action_codes)
    ? (ui.action_codes as unknown[]).map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const seenByActionCode = new Set<string>();
  const unifiedActions: Array<Record<string, unknown>> = [];

  for (let i = 0; i < existingActions.length; i += 1) {
    const action = toRecord(existingActions[i]);
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode || seenByActionCode.has(actionCode)) continue;
    const inferredRole = inferUiActionRoleFromActionCode(actionCode);
    const role = normalizeUiActionRole(action.role, inferredRole);
    const surface = normalizeUiActionSurface(action.surface, defaultSurfaceForRole(role));
    const descriptor = buildStateActionDescriptor(state, role);
    const labelKey = String(action.label_key || descriptor?.labelKey || "").trim();
    const label =
      String(action.label || (labelKey ? uiLabelForKey(state, labelKey) : "") || descriptor?.label || "").trim();
    seenByActionCode.add(actionCode);
    unifiedActions.push({
      ...action,
      id: String(action.id || `choice_${i + 1}`),
      action_code: actionCode,
      label,
      label_key: labelKey,
      role,
      surface,
      source: "ui.actions",
    });
  }

  if (actionCodes.length > 0) {
    const currentStep = String(response.current_step_id || state.current_step || "").trim();
    const contractId = String(ui.contract_id || "").trim();
    const menuId =
      deps && currentStep && contractId ? deps.parseMenuFromContractIdForStep(contractId, currentStep) : "";
    const labelKeys =
      deps && menuId ? deps.labelKeysForMenuActionCodes(menuId, actionCodes) : [];
    for (let i = 0; i < actionCodes.length; i += 1) {
      const actionCode = actionCodes[i];
      if (!actionCode || seenByActionCode.has(actionCode)) continue;
      const role = inferUiActionRoleFromActionCode(actionCode);
      const surface = defaultSurfaceForRole(role);
      const descriptor = buildStateActionDescriptor(state, role);
      const fallbackLabelKey = menuId ? labelKeyForMenuAction(menuId, actionCode, i) : "";
      const labelKey = String(labelKeys[i] || fallbackLabelKey || descriptor?.labelKey || "").trim();
      const label = String(uiLabelForKey(state, labelKey) || descriptor?.label || "").trim();
      seenByActionCode.add(actionCode);
      unifiedActions.push({
        id: `menu_${i + 1}`,
        action_code: actionCode,
        label,
        label_key: labelKey,
        role,
        surface,
        primary: role === "start" || role === "score_submit",
        ...(descriptor?.payloadMode ? { payload_mode: descriptor.payloadMode } : {}),
        source: "ui.action_codes",
      });
    }
  }

  const stateRoles: UiActionRole[] = [
    "start",
    "text_submit",
    "score_submit",
    "compare_pick_user",
    "compare_pick_suggestion",
    "dream_start_exercise",
    "dream_switch_to_self",
  ];
  for (const role of stateRoles) {
    const descriptor = buildStateActionDescriptor(state, role);
    if (!descriptor) continue;
    if (
      role === "dream_start_exercise" &&
      unifiedActions.some((action) => normalizeUiActionRole(action.role, "choice") === "dream_start_exercise")
    ) {
      continue;
    }
    const normalizedCode = String(descriptor.actionCode || "").trim();
    if (!normalizedCode) continue;
    if (seenByActionCode.has(normalizedCode)) {
      for (const entry of unifiedActions) {
        if (String(entry.action_code || "").trim() !== normalizedCode) continue;
        entry.role = role;
        entry.surface = descriptor.surface;
        if (role !== "dream_start_exercise") {
          if (!String(entry.label_key || "").trim()) entry.label_key = descriptor.labelKey;
          if (!String(entry.label || "").trim()) entry.label = descriptor.label;
        }
        if (role === "text_submit" && descriptor.payloadMode) {
          entry.payload_mode = descriptor.payloadMode;
        }
      }
      continue;
    }
    seenByActionCode.add(normalizedCode);
    unifiedActions.push({
      id: `state_${role}`,
      label: descriptor.label,
      label_key: descriptor.labelKey,
      action_code: normalizedCode,
      intent: descriptor.intent,
      primary: descriptor.primary,
      role,
      surface: descriptor.surface,
      ...(descriptor.payloadMode ? { payload_mode: descriptor.payloadMode } : {}),
      source: "state_action_contract",
    });
  }

  ui.action_contract = {
    version: "2026-02-28.action_liveness.v1",
    source: "server_contract",
    actions: unifiedActions,
  };
  response.ui = ui;
}

function applyDeterministicUiActionRenderPolicy(response: RunStepContractResponse): void {
  const state = toRecord(response.state);
  const ui = toRecord(response.ui);
  const actionContract = toRecord(ui.action_contract);
  const actions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>)
    : [];
  if (actions.length === 0) return;

  const view = toRecord(ui.view);
  const mode = String(view.mode || "").trim().toLowerCase();
  const variant = String(view.variant || "").trim().toLowerCase();
  const currentStep = String(response.current_step_id || state.current_step || "").trim();
  const bypassInteractiveStep0RoleGate = mode === "interactive" && currentStep === STEP_0_ID;
  const hasChoiceActions = actions.some(
    (action) => normalizeUiActionRole(action.role, "choice") === "choice"
  );

  const allowedRoles = new Set<UiActionRole>();
  const dreamBuilderVariantActive =
    variant === "dream_builder_collect" ||
    variant === "dream_builder_refine" ||
    variant === "dream_builder_scoring";
  const dreamBuilderCompareActive =
    String(toRecord(ui.dream_builder_contract).phase || "").trim() === "compare";
  const compareSurfaceActive =
    hasActiveNormalCompareSource(response) || dreamBuilderCompareActive;
  if (mode === "prestart") {
    allowedRoles.add("start");
  } else if (mode === "interactive") {
    allowedRoles.add("text_submit");
    if (variant === "dream_builder_scoring") {
      allowedRoles.add("score_submit");
    }
    if (!compareSurfaceActive) {
      allowedRoles.add("dream_switch_to_self");
      if (!dreamBuilderVariantActive) {
        allowedRoles.add("dream_start_exercise");
      }
    }
    if (hasChoiceActions) {
      allowedRoles.add("choice");
    } else if (compareSurfaceActive) {
      allowedRoles.add("compare_pick_user");
      allowedRoles.add("compare_pick_suggestion");
    } else {
      allowedRoles.add("choice");
    }
  }

  const filteredActions: Array<Record<string, unknown>> = [];
  const seenByActionCode = new Set<string>();
  for (const action of actions) {
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode || seenByActionCode.has(actionCode)) continue;
    const role = normalizeUiActionRole(action.role, "choice");
    if (!bypassInteractiveStep0RoleGate && !allowedRoles.has(role)) continue;
    seenByActionCode.add(actionCode);
    filteredActions.push({
      ...action,
      action_code: actionCode,
      role,
      surface: normalizeUiActionSurface(action.surface, defaultSurfaceForRole(role)),
    });
  }

  actionContract.actions = filteredActions;
  ui.action_contract = actionContract;
  response.ui = ui;
}

function applyCanonicalWidgetState(
  response: RunStepContractResponse
): CanonicalViewDecisionSnapshot {
  const nextResponse = response;
  const state =
    response.state && typeof response.state === "object"
      ? (response.state as Record<string, unknown>)
      : {};
  if (!response.state || typeof response.state !== "object") {
    nextResponse.state = state;
  }
  const ui =
    response.ui && typeof response.ui === "object"
      ? (response.ui as Record<string, unknown>)
      : {};
  if (!response.ui || typeof response.ui !== "object") {
    nextResponse.ui = ui;
  }
  const uiView =
    ui.view && typeof ui.view === "object"
      ? (ui.view as Record<string, unknown>)
      : {};
  if (!ui.view || typeof ui.view !== "object") {
    ui.view = uiView;
  }

  const currentStep = String(nextResponse.current_step_id || state.current_step || STEP_0_ID).trim() || STEP_0_ID;
  const started = String(state.started || "").trim().toLowerCase() === "true";
  const interactiveHasRenderableContent = hasRenderableResponseContent(nextResponse);
  const specialist = toRecord(nextResponse.specialist);
  const step0InteractionState = String(specialist.step0_interaction_state || "").trim().toLowerCase();
  const step0IsMutableRaw = specialist.is_mutable;
  const step0IsMutable =
    step0IsMutableRaw === true ||
    String(step0IsMutableRaw || "").trim().toLowerCase() === "true";
  const step0EditableFields = normalizeEditableFields(specialist.editable_fields);
  let startActionAvailable = hasStartAction(nextResponse, state);
  if (currentStep === STEP_0_ID && !started && !startActionAvailable) {
    state.ui_action_start = "ACTION_START";
    startActionAvailable = true;
  }

  const canonical = buildCanonicalWidgetState({
    step0Id: STEP_0_ID,
    currentStepId: currentStep,
    started,
    hasRenderableContent: interactiveHasRenderableContent,
    hasStartAction: startActionAvailable,
    uiGateStatus: String(state.ui_gate_status || ""),
    bootstrapPhase: String(state.bootstrap_phase || ""),
    variant: String(uiView.variant || "").trim(),
    step0InteractionState,
    isMutable: step0IsMutable,
    editableFields: step0EditableFields,
  });

  ui.view = {
    mode: canonical.mode,
    interaction_state: canonical.interaction_state,
    waiting_locale: false,
    is_mutable: canonical.is_mutable,
    editable_fields: canonical.editable_fields,
    ...(canonical.variant ? { variant: canonical.variant } : {}),
    ...(String(uiView.dream_builder_body_mode || "").trim()
      ? { dream_builder_body_mode: String(uiView.dream_builder_body_mode || "").trim() }
      : {}),
    ...(uiView.dream_builder_statements_visible === true || uiView.dream_builder_statements_visible === false
      ? { dream_builder_statements_visible: uiView.dream_builder_statements_visible === true }
      : {}),
  };
  if (String(state.ui_gate_status || "").trim().toLowerCase() === "failed") {
    state.ui_gate_status = "ready";
    state.ui_gate_reason = "";
    state.bootstrap_phase = "ready";
  }

  return {
    started,
    ui_view_mode: canonical.mode,
    interaction_state: canonical.interaction_state,
    has_renderable_content: canonical.has_renderable_content,
    has_start_action: canonical.has_start_action,
    is_mutable: canonical.is_mutable,
    editable_fields: canonical.editable_fields,
    invariant_ok: canonical.invariant_ok,
    reason_code: canonical.reason_code,
  };
}

export function enforceRunStepViewContractGuard(
  response: RunStepContractResponse
): CanonicalViewDecisionSnapshot {
  return applyCanonicalWidgetState(response);
}

export function validateUiPayloadContractParity(
  response: RunStepContractResponse,
  deps: UiParityDeps
): string | null {
  const ui =
    response && typeof response.ui === "object" && response.ui
      ? (response.ui as Record<string, unknown>)
      : null;
  if (!ui) return null;
  const stepId =
    String(response.current_step_id || "") ||
    String(((response.state as Record<string, unknown> | undefined) || {}).current_step || "");
  const contractId = String(ui.contract_id || "").trim();
  if (!stepId || !contractId) return "ui_contract_missing_step_or_contract_id";
  const menuId = deps.parseMenuFromContractIdForStep(contractId, stepId);
  if (!menuId) return "ui_contract_missing_menu_id";
  const actionContract = toRecord(ui.action_contract);
  const actions = Array.isArray(actionContract.actions) ? (actionContract.actions as Array<Record<string, unknown>>) : [];
  const contractMenuActionCodes = actions
    .filter((action) => {
      const source = String(action.source || "").trim();
      return source === "ui.actions" || source === "ui.action_codes";
    })
    .map((action) => String(action.action_code || "").trim())
    .filter(Boolean);
  const expectedActionCodes =
    contractMenuActionCodes.length > 0
      ? contractMenuActionCodes
      : Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
        ? ACTIONCODE_REGISTRY.menus[menuId].map((code) => String(code || "").trim()).filter(Boolean)
        : [];
  if (expectedActionCodes.length === 0) return null;
  const menuActions = expectedActionCodes.map((actionCode) =>
    actions.find((action) => String(action.action_code || "").trim() === actionCode) || {}
  );
  if (menuActions.some((action) => Object.keys(action).length === 0)) return "ui_action_contract_missing_menu_action";
  const expectedLabelKeys = deps.labelKeysForMenuActionCodes(menuId, expectedActionCodes);
  if (expectedLabelKeys.length !== expectedActionCodes.length) return "ui_contract_labelkeys_or_actioncodes_mismatch";
  for (let i = 0; i < expectedActionCodes.length; i += 1) {
    const action = menuActions[i] || {};
    const actionCode = String(action.action_code || "").trim();
    const labelKeyRaw = String(action.label_key || "").trim();
    const labelKey = labelKeyRaw || labelKeyForMenuAction(menuId, actionCode, i);
    const label = String(action.label || "").trim();
    if (actionCode !== expectedActionCodes[i]) return `ui_actions_actioncode_mismatch_at_${i + 1}`;
    if (!actionLabelKeyMatchesState(((response.state as Record<string, unknown> | undefined) || {}), actionCode, labelKey, expectedLabelKeys[i])) {
      return `ui_actions_label_key_mismatch_at_${i + 1}`;
    }
    if (!label) return `ui_actions_label_missing_at_${i + 1}`;
  }
  return null;
}

function repairUiPayloadContractParity(
  response: RunStepContractResponse,
  deps: UiParityDeps
): string | null {
  const ui =
    response && typeof response.ui === "object" && response.ui
      ? (response.ui as Record<string, unknown>)
      : null;
  if (!ui) return validateUiPayloadContractParity(response, deps);
  const stepId =
    String(response.current_step_id || "") ||
    String(((response.state as Record<string, unknown> | undefined) || {}).current_step || "");
  const contractId = String(ui.contract_id || "").trim();
  if (!stepId || !contractId) return validateUiPayloadContractParity(response, deps);
  const menuId = deps.parseMenuFromContractIdForStep(contractId, stepId);
  const expectedActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId].map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  if (expectedActionCodes.length === 0) return validateUiPayloadContractParity(response, deps);

  ui.action_codes = expectedActionCodes;
  response.ui = ui;
  ensureUnifiedUiActionContract(response, deps);
  ensurePendingInteractionContract(response);
  applyDeterministicUiActionRenderPolicy(response);
  delete ui.action_codes;
  response.ui = ui;
  return validateUiPayloadContractParity(response, deps);
}

function shouldEnforceDreamSingleValueActionLiveness(response: RunStepContractResponse): boolean {
  const ui =
    response && typeof response.ui === "object" && response.ui
      ? (response.ui as Record<string, unknown>)
      : null;
  if (!ui) return false;
  const state = (response.state as Record<string, unknown> | undefined) || {};
  const stepId = String(response.current_step_id || state.current_step || "").trim();
  if (stepId !== "dream") return false;
  const view = toRecord(ui.view);
  const variant = String(view.variant || "").trim().toLowerCase();
  if (
    variant === "dream_builder_collect" ||
    variant === "dream_builder_refine" ||
    variant === "dream_builder_scoring" ||
    variant === "text_compare"
  ) {
    return false;
  }
  const content = toRecord(ui.content);
  return String(content.kind || "").trim() === "single_value";
}

export function assertRunStepContractOrThrow(response: RunStepContractResponse): void {
  void response;
}

export function buildContractFailurePayload(
  response: RunStepContractResponse,
  reason: string
): Record<string, unknown> {
  const currentStep = String(response?.current_step_id || (response?.state as any)?.current_step || "step_0");
  const specialist = ((response?.specialist || {}) as Record<string, unknown>) || {};
  const reasonCode = String(reason || "unknown_contract_violation").trim().toLowerCase();
  const state = {
    ...(((response?.state as CanvasState | undefined) || {}) as Record<string, unknown>),
  } as Record<string, unknown>;
  state.reason_code = reasonCode;
  state.ui_gate_status = "ready";
  state.ui_gate_reason = "";
  if (String(state.current_step || "").trim() === STEP_0_ID && String(state.started || "").trim().toLowerCase() !== "true") {
    state.ui_action_start = "ACTION_START";
  }
  return {
    ok: false,
    tool: "run_step",
    current_step_id: currentStep,
    active_specialist: String(response?.active_specialist || ""),
    text: "",
    prompt: "",
    specialist,
    registry_version: ACTIONCODE_REGISTRY.version,
    state,
    error: {
      type: "contract_warning",
      message: resolveUiStringForState(state, "runtime.error.contract_warning"),
      reason: reasonCode,
      required_action: "continue_session",
    },
  };
}

export function finalizeResponseContractInternals<T extends RunStepContractResponse>(
  response: T,
  options: FinalizeContractInternalsOptions
): T {
  let finalResponse = stampResponseContentLocale(response) as RunStepContractResponse;
  const responseStateForCleanup = finalResponse?.state as CanvasState | undefined;
  if (responseStateForCleanup) {
    if (Object.prototype.hasOwnProperty.call(responseStateForCleanup as any, "__submitted_pending_interaction_id")) {
      delete (responseStateForCleanup as any).__submitted_pending_interaction_id;
    }
    if (Object.prototype.hasOwnProperty.call(responseStateForCleanup as any, "__last_clicked_label_for_contract")) {
      delete (responseStateForCleanup as any).__last_clicked_label_for_contract;
    }
    if (Object.prototype.hasOwnProperty.call(responseStateForCleanup as any, "__last_clicked_action_for_contract")) {
      delete (responseStateForCleanup as any).__last_clicked_action_for_contract;
    }
    const requestedLang =
      normalizeContractLocale(
        (responseStateForCleanup as any).ui_strings_requested_lang ||
          (responseStateForCleanup as any).locale ||
          (responseStateForCleanup as any).language ||
          (responseStateForCleanup as any).ui_strings_lang ||
          "en"
      ) || "en";
    (responseStateForCleanup as any).ui_strings_requested_lang = requestedLang;
    (responseStateForCleanup as any).locale =
      normalizeContractLocale((responseStateForCleanup as any).locale || requestedLang) || requestedLang;
    (responseStateForCleanup as any).language =
      normalizeContractLang((responseStateForCleanup as any).language || (responseStateForCleanup as any).locale) || "en";
    (responseStateForCleanup as any).ui_strings_fallback_applied =
      String((responseStateForCleanup as any).ui_strings_fallback_applied || "false").trim() === "true"
        ? "true"
        : "false";
    const fallbackReasonRaw = String((responseStateForCleanup as any).ui_strings_fallback_reason || "").trim();
    (responseStateForCleanup as any).ui_strings_fallback_reason =
      CONTRACT_UI_FALLBACK_REASONS.has(fallbackReasonRaw) ? fallbackReasonRaw : "";
    const uiStatus = String((responseStateForCleanup as any).ui_strings_status || "").trim().toLowerCase();
    if (uiStatus === "ready") {
      (responseStateForCleanup as any).ui_strings_lang =
        normalizeContractLocale(
          (responseStateForCleanup as any).ui_strings_lang || (responseStateForCleanup as any).locale || ""
        ) || requestedLang;
    }
    options.applyUiClientActionContract(responseStateForCleanup);
  }
  ensureUnifiedUiActionContract(finalResponse, {
    parseMenuFromContractIdForStep: options.parseMenuFromContractIdForStep,
    labelKeysForMenuActionCodes: options.labelKeysForMenuActionCodes,
  });
  const finalUi = toRecord(finalResponse.ui);
  delete finalUi.actions;
  delete finalUi.action_codes;
  delete finalUi.expected_choice_count;
  finalResponse.ui = finalUi;
  const canonicalViewDecision = applyCanonicalWidgetState(finalResponse);
  ensurePendingInteractionContract(finalResponse);
  applyDeterministicUiActionRenderPolicy(finalResponse);
  if (finalResponse?.ok === true) {
    const uiViolation = validateUiPayloadContractParity(finalResponse, {
      parseMenuFromContractIdForStep: options.parseMenuFromContractIdForStep,
      labelKeysForMenuActionCodes: options.labelKeysForMenuActionCodes,
    });
    if (uiViolation) {
      options.onUiParityError();
    }
    if (shouldEnforceDreamSingleValueActionLiveness(finalResponse)) {
      const actionContract = toRecord(toRecord(finalResponse.ui).action_contract);
      const actions = Array.isArray(actionContract.actions)
        ? (actionContract.actions as Array<Record<string, unknown>>)
        : [];
      if (actions.length === 0) {
        const repairedViolation = repairUiPayloadContractParity(finalResponse, {
          parseMenuFromContractIdForStep: options.parseMenuFromContractIdForStep,
          labelKeysForMenuActionCodes: options.labelKeysForMenuActionCodes,
        });
        const repairedActionContract = toRecord(toRecord(finalResponse.ui).action_contract);
        const repairedActions = Array.isArray(repairedActionContract.actions)
          ? (repairedActionContract.actions as Array<Record<string, unknown>>)
          : [];
        if (repairedViolation || repairedActions.length === 0) {
          options.onUiParityError();
          return buildContractFailurePayload(
            finalResponse,
            repairedViolation || "ui_action_contract_missing_menu_action"
          ) as T;
        }
      }
    }
    const pendingInteractionViolation = validatePendingInteractionCompareInvariant(finalResponse);
    if (pendingInteractionViolation) {
      options.onUiParityError();
      return buildContractFailurePayload(finalResponse, pendingInteractionViolation) as T;
    }
  }
  stripLegacyUiCompareShadows(finalResponse);
  (finalResponse as Record<string, unknown>).__canonical_view_decision = canonicalViewDecision;

  return finalResponse as T;
}
