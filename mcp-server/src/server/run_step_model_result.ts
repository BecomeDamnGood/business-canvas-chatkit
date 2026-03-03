import {
  MCP_TOOL_CONTRACT_FAMILY_VERSION,
  RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
  RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
} from "../contracts/mcp_tool_contract.js";
import { safeString } from "../server_safe_string.js";

import { getHeader } from "./observability.js";
import {
  isLocalDev,
  normalizeIdempotencyKey,
  parsePositiveInt,
  port,
} from "./server_config.js";
import { normalizeBootstrapSessionId } from "./ordering_parity.js";

function buildModelSafeResult(result: Record<string, unknown>): Record<string, unknown> {
  const state =
    result && typeof result.state === "object" && result.state
      ? (result.state as Record<string, unknown>)
      : {};
  const ui =
    result && typeof result.ui === "object" && result.ui
      ? (result.ui as Record<string, unknown>)
      : {};
  const flags =
    ui.flags && typeof ui.flags === "object"
      ? (ui.flags as Record<string, unknown>)
      : {};
  const currentStep = safeString(result.current_step_id || state.current_step || "step_0");
  const started = safeString(state.started || "");
  const initialUserMessage = safeString(state.initial_user_message || "");
  const locale = safeString((result as any).locale || state.locale || "");
  const language = safeString((result as any).language || state.language || "");
  const languageSource = safeString((result as any).language_source || state.language_source || "");
  const uiStringsLang = safeString(state.ui_strings_lang || (result as any).ui_strings_lang || "");
  const uiStringsStatus = safeString(state.ui_strings_status || (result as any).ui_strings_status || "");
  const uiStringsRequestedLang = safeString(
    state.ui_strings_requested_lang || (result as any).ui_strings_requested_lang || ""
  );
  const uiStringsFallbackApplied = safeString(
    state.ui_strings_fallback_applied || (result as any).ui_strings_fallback_applied || "false"
  );
  const uiStringsFallbackReason = safeString(
    state.ui_strings_fallback_reason || (result as any).ui_strings_fallback_reason || ""
  );
  const uiBootstrapStatus = safeString(state.ui_bootstrap_status || (result as any).ui_bootstrap_status || "");
  const uiGateStatus = safeString((result as any).ui_gate_status || state.ui_gate_status || "");
  const uiGateReason = safeString((result as any).ui_gate_reason || state.ui_gate_reason || "");
  const uiGateSinceMs = Number((result as any).ui_gate_since_ms ?? state.ui_gate_since_ms ?? 0) || 0;
  const bootstrapPhase = safeString((result as any).bootstrap_phase || state.bootstrap_phase || "");
  const bootstrapSessionId = normalizeBootstrapSessionId(
    (result as any).bootstrap_session_id || state.bootstrap_session_id || ""
  );
  const bootstrapEpoch = parsePositiveInt((result as any).bootstrap_epoch ?? state.bootstrap_epoch);
  const responseSeq = parsePositiveInt((result as any).response_seq ?? state.response_seq);
  const responseKindRaw = safeString((result as any).response_kind || state.response_kind || "");
  const responseKind = responseKindRaw === "run_step" ? "run_step" : "";
  const idempotencyKey = normalizeIdempotencyKey(
    (result as any).idempotency_key ||
      state.idempotency_key ||
      flags.idempotency_key ||
      ""
  );
  const idempotencyOutcomeRaw = safeString(
    (result as any).idempotency_outcome ||
      state.idempotency_outcome ||
      flags.idempotency_outcome ||
      ""
  );
  const idempotencyOutcome =
    idempotencyOutcomeRaw === "fresh" ||
    idempotencyOutcomeRaw === "replay" ||
    idempotencyOutcomeRaw === "conflict" ||
    idempotencyOutcomeRaw === "inflight"
      ? idempotencyOutcomeRaw
      : "";
  const idempotencyErrorCode = safeString(
    (result as any).idempotency_error_code ||
      state.idempotency_error_code ||
      flags.idempotency_error_code ||
      ""
  );
  const hostWidgetSessionId = safeString(
    (result as any).host_widget_session_id ||
      state.host_widget_session_id ||
      flags.host_widget_session_id ||
      ""
  );
  const ackStatusRaw = safeString((result as any).ack_status || (state as any).ack_status || "");
  const ackStatus =
    ackStatusRaw === "accepted" ||
    ackStatusRaw === "rejected" ||
    ackStatusRaw === "timeout" ||
    ackStatusRaw === "dropped"
      ? ackStatusRaw
      : "";
  const stateAdvancedRaw =
    (result as any).state_advanced ??
    (state as any).state_advanced ??
    ((state as any).ui_action_liveness as Record<string, unknown> | undefined)?.state_advanced;
  const stateAdvanced =
    stateAdvancedRaw === true ||
    String(stateAdvancedRaw || "").trim().toLowerCase() === "true";
  const reasonCode = safeString(
    (result as any).reason_code ||
      (state as any).reason_code ||
      ((state as any).ui_action_liveness as Record<string, unknown> | undefined)?.reason_code ||
      ""
  );
  const actionCodeEcho = safeString(
    (result as any).action_code_echo ||
      (state as any).action_code_echo ||
      ((state as any).ui_action_liveness as Record<string, unknown> | undefined)?.action_code_echo ||
      ""
  );
  const clientActionIdEcho = safeString(
    (result as any).client_action_id_echo ||
      (state as any).client_action_id_echo ||
      ((state as any).ui_action_liveness as Record<string, unknown> | undefined)?.client_action_id_echo ||
      ""
  );
  const toolContractFamilyVersion = safeString(
    (result as any).tool_contract_family_version ||
      state.tool_contract_family_version ||
      flags.tool_contract_family_version ||
      MCP_TOOL_CONTRACT_FAMILY_VERSION
  );
  const runStepInputSchemaVersion = safeString(
    (result as any).run_step_input_schema_version ||
      state.run_step_input_schema_version ||
      flags.run_step_input_schema_version ||
      RUN_STEP_TOOL_INPUT_SCHEMA_VERSION
  );
  const runStepOutputSchemaVersion = safeString(
    (result as any).run_step_output_schema_version ||
      state.run_step_output_schema_version ||
      flags.run_step_output_schema_version ||
      RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION
  );
  const safeState: Record<string, unknown> = {
    current_step: currentStep || "step_0",
  };
  if (started) safeState.started = started;
  if (initialUserMessage) safeState.initial_user_message = initialUserMessage;
  if (locale) safeState.locale = locale;
  if (language) safeState.language = language;
  if (languageSource) safeState.language_source = languageSource;
  if (uiStringsLang) safeState.ui_strings_lang = uiStringsLang;
  if (uiStringsStatus) safeState.ui_strings_status = uiStringsStatus;
  if (uiStringsRequestedLang) safeState.ui_strings_requested_lang = uiStringsRequestedLang;
  safeState.ui_strings_fallback_applied = uiStringsFallbackApplied === "true" ? "true" : "false";
  if (uiStringsFallbackReason) safeState.ui_strings_fallback_reason = uiStringsFallbackReason;
  if (uiBootstrapStatus) safeState.ui_bootstrap_status = uiBootstrapStatus;
  if (uiGateStatus) safeState.ui_gate_status = uiGateStatus;
  if (uiGateReason) safeState.ui_gate_reason = uiGateReason;
  if (uiGateSinceMs > 0) safeState.ui_gate_since_ms = uiGateSinceMs;
  if (bootstrapPhase) safeState.bootstrap_phase = bootstrapPhase;
  if (bootstrapSessionId) safeState.bootstrap_session_id = bootstrapSessionId;
  if (bootstrapEpoch > 0) safeState.bootstrap_epoch = bootstrapEpoch;
  if (responseSeq > 0) safeState.response_seq = responseSeq;
  if (responseKind) safeState.response_kind = responseKind;
  if (idempotencyKey) safeState.idempotency_key = idempotencyKey;
  if (idempotencyOutcome) safeState.idempotency_outcome = idempotencyOutcome;
  if (idempotencyErrorCode) safeState.idempotency_error_code = idempotencyErrorCode;
  if (hostWidgetSessionId) safeState.host_widget_session_id = hostWidgetSessionId;
  if (ackStatus) safeState.ack_status = ackStatus;
  if (ackStatus) safeState.state_advanced = stateAdvanced ? "true" : "false";
  if (reasonCode) safeState.reason_code = reasonCode;
  if (actionCodeEcho) safeState.action_code_echo = actionCodeEcho;
  if (clientActionIdEcho) safeState.client_action_id_echo = clientActionIdEcho;
  if (ackStatus) {
    safeState.ui_action_liveness = {
      ack_status: ackStatus,
      state_advanced: stateAdvanced,
      reason_code: stateAdvanced ? "" : reasonCode,
      action_code_echo: actionCodeEcho,
      client_action_id_echo: clientActionIdEcho,
    };
  }
  if (toolContractFamilyVersion) safeState.tool_contract_family_version = toolContractFamilyVersion;
  if (runStepInputSchemaVersion) safeState.run_step_input_schema_version = runStepInputSchemaVersion;
  if (runStepOutputSchemaVersion) safeState.run_step_output_schema_version = runStepOutputSchemaVersion;
  return {
    model_result_shape_version: RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
    ok: result.ok === true,
    tool: safeString(result.tool || "run_step"),
    current_step_id: currentStep,
    ui_gate_status: uiGateStatus,
    ui_gate_reason: uiGateReason,
    ...(locale ? { locale } : {}),
    language,
    ui_strings_status: uiStringsStatus,
    ui_strings_lang: uiStringsLang,
    ui_strings_requested_lang: uiStringsRequestedLang,
    ui_strings_fallback_applied: uiStringsFallbackApplied === "true",
    ui_strings_fallback_reason: uiStringsFallbackReason,
    bootstrap_phase: bootstrapPhase,
    ...(bootstrapSessionId ? { bootstrap_session_id: bootstrapSessionId } : {}),
    ...(bootstrapEpoch > 0 ? { bootstrap_epoch: bootstrapEpoch } : {}),
    ...(responseSeq > 0 ? { response_seq: responseSeq } : {}),
    ...(responseKind ? { response_kind: responseKind } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(idempotencyOutcome ? { idempotency_outcome: idempotencyOutcome } : {}),
    ...(idempotencyErrorCode ? { idempotency_error_code: idempotencyErrorCode } : {}),
    ...(hostWidgetSessionId ? { host_widget_session_id: hostWidgetSessionId } : {}),
    ...(ackStatus ? { ack_status: ackStatus } : {}),
    ...(ackStatus ? { state_advanced: stateAdvanced } : {}),
    ...(reasonCode ? { reason_code: reasonCode } : {}),
    ...(actionCodeEcho ? { action_code_echo: actionCodeEcho } : {}),
    ...(clientActionIdEcho ? { client_action_id_echo: clientActionIdEcho } : {}),
    ...(toolContractFamilyVersion ? { tool_contract_family_version: toolContractFamilyVersion } : {}),
    ...(runStepInputSchemaVersion ? { run_step_input_schema_version: runStepInputSchemaVersion } : {}),
    ...(runStepOutputSchemaVersion ? { run_step_output_schema_version: runStepOutputSchemaVersion } : {}),
    state: safeState,
  };
}

function buildContentFromResult(
  result: Record<string, unknown> | null | undefined,
  options?: { isFirstStart?: boolean }
): string {
  // App-only contract: keep chat silent on success.
  if (!result || typeof result !== "object") return "";
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const flags =
    uiObj.flags && typeof uiObj.flags === "object"
      ? (uiObj.flags as Record<string, unknown>)
      : {};
  const waitingLocale = flags.bootstrap_waiting_locale === true;
  const hasError = Boolean((result as any).error);
  if (hasError) return "Open de app om verder te gaan.";
  if (waitingLocale) return "";
  if (options?.isFirstStart) return "";
  return "";
}

function resolveBaseUrl(req?: any): string {
  const explicit = safeString(process.env.PUBLIC_BASE_URL ?? process.env.BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (isLocalDev) {
    const portStr = safeString(process.env.PORT ?? port).trim();
    return `http://localhost:${portStr}`;
  }
  if (req) {
    const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
    if (host) {
      const protoHeader = getHeader(req, "x-forwarded-proto");
      const scheme = protoHeader ? protoHeader.split(",")[0].trim() : "https";
      return `${scheme}://${host}`.replace(/\/+$/, "");
    }
  }
  return "";
}


export {
  buildContentFromResult,
  buildModelSafeResult,
  resolveBaseUrl,
};
