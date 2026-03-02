import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { parseUiContractId, UI_CONTRACT_NO_MENU } from "../core/ui_contract_id.js";
import { VIEW_CONTRACT_VERSION as LOCALE_START_VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import type { CanvasState } from "../core/state.js";
import { labelKeyForMenuAction } from "../core/menu_contract.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
import { buildCanonicalWidgetState } from "./run_step_canonical_widget_state.js";
import {
  CONTRACT_BOOTSTRAP_PHASES,
  CONTRACT_UI_FALLBACK_REASONS,
  CONTRACT_UI_GATE_REASONS,
  CONTRACT_UI_GATE_STATUSES,
  CONTRACT_UI_STRINGS_STATUSES,
  CONTRACT_UI_VIEW_MODES,
  buildFailClosedState,
  normalizeContractLang,
  normalizeContractLocale,
} from "./ingress.js";

type RunStepContractResponse = Record<string, unknown>;
type UiActionRole =
  | "choice"
  | "start"
  | "text_submit"
  | "wording_pick_user"
  | "wording_pick_suggestion"
  | "dream_start_exercise"
  | "dream_switch_to_self";

type UiActionSurface =
  | "choice"
  | "primary"
  | "text_input"
  | "wording_choice"
  | "auxiliary";

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
  has_renderable_content: boolean;
  has_start_action: boolean;
  invariant_ok: boolean;
  reason_code: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const UI_ACTION_ROLES = new Set<UiActionRole>([
  "choice",
  "start",
  "text_submit",
  "wording_pick_user",
  "wording_pick_suggestion",
  "dream_start_exercise",
  "dream_switch_to_self",
]);

const UI_ACTION_SURFACES = new Set<UiActionSurface>([
  "choice",
  "primary",
  "text_input",
  "wording_choice",
  "auxiliary",
]);

function defaultSurfaceForRole(role: UiActionRole): UiActionSurface {
  if (role === "start") return "primary";
  if (role === "text_submit") return "text_input";
  if (role === "wording_pick_user" || role === "wording_pick_suggestion") return "wording_choice";
  if (role === "dream_start_exercise" || role === "dream_switch_to_self") return "auxiliary";
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

function hasRenderableResponseContent(response: RunStepContractResponse): boolean {
  const uiPayload = toRecord(response.ui);
  const uiPrompt = toRecord(uiPayload.prompt);
  const specialist = toRecord(response.specialist);
  const hasActions = Array.isArray(uiPayload.actions) && uiPayload.actions.length > 0;
  const prompt = String(response.prompt || "").trim();
  const body =
    String(response.text || "").trim() ||
    String(uiPrompt.body || "").trim() ||
    String(specialist.message || "").trim() ||
    String(specialist.refined_formulation || "").trim();
  const question =
    String(uiPayload.questionText || "").trim() ||
    String(specialist.question || "").trim();
  return hasActions || Boolean(prompt) || Boolean(body) || Boolean(question);
}

function hasStartAction(response: RunStepContractResponse, state: Record<string, unknown>): boolean {
  if (String(state.ui_action_start || "").trim() === "ACTION_START") return true;
  const uiPayload = toRecord(response.ui);
  const actionCodes = Array.isArray(uiPayload.action_codes)
    ? (uiPayload.action_codes as unknown[]).map((code) => String(code || "").trim())
    : [];
  if (actionCodes.includes("ACTION_START")) return true;
  const actions = Array.isArray(uiPayload.actions) ? (uiPayload.actions as Array<Record<string, unknown>>) : [];
  return actions.some((action) => String(action?.action_code || "").trim() === "ACTION_START");
}

function isForbiddenStep0StartedNoOutputNoMenu(
  response: RunStepContractResponse,
  step0Id: string
): boolean {
  const state = toRecord(response.state);
  const clientActionId = String(
    state.__client_action_id ||
      state.client_action_id_echo ||
      toRecord(state.ui_action_liveness).client_action_id_echo ||
      ""
  ).trim();
  if (!clientActionId) return false;
  const started = String(state.started || "").trim().toLowerCase() === "true";
  if (!started) return false;
  const currentStep =
    String(response.current_step_id || state.current_step || step0Id).trim() || step0Id;
  if (currentStep !== step0Id) return false;
  const uiPayload = toRecord(response.ui);
  const contractId = String(uiPayload.contract_id || "").trim();
  if (!contractId) return false;
  const parsed = parseUiContractId(contractId);
  if (!parsed) return false;
  return (
    parsed.stepId === step0Id &&
    parsed.status === "no_output" &&
    parsed.menuId === UI_CONTRACT_NO_MENU
  );
}

function buildStateActionDescriptor(
  state: Record<string, unknown>,
  role: UiActionRole
): {
  actionCode: string;
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
    return {
      actionCode,
      labelKey: payloadMode === "scores" ? "btnScoringContinue" : "sendTitle",
      surface: "text_input",
      intent: payloadMode === "scores" ? { type: "SUBMIT_SCORES", scores: [] } : { type: "SUBMIT_TEXT", text: "" },
      primary: true,
      payloadMode: payloadMode === "scores" ? "scores" : "text",
    };
  }
  if (role === "wording_pick_user") {
    const actionCode = String(state.ui_action_wording_pick_user || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      labelKey: "wordingChoice.chooseVersion",
      surface: "wording_choice",
      intent: { type: "WORDING_PICK", choice: "user" },
      primary: false,
    };
  }
  if (role === "wording_pick_suggestion") {
    const actionCode = String(state.ui_action_wording_pick_suggestion || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      labelKey: "wordingChoice.chooseVersion",
      surface: "wording_choice",
      intent: { type: "WORDING_PICK", choice: "suggestion" },
      primary: false,
    };
  }
  if (role === "dream_start_exercise") {
    const actionCode = String(state.ui_action_dream_start_exercise || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      labelKey: "dreamBuilder.startExercise",
      surface: "auxiliary",
      intent: { type: "START_EXERCISE", exerciseType: "dream_builder" },
      primary: false,
    };
  }
  if (role === "dream_switch_to_self") {
    const actionCode = String(state.ui_action_dream_switch_to_self || "").trim();
    if (!actionCode) return null;
    return {
      actionCode,
      labelKey: "btnSwitchToSelfDream",
      surface: "auxiliary",
      intent: { type: "ROUTE", route: "__ROUTE__DREAM_SWITCH_TO_SELF__" },
      primary: false,
    };
  }
  return null;
}

function ensureUnifiedUiActionContract(response: RunStepContractResponse): void {
  const state = toRecord(response.state);
  const ui = toRecord(response.ui);
  const existingActions = Array.isArray(ui.actions) ? (ui.actions as Array<Record<string, unknown>>) : [];
  const seenByActionCode = new Set<string>();
  const unifiedActions: Array<Record<string, unknown>> = [];

  for (let i = 0; i < existingActions.length; i += 1) {
    const action = toRecord(existingActions[i]);
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode || seenByActionCode.has(actionCode)) continue;
    const role = normalizeUiActionRole(action.role, "choice");
    const surface = normalizeUiActionSurface(action.surface, defaultSurfaceForRole(role));
    seenByActionCode.add(actionCode);
    unifiedActions.push({
      ...action,
      id: String(action.id || `choice_${i + 1}`),
      action_code: actionCode,
      label: String(action.label || "").trim(),
      label_key: String(action.label_key || "").trim(),
      role,
      surface,
      source: "ui.actions",
    });
  }

  const stateRoles: UiActionRole[] = [
    "start",
    "text_submit",
    "wording_pick_user",
    "wording_pick_suggestion",
    "dream_start_exercise",
    "dream_switch_to_self",
  ];
  for (const role of stateRoles) {
    const descriptor = buildStateActionDescriptor(state, role);
    if (!descriptor) continue;
    const normalizedCode = String(descriptor.actionCode || "").trim();
    if (!normalizedCode) continue;
    if (seenByActionCode.has(normalizedCode)) {
      for (const entry of unifiedActions) {
        if (String(entry.action_code || "").trim() !== normalizedCode) continue;
        entry.role = role;
        entry.surface = descriptor.surface;
        if (!String(entry.label_key || "").trim()) entry.label_key = descriptor.labelKey;
        if (role === "text_submit" && descriptor.payloadMode) {
          entry.payload_mode = descriptor.payloadMode;
        }
      }
      continue;
    }
    seenByActionCode.add(normalizedCode);
    unifiedActions.push({
      id: `state_${role}`,
      label: "",
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
  const ui = toRecord(response.ui);
  const actionContract = toRecord(ui.action_contract);
  const actions = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>)
    : [];
  if (actions.length === 0) return;

  const view = toRecord(ui.view);
  const mode = String(view.mode || "").trim().toLowerCase();
  const variant = String(view.variant || "").trim().toLowerCase();
  const hasChoiceActions = actions.some(
    (action) => normalizeUiActionRole(action.role, "choice") === "choice"
  );

  const allowedRoles = new Set<UiActionRole>();
  if (mode === "prestart") {
    allowedRoles.add("start");
  } else if (mode === "interactive") {
    allowedRoles.add("text_submit");
    if (hasChoiceActions) {
      allowedRoles.add("choice");
    } else if (variant === "wording_choice") {
      allowedRoles.add("wording_pick_user");
      allowedRoles.add("wording_pick_suggestion");
    } else {
      allowedRoles.add("choice");
      allowedRoles.add("dream_start_exercise");
      allowedRoles.add("dream_switch_to_self");
    }
  }

  const filteredActions: Array<Record<string, unknown>> = [];
  const seenByActionCode = new Set<string>();
  for (const action of actions) {
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode || seenByActionCode.has(actionCode)) continue;
    const role = normalizeUiActionRole(action.role, "choice");
    if (!allowedRoles.has(role)) continue;
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
  });

  ui.view = {
    mode: canonical.mode,
    waiting_locale: false,
    ...(canonical.variant ? { variant: canonical.variant } : {}),
  };
  if (String(state.ui_gate_status || "").trim().toLowerCase() === "failed") {
    state.ui_gate_status = "ready";
    state.ui_gate_reason = "";
    state.bootstrap_phase = "ready";
  }

  return {
    started,
    ui_view_mode: canonical.mode,
    has_renderable_content: canonical.has_renderable_content,
    has_start_action: canonical.has_start_action,
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
  const actionCodes = Array.isArray(ui.action_codes)
    ? (ui.action_codes as unknown[]).map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  if (actionCodes.length === 0) return null;
  const expectedChoiceCount = typeof ui.expected_choice_count === "number" ? ui.expected_choice_count : actionCodes.length;
  if (expectedChoiceCount !== actionCodes.length) return "ui_expected_choice_count_mismatch";
  const stepId =
    String(response.current_step_id || "") ||
    String(((response.state as Record<string, unknown> | undefined) || {}).current_step || "");
  const contractId = String(ui.contract_id || "").trim();
  if (!stepId || !contractId) return "ui_contract_missing_step_or_contract_id";
  const menuId = deps.parseMenuFromContractIdForStep(contractId, stepId);
  if (!menuId) return "ui_contract_missing_menu_id";
  const actions = Array.isArray(ui.actions) ? (ui.actions as Array<Record<string, unknown>>) : [];
  if (actions.length !== actionCodes.length) return "ui_actions_count_mismatch";
  const expectedLabelKeys = deps.labelKeysForMenuActionCodes(menuId, actionCodes);
  if (expectedLabelKeys.length !== actionCodes.length) return "ui_contract_labelkeys_or_actioncodes_mismatch";
  for (let i = 0; i < actionCodes.length; i += 1) {
    const action = actions[i] || {};
    const actionCode = String(action.action_code || "").trim();
    const labelKeyRaw = String(action.label_key || "").trim();
    const labelKey = labelKeyRaw || labelKeyForMenuAction(menuId, actionCode, i);
    const label = String(action.label || "").trim();
    if (actionCode !== actionCodes[i]) return `ui_actions_actioncode_mismatch_at_${i + 1}`;
    if (labelKey !== expectedLabelKeys[i]) return `ui_actions_label_key_mismatch_at_${i + 1}`;
    if (!label) return `ui_actions_label_missing_at_${i + 1}`;
  }
  return null;
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
  const state = buildFailClosedState((response?.state as CanvasState | undefined) || null, "contract_violation");
  (state as Record<string, unknown>).reason_code = reasonCode;
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
      type: "contract_violation",
      message: "RunStep response violated the strict startup/i18n contract.",
      reason: reasonCode,
      required_action: "restart_session",
    },
  };
}

export function finalizeResponseContractInternals<T extends RunStepContractResponse>(
  response: T,
  options: FinalizeContractInternalsOptions
): T {
  let finalResponse = response as RunStepContractResponse;
  const responseStateForCleanup = finalResponse?.state as CanvasState | undefined;
  if (responseStateForCleanup) {
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
  if (finalResponse?.ok === true) {
    const uiViolation = validateUiPayloadContractParity(finalResponse, {
      parseMenuFromContractIdForStep: options.parseMenuFromContractIdForStep,
      labelKeysForMenuActionCodes: options.labelKeysForMenuActionCodes,
    });
    if (uiViolation) {
      options.onUiParityError();
    }
  }
  ensureUnifiedUiActionContract(finalResponse);
  const canonicalViewDecision = applyCanonicalWidgetState(finalResponse);
  applyDeterministicUiActionRenderPolicy(finalResponse);
  (finalResponse as Record<string, unknown>).__canonical_view_decision = canonicalViewDecision;

  return finalResponse as T;
}
