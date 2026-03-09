import type { CanvasState } from "../core/state.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
import type {
  BuildTransientFallbackDeps,
  ErrorPayloadDeps,
  RunStepErrorLike,
} from "./specialist_dispatch.js";
import { dropIncompatibleLastSpecialistResult } from "./locale_continuity.js";

export function isRateLimitError(err: any): boolean {
  return Boolean(
    err &&
    (err.rate_limited === true ||
      err.code === "rate_limit_exceeded" ||
      err.type === "rate_limit_exceeded" ||
      err.status === 429)
  );
}

export function isTimeoutError(err: any): boolean {
  return Boolean(err && err.type === "timeout");
}

export function hasUsableSpecialistForRetry(
  specialist: any,
  pickPrompt: (specialist: any) => string
): boolean {
  if (!specialist || typeof specialist !== "object") return false;
  const action = String(specialist.action || "").trim().toUpperCase();
  if (action !== "ASK") return false;
  const prompt = pickPrompt(specialist);
  const message = String(specialist.message || "").trim();
  const refined = String(specialist.refined_formulation || "").trim();
  return Boolean(prompt || message || refined);
}

export function buildTransientFallbackSpecialist(
  state: CanvasState,
  deps: BuildTransientFallbackDeps
): Record<string, unknown> {
  const safeState = dropIncompatibleLastSpecialistResult(state);
  const last = ((safeState as any).last_specialist_result || {}) as Record<string, unknown>;
  if (hasUsableSpecialistForRetry(last, deps.pickPrompt)) return last;

  const stepId = String((safeState as any).current_step || STEP_0_ID);
  if (stepId === STEP_0_ID) {
    return {
      action: "ASK",
      message: deps.step0CardDescForState(safeState),
      question: deps.step0QuestionForState(safeState),
      refined_formulation: "",
      business_name: String((safeState as any).business_name || "TBD"),
      step_0: "",
      step0_interaction_state: "step0_editing",
      is_mutable: true,
      editable_fields: ["business_name"],
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };
  }

  const rendered = deps.renderFreeTextTurnPolicy({
    stepId,
    state: safeState,
    specialist: {
      action: "ASK",
      message: "",
      question: "",
      refined_formulation: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: last,
  });
  return rendered.specialist;
}

export function buildRateLimitErrorPayload(
  state: CanvasState,
  err: any,
  deps: ErrorPayloadDeps
): RunStepErrorLike {
  const retryAfterMs = Number(err?.retry_after_ms) > 0 ? Number(err.retry_after_ms) : 1500;
  const timeoutGuardEnabled = deps.resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? deps.buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    deps.logFromState?.({
      severity: "warn",
      event: "transient_fallback_returned",
      state,
      step_id: String(state.current_step || "step_0"),
      details: {
        type: "rate_limited",
        retry_after_ms: retryAfterMs,
        client_action_id: String((state as any).__client_action_id ?? ""),
      },
    });
  }
  return deps.attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "rate_limited",
      category: "infra",
      severity: "transient",
      retryable: true,
      retry_after_ms: retryAfterMs,
      user_message: deps.uiStringFromStateMap(
        state,
        "transient.rate_limited",
        deps.uiDefaultString("transient.rate_limited", "")
      ),
      retry_action: "retry_same_action",
    },
  }, last) as RunStepErrorLike;
}

export function buildTimeoutErrorPayload(
  state: CanvasState,
  err: any,
  deps: ErrorPayloadDeps
): RunStepErrorLike {
  void err;
  const timeoutGuardEnabled = deps.resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? deps.buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    deps.logFromState?.({
      severity: "warn",
      event: "transient_fallback_returned",
      state,
      step_id: String(state.current_step || "step_0"),
      details: {
        type: "timeout",
        client_action_id: String((state as any).__client_action_id ?? ""),
      },
    });
  }
  return deps.attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "timeout",
      category: "infra",
      severity: "transient",
      retryable: true,
      user_message: deps.uiStringFromStateMap(
        state,
        "transient.timeout",
        deps.uiDefaultString("transient.timeout", "")
      ),
      retry_action: "retry_same_action",
    },
  }, last) as RunStepErrorLike;
}

export function createBuildTransientFallbackSpecialist(
  deps: BuildTransientFallbackDeps
): (state: CanvasState) => Record<string, unknown> {
  return (state: CanvasState) => buildTransientFallbackSpecialist(state, deps);
}

export function createBuildRateLimitErrorPayload(
  deps: ErrorPayloadDeps
): (state: CanvasState, err: any) => RunStepErrorLike {
  return (state: CanvasState, err: any) => buildRateLimitErrorPayload(state, err, deps);
}

export function createBuildTimeoutErrorPayload(
  deps: ErrorPayloadDeps
): (state: CanvasState, err: any) => RunStepErrorLike {
  return (state: CanvasState, err: any) => buildTimeoutErrorPayload(state, err, deps);
}
