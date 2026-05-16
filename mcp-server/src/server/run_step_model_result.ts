import {
  RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
} from "../contracts/mcp_tool_contract.js";
import { UI_STRINGS_DEFAULT } from "../i18n/ui_strings_defaults.js";
import { safeString } from "../server_safe_string.js";

import { getHeader } from "./observability.js";
import {
  isLocalDev,
  port,
} from "./server_config.js";

const NON_EMPTY_UI_STRING_FALLBACKS: Record<string, string> = {
  "app.open_to_continue": "Open the app to continue.",
  startHint: "Click Start to begin.",
};

function uiStringForState(state: Record<string, unknown>, key: string): string {
  const uiStrings =
    state.ui_strings && typeof state.ui_strings === "object"
      ? (state.ui_strings as Record<string, unknown>)
      : {};
  const resolved = safeString(uiStrings[key] || UI_STRINGS_DEFAULT[key] || "").trim();
  return resolved || safeString(NON_EMPTY_UI_STRING_FALLBACKS[key] || "").trim();
}

function buildModelSafeResult(result: Record<string, unknown>): Record<string, unknown> {
  const state =
    result && typeof result.state === "object" && result.state
      ? (result.state as Record<string, unknown>)
      : {};
  const ui =
    result && typeof result.ui === "object" && result.ui
      ? (result.ui as Record<string, unknown>)
      : {};
  const currentStep = safeString(result.current_step_id || state.current_step || "step_0");
  const uiView =
    ui.view && typeof ui.view === "object"
      ? (ui.view as Record<string, unknown>)
      : {};
  const uiViewMode = safeString(uiView.mode || "").trim().toLowerCase();
  const started = safeString(state.started || "");
  const isStarted = started.toLowerCase() === "true";
  const isPrestartView = currentStep === "step_0" && (uiViewMode === "prestart" || (!uiViewMode && !isStarted));
  const startHint = uiStringForState(state, "startHint");
  const openAppToContinue = uiStringForState(state, "app.open_to_continue");
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
  const safeState: Record<string, unknown> = {
    current_step: currentStep || "step_0",
  };
  const normalizedStarted =
    isPrestartView
      ? (started || "false")
      : "true";
  safeState.started = normalizedStarted;
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
  // Keep model-visible transport renderable for fallback paths without exposing rich widget state.
  const modelSafePrompt = isPrestartView ? (startHint || openAppToContinue) : openAppToContinue;
  const modelSafeText = result.ok === true ? modelSafePrompt : openAppToContinue;
  return {
    model_result_shape_version: RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
    ok: result.ok === true,
    tool: safeString(result.tool || "run_step"),
    current_step_id: currentStep,
    text: modelSafeText,
    prompt: modelSafePrompt,
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
    state: safeState,
  };
}

function buildContentFromResult(
  result: Record<string, unknown> | null | undefined,
  options?: { isFirstStart?: boolean }
): string {
  // App-only contract: keep chat silent on success.
  if (!result || typeof result !== "object") return "";
  const state =
    result.state && typeof result.state === "object"
      ? (result.state as Record<string, unknown>)
      : {};
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const flags =
    uiObj.flags && typeof uiObj.flags === "object"
      ? (uiObj.flags as Record<string, unknown>)
      : {};
  const waitingLocale = flags.bootstrap_waiting_locale === true;
  const hasError = Boolean((result as any).error);
  if (hasError) return uiStringForState(state, "app.open_to_continue");
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
