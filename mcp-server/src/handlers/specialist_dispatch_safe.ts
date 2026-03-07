import { resolveModelForCall } from "../core/model_routing.js";
import type { CanvasState } from "../core/state.js";
import {
  isRateLimitError,
  isTimeoutError,
} from "./specialist_dispatch_fallbacks.js";
import type {
  CallSpecialistStrictSafeDeps,
  RunStepErrorLike,
  SpecialistCallParams,
  SpecialistCallResult,
} from "./specialist_dispatch.js";

export async function callSpecialistStrictSafe(
  params: SpecialistCallParams,
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState,
  deps: CallSpecialistStrictSafeDeps
): Promise<
  { ok: true; value: SpecialistCallResult }
  | { ok: false; payload: RunStepErrorLike }
> {
  const startedAt = Date.now();
  const logDiagnostics = deps.shouldLogLocalDevDiagnostics();
  const stateMeta =
    stateForError && typeof stateForError === "object"
      ? (stateForError as unknown as Record<string, unknown>)
      : {};
  const routeDecision = resolveModelForCall({
    fallbackModel: params.model,
    routingEnabled: routing.enabled,
    actionCode: routing.actionCode,
    intentType: routing.intentType,
    specialist: String(params.decision?.specialist_to_call ?? ""),
    purpose: "specialist",
  });
  const ensureMetaLog = (): Record<string, unknown>[] => {
    const current = Array.isArray(stateMeta.__llm_call_meta)
      ? (stateMeta.__llm_call_meta as Record<string, unknown>[])
      : [];
    const next = [...current];
    stateMeta.__llm_call_meta = next;
    return next;
  };
  const baseMeta = {
    timestamp: new Date().toISOString(),
    specialist: String(params.decision?.specialist_to_call ?? ""),
    action_code: String(routing.actionCode || ""),
    intent_type: String(routing.intentType || ""),
    model: String(routeDecision.model || ""),
    candidate_model: String(routeDecision.candidate_model || ""),
    model_source: String(routeDecision.source || ""),
    config_version: String(routeDecision.config_version || ""),
  };
  stateMeta.__last_llm_routing_source = String(routeDecision.source || "");
  stateMeta.__last_llm_candidate_model = String(routeDecision.candidate_model || "");
  stateMeta.__last_llm_selected_model = String(routeDecision.model || "");
  if (
    !routeDecision.applied &&
    routing.shadow &&
    (deps.shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
    routeDecision.candidate_model &&
    routeDecision.candidate_model !== params.model
  ) {
    deps.logFromState?.({
      severity: "info",
      event: "model_routing_shadow",
      state: stateForError,
      step_id: String(params.decision?.current_step ?? ""),
      details: {
        specialist: String(params.decision?.specialist_to_call ?? ""),
        baseline_model: params.model,
        shadow_model: routeDecision.candidate_model,
        source: routeDecision.source,
        config_version: routeDecision.config_version,
        client_action_id: String((stateForError as any).__client_action_id ?? ""),
      },
    });
  }
  const callParams = {
    ...params,
    model: routeDecision.model,
  };
  try {
    const value = await deps.callSpecialistStrict(callParams);
    const elapsedMs = Date.now() - startedAt;
    stateMeta.__last_llm_elapsed_ms = elapsedMs;
    stateMeta.__last_llm_model_source = String(routeDecision.source || "");
    stateMeta.__last_llm_action_code = String(routing.actionCode || "");
    stateMeta.__last_llm_intent_type = String(routing.intentType || "");
    const metaLog = ensureMetaLog();
    metaLog.push({
      ...baseMeta,
      elapsed_ms: elapsedMs,
      ok: true,
      attempts: Number(value.attempts || 0),
    });
    if (metaLog.length > 30) metaLog.splice(0, metaLog.length - 30);
    if (logDiagnostics) {
      deps.logFromState?.({
        severity: "info",
        event: "run_step_llm_call",
        state: stateForError,
        step_id: String(params.decision?.current_step ?? ""),
        details: {
          ok: true,
          specialist: String(params.decision?.specialist_to_call ?? ""),
          model: String(value.model || routeDecision.model || ""),
            model_source: routeDecision.source,
            elapsed_ms: elapsedMs,
            client_action_id: String((stateForError as any).__client_action_id ?? ""),
          },
      });
    }
    return { ok: true as const, value };
  } catch (err: any) {
    const elapsedMs = Date.now() - startedAt;
    stateMeta.__last_llm_elapsed_ms = elapsedMs;
    stateMeta.__last_llm_model_source = String(routeDecision.source || "");
    stateMeta.__last_llm_action_code = String(routing.actionCode || "");
    stateMeta.__last_llm_intent_type = String(routing.intentType || "");
    const metaLog = ensureMetaLog();
    metaLog.push({
      ...baseMeta,
      elapsed_ms: elapsedMs,
      ok: false,
      attempts: 0,
      error_type: String(err?.type ?? err?.code ?? err?.name ?? "unknown"),
    });
    if (metaLog.length > 30) metaLog.splice(0, metaLog.length - 30);
    if (logDiagnostics) {
      deps.logFromState?.({
        severity: "warn",
        event: "run_step_llm_call",
        state: stateForError,
        step_id: String(params.decision?.current_step ?? ""),
        details: {
          ok: false,
            specialist: String(params.decision?.specialist_to_call ?? ""),
            model: String(routeDecision.model || ""),
            model_source: routeDecision.source,
            elapsed_ms: elapsedMs,
            client_action_id: String((stateForError as any).__client_action_id ?? ""),
            error_type: String(err?.type ?? err?.code ?? err?.name ?? "unknown"),
          },
      });
    }
    if (isRateLimitError(err)) {
      return { ok: false as const, payload: deps.buildRateLimitErrorPayload(stateForError, err) };
    }
    if (isTimeoutError(err)) {
      return { ok: false as const, payload: deps.buildTimeoutErrorPayload(stateForError, err) };
    }
    throw err;
  }
}

export function createCallSpecialistStrictSafe(
  deps: CallSpecialistStrictSafeDeps
): (
  params: SpecialistCallParams,
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState
) => Promise<{ ok: true; value: SpecialistCallResult } | { ok: false; payload: RunStepErrorLike }> {
  return (
    params: SpecialistCallParams,
    routing: {
      enabled: boolean;
      shadow: boolean;
      actionCode?: string;
      intentType?: string;
    },
    stateForError: CanvasState
  ) => callSpecialistStrictSafe(params, routing, stateForError, deps);
}
