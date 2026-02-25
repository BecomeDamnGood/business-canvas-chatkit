import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { VIEW_CONTRACT_VERSION as LOCALE_START_VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import type { CanvasState } from "../core/state.js";
import { labelKeyForMenuAction } from "../core/menu_contract.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
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
  const state = response?.state as Record<string, unknown> | undefined;
  if (!state || typeof state !== "object") {
    throw new Error("missing_state");
  }
  const uiPayload =
    response?.ui && typeof response.ui === "object"
      ? (response.ui as Record<string, unknown>)
      : null;
  const uiView =
    uiPayload && uiPayload.view && typeof uiPayload.view === "object"
      ? (uiPayload.view as Record<string, unknown>)
      : null;
  const uiViewMode = String((uiView || {}).mode || "").trim().toLowerCase();
  const bootstrapPhase = String(state.bootstrap_phase || "").trim().toLowerCase();
  const uiGateStatus = String(state.ui_gate_status || "").trim();
  const uiGateReason = String(state.ui_gate_reason || "").trim();
  const uiStringsStatus = String(state.ui_strings_status || "").trim().toLowerCase();
  const locale = normalizeContractLocale(state.locale || "");
  const language = normalizeContractLang(state.language || locale);
  const uiStringsLang = normalizeContractLocale(state.ui_strings_lang || "");
  const uiStringsRequestedLang = normalizeContractLocale(state.ui_strings_requested_lang || "");
  const uiStringsLangBase = normalizeContractLang(uiStringsLang);
  const uiStringsRequestedLangBase = normalizeContractLang(uiStringsRequestedLang);
  const uiStringsMap =
    state.ui_strings && typeof state.ui_strings === "object"
      ? (state.ui_strings as Record<string, unknown>)
      : {};
  const fallbackApplied = String(state.ui_strings_fallback_applied || "false").trim() === "true";
  const fallbackReason = String(state.ui_strings_fallback_reason || "").trim();
  const viewContractVersion = String(state.view_contract_version || "").trim();
  const currentStep = String(state.current_step || STEP_0_ID).trim() || STEP_0_ID;
  const started = String(state.started || "").trim().toLowerCase() === "true";
  const uiActionStart = String(state.ui_action_start || "").trim();

  if (!CONTRACT_BOOTSTRAP_PHASES.has(bootstrapPhase)) {
    throw new Error("invalid_bootstrap_phase");
  }
  if (!CONTRACT_UI_GATE_STATUSES.has(uiGateStatus)) {
    throw new Error("invalid_ui_gate_status");
  }
  if (!CONTRACT_UI_GATE_REASONS.has(uiGateReason)) {
    throw new Error("invalid_ui_gate_reason");
  }
  if (!CONTRACT_UI_STRINGS_STATUSES.has(uiStringsStatus)) {
    throw new Error("invalid_ui_strings_status");
  }
  if (uiPayload && (!uiView || !CONTRACT_UI_VIEW_MODES.has(uiViewMode))) {
    throw new Error("invalid_ui_view_mode");
  }
  if (!language) {
    throw new Error("missing_language");
  }
  if (!viewContractVersion) {
    throw new Error("missing_view_contract_version");
  }
  if (viewContractVersion !== LOCALE_START_VIEW_CONTRACT_VERSION) {
    throw new Error("invalid_view_contract_version");
  }
  if (!uiStringsRequestedLang) {
    throw new Error("missing_ui_strings_requested_lang");
  }
  if (!CONTRACT_UI_FALLBACK_REASONS.has(fallbackReason)) {
    throw new Error("invalid_ui_strings_fallback_reason");
  }
  if (fallbackApplied && !fallbackReason) {
    throw new Error("fallback_applied_without_reason");
  }
  if (!fallbackApplied && fallbackReason) {
    throw new Error("fallback_reason_without_applied");
  }
  if (uiGateStatus === "blocked" || uiGateStatus === "failed") {
    if (bootstrapPhase !== "failed") {
      throw new Error("blocked_gate_requires_failed_phase");
    }
    if (!uiGateReason || uiGateReason === "translation_pending" || uiGateReason === "translation_retry") {
      throw new Error("blocked_gate_requires_terminal_reason");
    }
  }
  if (uiGateStatus === "ready") {
    if (uiGateReason) {
      throw new Error("ready_gate_must_have_empty_reason");
    }
    if (uiStringsStatus !== "ready") {
      throw new Error("ready_gate_requires_ready_ui_strings");
    }
    if (!uiStringsLang) {
      throw new Error("ready_ui_strings_requires_lang");
    }
    if (
      uiStringsRequestedLangBase !== "en" &&
      uiStringsLangBase !== uiStringsRequestedLangBase &&
      !fallbackApplied
    ) {
      throw new Error("lang_mismatch_requires_fallback_metadata");
    }
  }
  const responseErrorType = String((response?.error as Record<string, unknown> | undefined)?.type || "").trim();
  if (responseErrorType === "session_upgrade_required") {
    if (uiGateStatus !== "blocked" || bootstrapPhase !== "failed" || uiGateReason !== "session_upgrade_required") {
      throw new Error("session_upgrade_requires_blocked_failed_state");
    }
  }
  if (currentStep === STEP_0_ID && !started && uiGateStatus === "ready") {
    if (!uiPayload || !uiView || uiViewMode !== "prestart") {
      throw new Error("prestart_ready_requires_prestart_mode");
    }
    if (Object.keys(uiStringsMap).length === 0) {
      throw new Error("prestart_ready_requires_ui_strings");
    }
    if (uiActionStart !== "ACTION_START") {
      throw new Error("prestart_ready_requires_start_action");
    }
  }
}

export function buildContractFailurePayload(
  response: RunStepContractResponse,
  reason: string
): Record<string, unknown> {
  const currentStep = String(response?.current_step_id || (response?.state as any)?.current_step || "step_0");
  const specialist = ((response?.specialist || {}) as Record<string, unknown>) || {};
  const state = buildFailClosedState((response?.state as CanvasState | undefined) || null, "contract_violation");
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
      reason: String(reason || "unknown_contract_violation"),
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
      finalResponse = {
        ...finalResponse,
        ok: false,
        error: {
          type: "contract_violation",
          message: "UI payload violates actioncode/menu contract.",
          reason: uiViolation,
          step: String(finalResponse?.current_step_id || ""),
          contract_id: String(((finalResponse?.ui as Record<string, unknown> | undefined) || {}).contract_id || ""),
        },
      };
    }
  }
  try {
    assertRunStepContractOrThrow(finalResponse);
  } catch (error: any) {
    const reason = String(error?.message || "contract_violation");
    const specialistForFailure = ((finalResponse?.specialist || {}) as Record<string, unknown>) || {};
    finalResponse = options.attachRegistryPayload(buildContractFailurePayload(finalResponse, reason), specialistForFailure, {
      bootstrap_waiting_locale: false,
      bootstrap_interactive_ready: false,
      bootstrap_retry_hint: "",
      locale_pending_background: false,
      bootstrap_phase: "failed",
    });
  }

  return finalResponse as T;
}
