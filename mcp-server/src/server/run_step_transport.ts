import { readFileSync } from "node:fs";

import {
  getDefaultState,
  normalizeState,
} from "../core/state.js";
import { safeString } from "../server_safe_string.js";

import {
  attachBootstrapDiagnostics,
  attachIdempotencyDiagnostics,
  nextBootstrapResponseSeq,
  registerBootstrapSnapshot,
} from "./ordering_parity.js";
import {
  VERSION,
  getRunStep,
  parsePositiveInt,
} from "./server_config.js";
import {
  classifyRunStepExecutionError,
  logStructuredEvent,
  resolveContractIdFromRecord,
} from "./observability.js";
import { markIdempotencyCompleted } from "./idempotency_registry.js";
import { buildModelSafeResult } from "./run_step_model_result.js";
import {
  attachActionLivenessToResult,
  buildActionLivenessContract,
  buildRunStepContext,
  hasStateAdvancedByResponseSeq,
  type RunStepHandlerArgs,
  readIncomingOrdering,
  type ActionAckStatus,
  type ActionLivenessContract,
} from "./run_step_transport_context.js";
import {
  createIdempotencyTracker,
  preflightIdempotency,
  type RunStepTransportResult,
} from "./run_step_transport_idempotency.js";
import { preflightStalePayload } from "./run_step_transport_stale.js";
import { injectUiVersion } from "./locale_resolution.js";

