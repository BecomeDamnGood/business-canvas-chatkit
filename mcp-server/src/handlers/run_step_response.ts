import { appendSessionTokenLog } from "../core/session_token_log.js";
import type { CanvasState } from "../core/state.js";
import { finalizeResponseContractInternals } from "./turn_contract.js";

export type StructuredLogSeverity = "info" | "warn" | "error";

export type StructuredLogContext = {
  correlation_id: string;
  trace_id: string;
  session_id: string;
  step_id: string;
  contract_id: string;
};

const LOG_REDACT_KEY_RE = /(authorization|cookie|token|secret|password|api[_-]?key)/i;
const LOG_REDACT_VALUE_RE =
  /(bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9._-]{8,}|xox[baprs]-[a-z0-9-]{8,}|api[_-]?key\s*[:=]\s*\S+)/i;

function normalizeLogField(value: unknown, maxLen = 256): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const normalized = normalizeLogField(value, 512);
    return LOG_REDACT_VALUE_RE.test(normalized) ? "[redacted]" : normalized;
  }
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
    if (
      key === "correlation_id" ||
      key === "trace_id" ||
      key === "session_id" ||
      key === "step_id" ||
      key === "contract_id"
    ) continue;
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
    trace_id: normalizeLogField(state.__trace_id ?? state.__request_id, 512),
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
    trace_id: context.trace_id,
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

type SubcallUsageSnapshot = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  provider_available: boolean;
};

type TurnSubcallSnapshot = {
  call_id: string;
  timestamp: string;
  step_id: string;
  specialist: string;
  model: string;
  trigger: string;
  action_code?: string;
  intent_type?: string;
  routing_source?: string;
  latency_ms?: number | null;
  attempts: number;
  usage: SubcallUsageSnapshot;
  ok?: boolean;
};

function normalizeSubcallUsage(raw: Record<string, unknown> | null | undefined): SubcallUsageSnapshot {
  const normalize = (value: unknown): number | null => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };
  return {
    input_tokens: normalize(raw?.input_tokens),
    output_tokens: normalize(raw?.output_tokens),
    total_tokens: normalize(raw?.total_tokens),
    provider_available: Boolean(raw?.provider_available),
  };
}

