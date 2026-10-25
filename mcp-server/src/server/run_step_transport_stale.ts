import { safeString } from "../server_safe_string.js";

import {
  normalizeHostWidgetSessionId,
  readStateFromWidgetResult,
} from "./locale_resolution.js";
import {
  attachIdempotencyDiagnostics,
  isStaleBootstrapPayload,
  normalizeBootstrapSessionId,
  readBootstrapOrdering,
} from "./ordering_parity.js";
import { markIdempotencyCompleted } from "./idempotency_registry.js";
import { logStructuredEvent, resolveContractIdFromRecord } from "./observability.js";
import { IDEMPOTENCY_ERROR_CODES, VERSION, parsePositiveInt } from "./server_config.js";
import { buildModelSafeResult } from "./run_step_model_result.js";
import type {
  BootstrapOrdering,
  RunStepContext,
} from "./run_step_transport_context.js";
import type { IdempotencyTracker, RunStepTransportResult } from "./run_step_transport_idempotency.js";

export type StalePreflightResult = {
  stateForTool: Record<string, unknown>;
  incomingOrdering: BootstrapOrdering;
  staleRebaseApplied: boolean;
  staleRebaseReasonCode: string;
  earlyDropReasonCode: string;
  earlyResponse: RunStepTransportResult | null;
};

export async function preflightStalePayload(params: {
  context: RunStepContext;
  incomingOrdering: BootstrapOrdering;
  nowMs: number;
  tracker: IdempotencyTracker | null;
}): Promise<StalePreflightResult> {
  const { context, nowMs, tracker } = params;
  let stateForTool = context.stateForTool;
  let incomingOrdering = params.incomingOrdering;
  if (!incomingOrdering.sessionId || incomingOrdering.epoch <= 0) {
    return unchanged(stateForTool, incomingOrdering);
  }

  const staleCheck = await isStaleBootstrapPayload({
    sessionId: incomingOrdering.sessionId,
    hostWidgetSessionId: incomingOrdering.hostWidgetSessionId,
    epoch: incomingOrdering.epoch,
    responseSeq: incomingOrdering.responseSeq,
    nowMs,
  });
  if (!staleCheck.stale || !staleCheck.latest) {
    return unchanged(stateForTool, incomingOrdering);
  }

  if (staleCheck.reason === "host_session") {
    const staleResult = attachIdempotencyDiagnostics({
      resultForClient: JSON.parse(JSON.stringify(staleCheck.latest.lastWidgetResult)) as Record<string, unknown>,
      idempotencyKey: context.idempotencyKey,
      outcome: "replay",
      ...(context.idempotencyKey ? { errorCode: IDEMPOTENCY_ERROR_CODES.REPLAY } : {}),
    });
    logStructuredEvent(
      "warn",
      "host_session_mismatch_dropped",
      {
        correlation_id: context.correlationId,
        trace_id: context.traceId,
        session_id: incomingOrdering.sessionId,
        step_id: context.stepIdStr || "step_0",
        contract_id: resolveContractIdFromRecord(staleResult),
      },
      { input_mode: context.inputMode || "chat", action: context.action }
    );
    if (tracker) {
      await markIdempotencyCompleted({
        registryKey: tracker.registryKey,
        scopeKey: tracker.scopeKey,
        idempotencyKey: tracker.idempotencyKey,
        requestHash: tracker.requestHash,
        resultForClient: staleResult,
        nowMs: Date.now(),
      });
    }
    return {
      stateForTool,
      incomingOrdering,
      staleRebaseApplied: false,
      staleRebaseReasonCode: "",
      earlyDropReasonCode: "host_session_mismatch",
      earlyResponse: {
        structuredContent: {
          title: `The Business Strategy Canvas Builder (${VERSION})`,
          meta: "host_session_mismatch",
          result: buildModelSafeResult(staleResult),
        },
        meta: { widget_result: staleResult },
      },
    };
  }

  const latestState = readStateFromWidgetResult(staleCheck.latest.lastWidgetResult);
  if (!latestState) return unchanged(stateForTool, incomingOrdering);

  const rebasedSessionId =
    normalizeBootstrapSessionId(latestState.bootstrap_session_id) || staleCheck.latest.sessionId;
  const rebasedEpoch = parsePositiveInt(latestState.bootstrap_epoch) || staleCheck.latest.epoch;
  const rebasedResponseSeq =
    parsePositiveInt(latestState.response_seq) || staleCheck.latest.lastResponseSeq;
  const rebasedHostWidgetSessionId =
    normalizeHostWidgetSessionId(latestState.host_widget_session_id) ||
    staleCheck.latest.hostWidgetSessionId ||
    context.hostWidgetSessionId;

  stateForTool = {
    ...latestState,
    ...(context.hasInitiator || !context.shouldSeedInitialUserMessage
      ? {}
      : { initial_user_message: context.normalizedMessage }),
    ...(context.shouldMarkStarted ? { started: "true" } : {}),
    __request_id: context.correlationId,
    ...(context.traceId ? { __trace_id: context.traceId } : {}),
    bootstrap_session_id: rebasedSessionId,
    bootstrap_epoch: rebasedEpoch,
    response_seq: rebasedResponseSeq,
    host_widget_session_id: rebasedHostWidgetSessionId,
    __idempotency_registry_owner: "server",
  };
  incomingOrdering = readBootstrapOrdering({ state: stateForTool });

  logStructuredEvent(
    "info",
    "stale_bootstrap_payload_rebased",
    {
      correlation_id: context.correlationId,
      trace_id: context.traceId,
      session_id: rebasedSessionId,
      step_id: safeString(latestState.current_step ?? context.stepIdStr ?? "step_0") || "step_0",
      contract_id: resolveContractIdFromRecord({ state: stateForTool }),
    },
    {
      input_mode: context.inputMode || "chat",
      action: context.action,
      stale_reason: staleCheck.reason || "response_seq",
      latest_response_seq: staleCheck.latest.lastResponseSeq,
    }
  );

  return {
    stateForTool,
    incomingOrdering,
    staleRebaseApplied: true,
    staleRebaseReasonCode: "stale_payload_rebased",
    earlyDropReasonCode: "",
    earlyResponse: null,
  };
}

function unchanged(
  stateForTool: Record<string, unknown>,
  incomingOrdering: BootstrapOrdering
): StalePreflightResult {
  return {
    stateForTool,
    incomingOrdering,
    staleRebaseApplied: false,
    staleRebaseReasonCode: "",
    earlyDropReasonCode: "",
    earlyResponse: null,
  };
}