function loadUiHtml(): string {
  try {
    const raw = readFileSync(new URL("../../ui/step-card.bundled.html", import.meta.url), "utf-8");
    return injectUiVersion(raw);
  } catch (e) {
    console.error("[loadUiHtml] Failed:", e);
    return "<html><body>UI not available</body></html>";
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function applyActionLivenessToTransportResult(
  transportResult: RunStepTransportResult,
  contract: ActionLivenessContract
): RunStepTransportResult {
  const meta = toRecord(transportResult.meta);
  const widgetResult = toRecord(meta.widget_result);
  if (Object.keys(widgetResult).length === 0) return transportResult;
  const nextWidgetResult = attachActionLivenessToResult(widgetResult, contract);
  const structuredContent = toRecord(transportResult.structuredContent);
  const structuredResult = toRecord(structuredContent.result);
  const structuredState = toRecord(structuredResult.state);
  const nextStructuredResult = {
    ...structuredResult,
    state: {
      ...structuredState,
      ui_action_liveness: {
        ack_status: contract.ack_status,
        state_advanced: contract.state_advanced,
        reason_code: contract.reason_code,
        action_code_echo: contract.action_code_echo,
        client_action_id_echo: contract.client_action_id_echo,
      },
    },
    ack_status: contract.ack_status,
    state_advanced: contract.state_advanced,
    reason_code: contract.reason_code,
    action_code_echo: contract.action_code_echo,
    client_action_id_echo: contract.client_action_id_echo,
  };
  return {
    structuredContent: {
      ...(transportResult.structuredContent && typeof transportResult.structuredContent === "object"
        ? transportResult.structuredContent
        : {}),
      ...structuredContent,
      result: nextStructuredResult,
    },
    meta: {
      ...(transportResult.meta && typeof transportResult.meta === "object" ? transportResult.meta : {}),
      ...meta,
      widget_result: nextWidgetResult,
    },
  };
}

function resolveIdempotencyEarlyLiveness(
  widgetResult: Record<string, unknown>
): { ack_status: ActionAckStatus; reason_code: string } {
  const state = toRecord(widgetResult.state);
  const error = toRecord(widgetResult.error);
  const outcome = safeString(state.idempotency_outcome || widgetResult.idempotency_outcome).trim().toLowerCase();
  const errorType = safeString(error.type).trim().toLowerCase();
  if (outcome === "replay") {
    return { ack_status: "dropped", reason_code: "idempotency_replay" };
  }
  if (errorType === "idempotency_inflight") {
    return { ack_status: "rejected", reason_code: "idempotency_inflight" };
  }
  if (errorType === "idempotency_conflict") {
    return { ack_status: "rejected", reason_code: "idempotency_conflict" };
  }
  return {
    ack_status: "rejected",
    reason_code: errorType || "idempotency_preflight_rejected",
  };
}

function logActionLivenessDispatch(params: {
  context: ReturnType<typeof buildRunStepContext>;
  incomingOrdering: ReturnType<typeof readIncomingOrdering>;
}): void {
  const { context, incomingOrdering } = params;
  logStructuredEvent(
    "info",
    "run_step_action_liveness_dispatch",
    {
      correlation_id: context.correlationId,
      trace_id: context.traceId,
      session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
      step_id: context.stepIdStr || "step_0",
      contract_id: resolveContractIdFromRecord({ state: context.stateForTool }),
    },
    {
      action_code: context.action,
      client_action_id: context.clientActionId,
      dispatch_count: 1,
      bootstrap_session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
      bootstrap_epoch: incomingOrdering.epoch || context.normalizedBootstrapEpoch,
      response_seq: incomingOrdering.responseSeq,
      host_widget_session_id: incomingOrdering.hostWidgetSessionId || context.hostWidgetSessionId,
    }
  );
}

function logActionLivenessOutcome(params: {
  context: ReturnType<typeof buildRunStepContext>;
  stepId: string;
  contractId: string;
  incomingOrdering: ReturnType<typeof readIncomingOrdering>;
  outgoingOrdering?: {
    sessionId: string;
    epoch: number;
    responseSeq: number;
    hostWidgetSessionId: string;
  };
  liveness: ActionLivenessContract;
}): void {
  const { context, liveness, incomingOrdering, outgoingOrdering } = params;
  const shared = {
    action_code: liveness.action_code_echo,
    client_action_id: liveness.client_action_id_echo,
    ack_status: liveness.ack_status,
    state_advanced: liveness.state_advanced,
    reason_code: liveness.reason_code,
    bootstrap_session_id: outgoingOrdering?.sessionId || incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
    bootstrap_epoch: outgoingOrdering?.epoch || incomingOrdering.epoch || context.normalizedBootstrapEpoch,
    response_seq: outgoingOrdering?.responseSeq || incomingOrdering.responseSeq,
    host_widget_session_id: outgoingOrdering?.hostWidgetSessionId || incomingOrdering.hostWidgetSessionId || context.hostWidgetSessionId,
  };
  const baseContext = {
    correlation_id: context.correlationId,
    trace_id: context.traceId,
    session_id: shared.bootstrap_session_id,
    step_id: params.stepId || "step_0",
    contract_id: params.contractId,
  };
  logStructuredEvent("info", "run_step_action_liveness_ack", baseContext, {
    ...shared,
    ack_count: 1,
  });
  if (liveness.state_advanced) {
    logStructuredEvent("info", "run_step_action_liveness_advance", baseContext, {
      ...shared,
      advance_count: 1,
    });
  } else {
    logStructuredEvent("warn", "run_step_action_liveness_explicit_error", baseContext, {
      ...shared,
      explicit_error_count: 1,
    });
  }
}

/** Shared run_step logic for MCP tool and POST /run_step (local testing). */
async function runStepHandler(args: RunStepHandlerArgs): Promise<{ structuredContent: Record<string, unknown>; meta?: Record<string, unknown> }> {
  const context = buildRunStepContext(args);
  let incomingOrdering = readIncomingOrdering(context.stateForTool);
  const idempotencyTracker = createIdempotencyTracker(context);
  const nowMs = Date.now();
  logActionLivenessDispatch({ context, incomingOrdering });

  const idempotencyPreflight = preflightIdempotency({
    context,
    incomingOrdering,
    nowMs,
    tracker: idempotencyTracker,
  });
  if (idempotencyPreflight) {
    const preflightWidgetResult = toRecord(toRecord(idempotencyPreflight.meta).widget_result);
    const preflightLiveness = resolveIdempotencyEarlyLiveness(preflightWidgetResult);
    const livenessContract = buildActionLivenessContract(context, {
      ack_status: preflightLiveness.ack_status,
      state_advanced: false,
      reason_code: preflightLiveness.reason_code,
    });
    const enriched = applyActionLivenessToTransportResult(idempotencyPreflight, livenessContract);
    logActionLivenessOutcome({
      context,
      stepId: safeString(preflightWidgetResult.current_step_id || context.currentStepId) || "step_0",
      contractId: resolveContractIdFromRecord(preflightWidgetResult),
      incomingOrdering,
      liveness: livenessContract,
      outgoingOrdering: {
        sessionId: safeString((preflightWidgetResult.state as Record<string, unknown> | undefined)?.bootstrap_session_id || incomingOrdering.sessionId),
        epoch: parsePositiveInt((preflightWidgetResult.state as Record<string, unknown> | undefined)?.bootstrap_epoch || incomingOrdering.epoch),
        responseSeq: parsePositiveInt((preflightWidgetResult.state as Record<string, unknown> | undefined)?.response_seq || incomingOrdering.responseSeq),
        hostWidgetSessionId: safeString(
          (preflightWidgetResult.state as Record<string, unknown> | undefined)?.host_widget_session_id ||
            incomingOrdering.hostWidgetSessionId ||
            context.hostWidgetSessionId
        ),
      },
    });
    return enriched;
  }

  const stalePreflight = preflightStalePayload({
    context,
    incomingOrdering,
    nowMs,
    tracker: idempotencyTracker,
  });
  if (stalePreflight.earlyResponse) {
    const staleWidgetResult = toRecord(toRecord(stalePreflight.earlyResponse.meta).widget_result);
    const staleLiveness = buildActionLivenessContract(context, {
      ack_status: "dropped",
      state_advanced: false,
      reason_code: stalePreflight.earlyDropReasonCode || "stale_payload_dropped",
    });
    const enriched = applyActionLivenessToTransportResult(stalePreflight.earlyResponse, staleLiveness);
    logActionLivenessOutcome({
      context,
      stepId: safeString(staleWidgetResult.current_step_id || context.currentStepId) || "step_0",
      contractId: resolveContractIdFromRecord(staleWidgetResult),
      incomingOrdering,
      liveness: staleLiveness,
      outgoingOrdering: {
        sessionId: safeString((staleWidgetResult.state as Record<string, unknown> | undefined)?.bootstrap_session_id || incomingOrdering.sessionId),
        epoch: parsePositiveInt((staleWidgetResult.state as Record<string, unknown> | undefined)?.bootstrap_epoch || incomingOrdering.epoch),
        responseSeq: parsePositiveInt((staleWidgetResult.state as Record<string, unknown> | undefined)?.response_seq || incomingOrdering.responseSeq),
        hostWidgetSessionId: safeString(
          (staleWidgetResult.state as Record<string, unknown> | undefined)?.host_widget_session_id ||
            incomingOrdering.hostWidgetSessionId ||
            context.hostWidgetSessionId
        ),
      },
    });
    return enriched;
  }

  context.stateForTool = stalePreflight.stateForTool;
  incomingOrdering = stalePreflight.incomingOrdering;
  const staleRebaseApplied = stalePreflight.staleRebaseApplied;
  const staleRebaseReasonCode = stalePreflight.staleRebaseReasonCode;

  try {
    const runStepTool = await getRunStep();
    const result = await runStepTool({
      user_message: context.userMessage,
      input_mode: args.input_mode,
      locale_hint: context.localeHint,
      locale_hint_source: context.localeHintSource,
      state: context.stateForTool,
    });
    const { debug: _omit, ...resultForClientRaw } = result as {
      debug?: unknown;
      [key: string]: unknown;
    };
    const resultStateRaw =
      resultForClientRaw && typeof resultForClientRaw.state === "object" && resultForClientRaw.state
        ? (resultForClientRaw.state as Record<string, unknown>)
        : {};
    const responseSeq = nextBootstrapResponseSeq();
    const sessionId = safeString(resultStateRaw.bootstrap_session_id || incomingOrdering.sessionId);
    const epoch = parsePositiveInt(resultStateRaw.bootstrap_epoch || incomingOrdering.epoch);

    let resultForClient = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: resultForClientRaw,
      bootstrapSessionId: sessionId,
      bootstrapEpoch: epoch,
      responseSeq,
      hostWidgetSessionId: context.hostWidgetSessionId,
    });
    resultForClient = attachIdempotencyDiagnostics({
      resultForClient,
      idempotencyKey: context.idempotencyKey,
      outcome: "fresh",
    });
    const stateAdvanced = hasStateAdvancedByResponseSeq(incomingOrdering, responseSeq);
    const resultErrorType = safeString((toRecord(resultForClient.error).type as string | undefined) ?? "").trim().toLowerCase();
    const livenessContract = buildActionLivenessContract(context, {
      ack_status: resultForClient.ok === true ? "accepted" : (resultErrorType === "timeout" ? "timeout" : "rejected"),
      state_advanced: resultForClient.ok === true ? stateAdvanced : false,
      reason_code:
        resultForClient.ok === true
          ? (stateAdvanced ? "" : "state_not_advanced")
          : (resultErrorType || "explicit_error"),
    });
    resultForClient = attachActionLivenessToResult(resultForClient, livenessContract);

    const stepMeta = safeString((result as { state?: { current_step?: string } }).state?.current_step ?? "unknown") || "unknown";
    const specialistMeta = safeString((result as { active_specialist?: string }).active_specialist ?? "unknown") || "unknown";
    const resultState =
      resultForClient && typeof resultForClient.state === "object" && resultForClient.state
        ? (resultForClient.state as Record<string, unknown>)
        : {};
    const resultUi =
      resultForClient && typeof resultForClient.ui === "object" && resultForClient.ui
        ? (resultForClient.ui as Record<string, unknown>)
        : {};
    const resultUiFlags =
      resultUi.flags && typeof resultUi.flags === "object"
        ? (resultUi.flags as Record<string, unknown>)
        : {};
    const resultUiView =
      resultUi.view && typeof resultUi.view === "object"
        ? (resultUi.view as Record<string, unknown>)
        : {};

    const bootstrapWaitingLocale = resultUiFlags.bootstrap_waiting_locale === true;
    const bootstrapRetryHint = safeString(resultUiFlags.bootstrap_retry_hint ?? "");
    const bootstrapRetryScheduled = bootstrapWaitingLocale && bootstrapRetryHint === "poll";

    logStructuredEvent(
      "info",
      "run_step_response",
      {
        correlation_id: context.correlationId,
        trace_id: context.traceId,
        session_id: safeString(resultState.bootstrap_session_id || sessionId),
        step_id: safeString(resultState.current_step ?? stepMeta) || "unknown",
        contract_id: resolveContractIdFromRecord(resultForClient),
      },
      {
        input_mode: context.inputMode || "chat",
        resolved_language: safeString(resultState.language ?? ""),
        language_source: safeString(resultState.language_source ?? ""),
        ui_strings_status: safeString(resultState.ui_strings_status ?? ""),
        ui_translation_mode: safeString(resultState.ui_translation_mode ?? ""),
        ui_strings_critical_ready: safeString(resultState.ui_strings_critical_ready ?? ""),
        ui_strings_full_ready: safeString(resultState.ui_strings_full_ready ?? ""),
        bootstrap_phase: safeString(resultState.bootstrap_phase ?? resultUiFlags.bootstrap_phase ?? ""),
        ui_bootstrap_status: safeString(resultState.ui_bootstrap_status ?? ""),
        ui_gate_status: safeString(resultState.ui_gate_status ?? ""),
        ui_gate_reason: safeString(resultState.ui_gate_reason ?? ""),
        ui_gate_since_ms: Number(resultState.ui_gate_since_ms ?? 0) || 0,
        bootstrap_waiting_locale: bootstrapWaitingLocale,
        bootstrap_retry_scheduled: bootstrapRetryScheduled,
        ui_view_mode: safeString(resultUiView.mode ?? ""),
        ui_action_start_present: safeString(resultState.ui_action_start ?? "") === "ACTION_START",
        host_widget_session_id_present: context.hostWidgetSessionId ? "true" : "false",
        active_specialist: specialistMeta,
        accept_reason_code: staleRebaseApplied ? "accepted_after_stale_rebase" : "accepted_fresh_dispatch",
        rebase_applied: staleRebaseApplied,
        rebase_reason_code: staleRebaseReasonCode,
        stale_ingest_guard_enabled: context.staleIngestGuardEnabled,
        stale_rebase_enabled: context.staleRebaseEnabled,
        ack_status: livenessContract.ack_status,
        state_advanced: livenessContract.state_advanced,
        reason_code: livenessContract.reason_code,
        action_code_echo: livenessContract.action_code_echo,
        client_action_id_echo: livenessContract.client_action_id_echo,
      }
    );
    logActionLivenessOutcome({
      context,
      stepId: safeString(resultState.current_step || stepMeta) || "unknown",
      contractId: resolveContractIdFromRecord(resultForClient),
      incomingOrdering,
      outgoingOrdering: {
        sessionId: safeString(resultState.bootstrap_session_id || sessionId),
        epoch: parsePositiveInt(resultState.bootstrap_epoch || epoch),
        responseSeq: parsePositiveInt(resultState.response_seq || responseSeq),
        hostWidgetSessionId: safeString(resultState.host_widget_session_id || context.hostWidgetSessionId),
      },
      liveness: livenessContract,
    });

    const modelResult = buildModelSafeResult(resultForClient);
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: `step: ${stepMeta} | specialist: ${specialistMeta}`,
      result: modelResult,
    };

    registerBootstrapSnapshot({
      result: resultForClient,
      nowMs: Date.now(),
    });

    if (idempotencyTracker) {
      markIdempotencyCompleted({
        registryKey: idempotencyTracker.registryKey,
        scopeKey: idempotencyTracker.scopeKey,
        idempotencyKey: idempotencyTracker.idempotencyKey,
        requestHash: idempotencyTracker.requestHash,
        resultForClient,
        nowMs: Date.now(),
      });
    }

    return {
      structuredContent,
      meta: {
        widget_result: resultForClient,
      },
    };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const debugState = context.stateForTool as { debug?: { enable?: unknown } };
    const debugEnabled =
      process.env.LOCAL_DEV === "1" ||
      safeString(debugState.debug?.enable ?? "").toLowerCase() === "true";
    const errorStatus = (err.status ?? (err as { statusCode?: unknown }).statusCode) as unknown;
    const errorCode = err.code as unknown;
    const classification = classifyRunStepExecutionError(err);

    logStructuredEvent(
      "error",
      "run_step_error",
      {
        correlation_id: context.correlationId,
        trace_id: context.traceId,
        session_id: incomingOrdering.sessionId || safeString((context.stateForTool as { bootstrap_session_id?: unknown }).bootstrap_session_id),
        step_id: safeString((context.stateForTool as { current_step?: unknown }).current_step ?? context.currentStepId) || "step_0",
        contract_id: resolveContractIdFromRecord({ state: context.stateForTool }),
      },
      {
        message: safeString((err.message as string | undefined) ?? String(err ?? "unknown_error")),
        status: errorStatus === undefined ? "" : safeString(errorStatus),
        code: errorCode === undefined ? "" : safeString(errorCode),
        error_category: classification.category,
        error_severity: classification.severity,
        error_type: classification.type,
        retry_action: classification.retry_action,
        debug_enabled: debugEnabled ? "true" : "false",
      }
    );

    const stack = err.stack;
    if (debugEnabled && stack) {
      logStructuredEvent(
        "error",
        "run_step_error_stack",
        {
          correlation_id: context.correlationId,
          trace_id: context.traceId,
          session_id: incomingOrdering.sessionId || safeString((context.stateForTool as { bootstrap_session_id?: unknown }).bootstrap_session_id),
          step_id: safeString((context.stateForTool as { current_step?: unknown }).current_step ?? context.currentStepId) || "step_0",
          contract_id: resolveContractIdFromRecord({ state: context.stateForTool }),
        },
        {
          stack: safeString(stack),
          openai_api_key_present: Boolean(process.env.OPENAI_API_KEY),
        }
      );
    }

    const currentState = (() => {
      try {
        return normalizeState(
          context.stateForTool && typeof context.stateForTool === "object"
            ? context.stateForTool
            : getDefaultState()
        );
      } catch {
        return getDefaultState();
      }
    })();
    const currentStep = safeString((currentState as { current_step?: unknown }).current_step ?? "step_0") || "step_0";

    const responseSeq = nextBootstrapResponseSeq();
    const fallbackResultBase = {
      ok: false as const,
      tool: "run_step",
      current_step_id: currentStep,
      active_specialist: "",
      text: "",
      prompt: "",
      specialist: {},
      state: currentState,
      error: {
        type: classification.type,
        category: classification.category,
        severity: classification.severity,
        retryable: classification.severity === "transient",
        code: classification.code,
        message: classification.user_message,
        retry_action: classification.retry_action,
      },
    };

    let fallbackResult = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: fallbackResultBase as Record<string, unknown>,
      bootstrapSessionId: incomingOrdering.sessionId,
      bootstrapEpoch: incomingOrdering.epoch,
      responseSeq,
      hostWidgetSessionId: context.hostWidgetSessionId || incomingOrdering.hostWidgetSessionId,
    });
    fallbackResult = attachIdempotencyDiagnostics({
      resultForClient: fallbackResult,
      idempotencyKey: context.idempotencyKey,
      outcome: "fresh",
    });
    const fallbackLiveness = buildActionLivenessContract(context, {
      ack_status: classification.severity === "transient" ? "timeout" : "rejected",
      state_advanced: false,
      reason_code: safeString(classification.type || classification.code || "run_step_error"),
    });
    fallbackResult = attachActionLivenessToResult(fallbackResult, fallbackLiveness);
    logActionLivenessOutcome({
      context,
      stepId: currentStep,
      contractId: resolveContractIdFromRecord(fallbackResult),
      incomingOrdering,
      outgoingOrdering: {
        sessionId: safeString((fallbackResult.state as Record<string, unknown> | undefined)?.bootstrap_session_id || incomingOrdering.sessionId),
        epoch: parsePositiveInt((fallbackResult.state as Record<string, unknown> | undefined)?.bootstrap_epoch || incomingOrdering.epoch),
        responseSeq: parsePositiveInt((fallbackResult.state as Record<string, unknown> | undefined)?.response_seq || responseSeq),
        hostWidgetSessionId: safeString(
          (fallbackResult.state as Record<string, unknown> | undefined)?.host_widget_session_id ||
            incomingOrdering.hostWidgetSessionId ||
            context.hostWidgetSessionId
        ),
      },
      liveness: fallbackLiveness,
    });

    registerBootstrapSnapshot({
      result: fallbackResult,
      nowMs: Date.now(),
    });

    if (idempotencyTracker) {
      markIdempotencyCompleted({
        registryKey: idempotencyTracker.registryKey,
        scopeKey: idempotencyTracker.scopeKey,
        idempotencyKey: idempotencyTracker.idempotencyKey,
        requestHash: idempotencyTracker.requestHash,
        resultForClient: fallbackResult,
        nowMs: Date.now(),
      });
    }

    const modelResult = buildModelSafeResult(fallbackResult as Record<string, unknown>);
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: "error",
      result: modelResult,
    };
    return {
      structuredContent,
      meta: {
        widget_result: fallbackResult,
      },
    };
  }
}

export {
  loadUiHtml,
  runStepHandler,
};
