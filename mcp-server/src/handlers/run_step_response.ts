import { appendSessionTokenLog } from "../core/session_token_log.js";
import type { CanvasState } from "../core/state.js";
import { finalizeResponseContractInternals } from "./turn_contract.js";

export type StructuredLogSeverity = "info" | "warn" | "error";

export type StructuredLogContext = {
  correlation_id: string;
  session_id: string;
  step_id: string;
  contract_id: string;
};

const LOG_REDACT_KEY_RE = /(authorization|cookie|token|secret|password|api[_-]?key)/i;

function normalizeLogField(value: unknown, maxLen = 256): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return normalizeLogField(value, 512);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    if (depth >= 2) return "[array_omitted]";
    return value.slice(0, 20).map((entry) => sanitizeLogValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object_omitted]";
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(entry, depth + 1);
    }
    return next;
  }
  return normalizeLogField(value, 256);
}

function sanitizeLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "event" || key === "severity") continue;
    if (key === "correlation_id" || key === "session_id" || key === "step_id" || key === "contract_id") continue;
    next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(value, 0);
  }
  return next;
}

function resolveContractId(
  response: Record<string, unknown>,
  state: Record<string, unknown>
): string {
  const ui =
    response.ui && typeof response.ui === "object"
      ? (response.ui as Record<string, unknown>)
      : {};
  return normalizeLogField(
    response.contract_id ??
      response.ui_contract_id ??
      state.contract_id ??
      state.ui_contract_id ??
      state.current_contract_id ??
      ui.contract_id ??
      ui.view_contract_id ??
      "",
    128
  );
}

export function createStructuredLogContextFromState(
  stateRaw: Record<string, unknown> | null | undefined,
  overrides?: { step_id?: unknown; contract_id?: unknown }
): StructuredLogContext {
  const state =
    stateRaw && typeof stateRaw === "object" ? (stateRaw as Record<string, unknown>) : {};
  const contractIdRaw =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "contract_id")
      ? overrides.contract_id
      : resolveContractId({}, state);
  return {
    correlation_id: normalizeLogField(state.__request_id, 512),
    session_id: normalizeLogField(state.bootstrap_session_id ?? state.__session_id, 128),
    step_id: normalizeLogField(
      overrides && Object.prototype.hasOwnProperty.call(overrides, "step_id")
        ? overrides.step_id
        : state.current_step,
      128
    ),
    contract_id: normalizeLogField(contractIdRaw, 128),
  };
}

function createLogContext(
  response: Record<string, unknown>,
  state: Record<string, unknown>
): StructuredLogContext {
  return createStructuredLogContextFromState(state, {
    step_id: response.current_step_id ?? state.current_step,
    contract_id: resolveContractId(response, state),
  });
}

export function logStructuredEvent(
  severity: StructuredLogSeverity,
  event: string,
  context: StructuredLogContext,
  details: Record<string, unknown> = {}
): void {
  const payload = {
    event: normalizeLogField(event, 128) || "event_unknown",
    correlation_id: context.correlation_id,
    session_id: context.session_id,
    step_id: context.step_id,
    contract_id: context.contract_id,
    severity,
    ...sanitizeLogDetails(details),
  };
  const text = JSON.stringify(payload);
  if (severity === "error") {
    console.error(text);
    return;
  }
  if (severity === "warn") {
    console.warn(text);
    return;
  }
  console.log(text);
}

type TokenUsageSnapshot = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  provider_available: boolean;
};

type RunStepResponseDeps = {
  applyUiClientActionContract: (targetState: CanvasState | null | undefined) => void;
  parseMenuFromContractIdForStep: (contractIdRaw: unknown, stepId: string) => string;
  labelKeysForMenuActionCodes: (menuId: string, actionCodes: string[]) => string[];
  onUiParityError: () => void;
  attachRegistryPayload: (
    payload: Record<string, unknown>,
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null
  ) => Record<string, unknown>;
  uiI18nTelemetry: Record<string, unknown>;
  tokenLoggingEnabled: boolean;
  baselineModel: string;
  getMigrationApplied: () => boolean;
  getMigrationFromVersion: () => string;
  getBlockingMarkerClass: () => string;
  resolveTurnTokenUsage: () => {
    usage: TokenUsageSnapshot;
    attempts: number;
    models: string[];
  };
};

