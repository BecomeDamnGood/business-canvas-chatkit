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
  const routeDecision = resolveModelForCall({
    fallbackModel: params.model,
    routingEnabled: routing.enabled,
    actionCode: routing.actionCode,
    intentType: routing.intentType,
    specialist: String(params.decision?.specialist_to_call ?? ""),
    purpose: "specialist",
  });
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
          elapsed_ms: Date.now() - startedAt,
          client_action_id: String((stateForError as any).__client_action_id ?? ""),
        },
      });
    }
    return { ok: true as const, value };
  } catch (err: any) {
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
          elapsed_ms: Date.now() - startedAt,
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