function buildTurnSubcalls(metaRows: Record<string, unknown>[]): TurnSubcallSnapshot[] {
  return metaRows
    .map((row, index) => {
      const usageRaw =
        row.usage && typeof row.usage === "object"
          ? (row.usage as Record<string, unknown>)
          : null;
      const latencyRaw = Number(row.elapsed_ms);
      const latencyMs =
        Number.isFinite(latencyRaw) && latencyRaw >= 0 ? Math.round(latencyRaw) : null;
      const attemptsRaw = Number(row.attempts);
      const attempts = Number.isFinite(attemptsRaw) && attemptsRaw >= 0 ? Math.trunc(attemptsRaw) : 0;
      return {
        call_id: String(row.call_id || "").trim() || `llm_call_${String(index + 1).padStart(3, "0")}`,
        timestamp: String(row.timestamp || new Date().toISOString()).trim() || new Date().toISOString(),
        step_id: String(row.step_id || "").trim() || "unknown",
        specialist: String(row.specialist || "").trim() || "unknown",
        model: String(row.model || "").trim() || "unknown",
        trigger: String(row.trigger || "").trim() || "unknown",
        action_code: String(row.action_code || "").trim(),
        intent_type: String(row.intent_type || "").trim(),
        routing_source: String(row.model_source || "").trim(),
        latency_ms: latencyMs,
        attempts,
        usage: normalizeSubcallUsage(usageRaw),
        ok: typeof row.ok === "boolean" ? Boolean(row.ok) : undefined,
      } as TurnSubcallSnapshot;
    })
    .filter((row) => Boolean(row.call_id));
}

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
    const canonicalViewDecisionRaw =
      finalResponse.__canonical_view_decision &&
      typeof finalResponse.__canonical_view_decision === "object" &&
      !Array.isArray(finalResponse.__canonical_view_decision)
        ? (finalResponse.__canonical_view_decision as Record<string, unknown>)
        : null;

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

    const stateForDecision =
      finalResponse.state && typeof finalResponse.state === "object"
        ? (finalResponse.state as Record<string, unknown>)
        : {};
    const markerClass = "none";
    const started = String(stateForDecision.started || "").trim().toLowerCase() === "true";
    const hasRenderableContent = String(canonicalViewDecisionRaw?.has_renderable_content || "false") === "true";
    const hasStartAction = String(canonicalViewDecisionRaw?.has_start_action || "false") === "true";
    const invariantOk = String(canonicalViewDecisionRaw?.invariant_ok || "false") === "true";
    const interactionState = String(canonicalViewDecisionRaw?.interaction_state || "").trim().toLowerCase();
    const isMutable = String(canonicalViewDecisionRaw?.is_mutable || "false") === "true";
    const editableFields = Array.isArray(canonicalViewDecisionRaw?.editable_fields)
      ? canonicalViewDecisionRaw?.editable_fields.map((field) => String(field || "").trim()).filter(Boolean)
      : [];
    const decisionContext = createLogContext(finalResponse, stateForDecision);
    logStructuredEvent("info", "run_step_canonical_view_emitted", decisionContext, {
      started,
      ui_view_mode: String(
        canonicalViewDecisionRaw?.ui_view_mode ||
          ((finalResponse?.ui as Record<string, unknown> | undefined)?.view as Record<string, unknown> | undefined)?.mode ||
          ""
      ).trim().toLowerCase(),
      has_renderable_content: hasRenderableContent,
      has_start_action: hasStartAction,
      interaction_state: interactionState,
      is_mutable: isMutable,
      editable_fields_count: editableFields.length,
      invariant_ok: invariantOk,
      reason_code: String(canonicalViewDecisionRaw?.reason_code || "").trim(),
      host_widget_session_id_present: String(stateForDecision.host_widget_session_id || "") ? "true" : "false",
      epoch: Number(stateForDecision.bootstrap_epoch || 0),
      seq: Number(stateForDecision.response_seq || 0),
      phase: String(stateForDecision.bootstrap_phase || ""),
      gate_status: String(stateForDecision.ui_gate_status || ""),
      gate_reason: String(stateForDecision.ui_gate_reason || ""),
      lang: String(
        stateForDecision.ui_strings_lang ||
          stateForDecision.locale ||
          stateForDecision.language ||
          ""
      ),
      requested_lang: String(stateForDecision.ui_strings_requested_lang || ""),
      fallback_applied: String(stateForDecision.ui_strings_fallback_applied || "false"),
      migration_applied: deps.getMigrationApplied() ? "true" : "false",
      migration_from_version: deps.getMigrationFromVersion(),
      blocking_marker_class: markerClass,
    });
    if (Object.prototype.hasOwnProperty.call(finalResponse, "__canonical_view_decision")) {
      delete finalResponse.__canonical_view_decision;
    }

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
      const llmMetaRows = Array.isArray((responseState as any).__llm_call_meta)
        ? ((responseState as any).__llm_call_meta as Record<string, unknown>[])
        : [];
      const lastLlmMeta = llmMetaRows.length > 0 ? llmMetaRows[llmMetaRows.length - 1] : null;
      const subcallLoggingEnabled = String(process.env.BSC_SUBCALL_TOKEN_LOG_V1 || "1").trim() !== "0";
      const subcalls = subcallLoggingEnabled ? buildTurnSubcalls(llmMetaRows) : [];
      const actionCode = String(
          (responseState as any).__turn_last_routing_action_code ||
          (responseState as any).__last_llm_action_code ||
          (responseState as any).__last_clicked_action_for_contract ||
          ""
      ).trim();
      const intentType = String(
        (responseState as any).__last_llm_intent_type ||
          (responseState as any).__turn_last_routing_intent_type ||
          ""
      ).trim();
      const routingSource = String(
        (lastLlmMeta?.model_source as string) ||
          (responseState as any).__last_llm_model_source ||
          (responseState as any).__last_llm_routing_source ||
          ""
      ).trim();
      const latencyRaw = Number(
        (lastLlmMeta?.elapsed_ms as number | undefined) ??
          (responseState as any).__last_llm_elapsed_ms
      );
      const latencyMs =
        Number.isFinite(latencyRaw) && latencyRaw >= 0 ? Math.round(latencyRaw) : null;
      const companyName = String((responseState as any).business_name || "").trim() || "UnknownCompany";
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
          action_code: actionCode,
          intent_type: intentType,
          routing_source: routingSource,
          latency_ms: latencyMs,
          company_name: companyName,
          attempts: tokenUsage.attempts,
          usage: tokenUsage.usage,
          ...(subcalls.length > 0 ? { subcalls } : {}),
        },
      });
      (responseState as any).__session_log_file = appendResult.filePath;
    } catch (err: any) {
      const finalResponseState = finalResponse.state;
      const stateForError =
        finalResponseState && typeof finalResponseState === "object"
          ? (finalResponseState as Record<string, unknown>)
          : {};
      logStructuredEvent("warn", "session_token_log_write_failed", createLogContext(finalResponse, stateForError), {
        message: String(err?.message || err || "unknown"),
      });
    }

    return finalResponse as unknown as T;
  }

  return { finalizeResponse };
}
