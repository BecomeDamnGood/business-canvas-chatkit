import { appendSessionTokenLog } from "../core/session_token_log.js";
import type { CanvasState } from "../core/state.js";
import { finalizeResponseContractInternals } from "./turn_contract.js";

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

    console.log("[contract_decision]", {
      session_id: String((stateForDecision as any).bootstrap_session_id || ""),
      host_widget_session_id: String((stateForDecision as any).host_widget_session_id || ""),
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
      console.warn("[session_token_log_write_failed]", {
        message: String(err?.message || err || "unknown"),
      });
    }

    return finalResponse as unknown as T;
  }

  return { finalizeResponse };
}