export function createRunStepResponseHelpers(deps: RunStepResponseDeps) {
  function finalizeResponse<T extends Record<string, unknown>>(response: T): T {
    let finalResponse = finalizeResponseContractInternals(
      response as Record<string, unknown>,
      {
        applyUiClientActionContract: deps.applyUiClientActionContract,
        parseMenuFromContractIdForStep: deps.parseMenuFromContractIdForStep,
        labelKeysForMenuActionCodes: deps.labelKeysForMenuActionCodes,
        onUiParityError: deps.onUiParityError,
        attachRegistryPayload: deps.attachRegistryPayload,
      }
    ) as Record<string, unknown>;

    const telemetryTotal = Object.values(deps.uiI18nTelemetry).reduce<number>(
      (sum, value) => sum + Number(value || 0),
      0
    );
    const responseStateForTelemetry = finalResponse.state as CanvasState | undefined;
    if (responseStateForTelemetry && telemetryTotal > 0) {
      (responseStateForTelemetry as any).__ui_telemetry = {
        ...(typeof (responseStateForTelemetry as any).__ui_telemetry === "object"
          ? ((responseStateForTelemetry as any).__ui_telemetry as Record<string, unknown>)
          : {}),
        ...deps.uiI18nTelemetry,
      };
    }

    const stateForDecision = ((finalResponse as any)?.state || {}) as Record<string, unknown>;
    const errorMarkers = Array.isArray((finalResponse as any)?.error?.markers)
      ? ((finalResponse as any)?.error?.markers as unknown[]).map((marker) => String(marker || ""))
      : [];
    const markerClass = (() => {
      const blockingMarkerClass = deps.getBlockingMarkerClass();
      if (blockingMarkerClass !== "none") return blockingMarkerClass;
      if (errorMarkers.some((marker) => marker.startsWith("legacy_"))) return "legacy_marker";
      if (errorMarkers.includes("state_version_mismatch")) return "state_version_mismatch";
      if (errorMarkers.some((marker) => marker.startsWith("invalid_"))) return "invalid_state";
      return "none";
    })();
    const decisionContext = createLogContext(finalResponse, stateForDecision);
    logStructuredEvent("info", "contract_decision", decisionContext, {
      host_widget_session_id_present: String((stateForDecision as any).host_widget_session_id || "") ? "true" : "false",
      epoch: Number((stateForDecision as any).bootstrap_epoch || 0),
      seq: Number((stateForDecision as any).response_seq || 0),
      phase: String((stateForDecision as any).bootstrap_phase || ""),
      gate_status: String((stateForDecision as any).ui_gate_status || ""),
      gate_reason: String((stateForDecision as any).ui_gate_reason || ""),
      lang: String(
        (stateForDecision as any).ui_strings_lang ||
          (stateForDecision as any).locale ||
          (stateForDecision as any).language ||
          ""
      ),
      requested_lang: String((stateForDecision as any).ui_strings_requested_lang || ""),
      fallback_applied: String((stateForDecision as any).ui_strings_fallback_applied || "false"),
      migration_applied: deps.getMigrationApplied() ? "true" : "false",
      migration_from_version: deps.getMigrationFromVersion(),
      blocking_marker_class: markerClass,
    });

    if (!deps.tokenLoggingEnabled) return finalResponse as unknown as T;
    try {
      const responseState = (finalResponse as any)?.state as CanvasState | undefined;
      if (!responseState) return finalResponse as unknown as T;
      const sessionId = String((responseState as any).__session_id || "").trim();
      const sessionStartedAt = String((responseState as any).__session_started_at || "").trim();
      const turnId = String((responseState as any).__session_turn_id || "").trim();
      if (!sessionId || !sessionStartedAt || !turnId) return finalResponse as unknown as T;

      const tokenUsage = deps.resolveTurnTokenUsage();
      const model = tokenUsage.models.length > 0 ? tokenUsage.models.join(",") : deps.baselineModel;
      const appendResult = appendSessionTokenLog({
        sessionId,
        sessionStartedAt,
        filePath: String((responseState as any).__session_log_file || "").trim() || undefined,
        turn: {
          turn_id: turnId,
          timestamp: new Date().toISOString(),
          step_id: String((finalResponse as any).current_step_id || (responseState as any).current_step || ""),
          specialist: String((finalResponse as any).active_specialist || (responseState as any).active_specialist || ""),
          model,
          attempts: tokenUsage.attempts,
          usage: tokenUsage.usage,
        },
      });
      (responseState as any).__session_log_file = appendResult.filePath;
    } catch (err: any) {
      const stateForError =
        (finalResponse as any)?.state && typeof (finalResponse as any).state === "object"
          ? ((finalResponse as any).state as Record<string, unknown>)
          : {};
      logStructuredEvent("warn", "session_token_log_write_failed", createLogContext(finalResponse, stateForError), {
        message: String(err?.message || err || "unknown"),
      });
    }

    return finalResponse as unknown as T;
  }

  return { finalizeResponse };
}
