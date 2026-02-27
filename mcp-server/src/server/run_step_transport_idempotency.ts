import { getDefaultState, normalizeState } from "../core/state.js";
import { safeString } from "../server_safe_string.js";

import {
  attachBootstrapDiagnostics,
  attachIdempotencyDiagnostics,
  nextBootstrapResponseSeq,
} from "./ordering_parity.js";
import {
  buildIdempotencyRegistryKey,
  buildIdempotencyScopeKey,
  cloneRecord,
  createIdempotencyRequestHash,
  idempotencyRegistry,
  markIdempotencyInFlight,
  purgeExpiredIdempotencyEntries,
} from "./idempotency_registry.js";
import { logStructuredEvent, resolveContractIdFromRecord } from "./observability.js";
import { IDEMPOTENCY_ERROR_CODES, VERSION } from "./server_config.js";
import { buildModelSafeResult } from "./run_step_model_result.js";
import type {
  BootstrapOrdering,
  RunStepContext,
} from "./run_step_transport_context.js";

export type RunStepTransportResult = {
  structuredContent: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type IdempotencyTracker = {
  idempotencyKey: string;
  scopeKey: string;
  requestHash: string;
  registryKey: string;
};

function createStructuredResponse(
  params: {
    resultForClient: Record<string, unknown>;
    metaLabel: string;
  }
): RunStepTransportResult {
  return {
    structuredContent: {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: params.metaLabel,
      result: buildModelSafeResult(params.resultForClient),
    },
    meta: { widget_result: params.resultForClient },
  };
}

function buildIdempotencyErrorResult(params: {
  context: RunStepContext;
  incomingOrdering: BootstrapOrdering;
  errorType: "idempotency_conflict" | "idempotency_inflight";
  errorCode: string;
  message: string;
  retryAction: "retry_same_key" | "regenerate_key";
  outcome: "conflict" | "inflight";
}): Record<string, unknown> {
  const normalizedState = (() => {
    try {
      return normalizeState(
        params.context.stateForTool && typeof params.context.stateForTool === "object"
          ? params.context.stateForTool
          : getDefaultState()
      );
    } catch {
      return getDefaultState();
    }
  })();

  const responseSeq = nextBootstrapResponseSeq();
  const errorBase = {
    ok: false as const,
    tool: "run_step",
    current_step_id: params.context.currentStepId || "step_0",
    active_specialist: "",
    text: "",
    prompt: "",
    specialist: {},
    state: normalizedState,
    error: {
      type: params.errorType,
      category: "contract",
      severity: params.outcome === "inflight" ? "transient" : "fatal",
      retryable: params.outcome === "inflight",
      code: params.errorCode,
      message: params.message,
      retry_action: params.retryAction,
    },
  };

  const withBootstrap = attachBootstrapDiagnostics({
    responseKind: "run_step",
    resultForClient: errorBase as Record<string, unknown>,
    bootstrapSessionId: params.incomingOrdering.sessionId || params.context.normalizedBootstrapSessionId,
    bootstrapEpoch: params.incomingOrdering.epoch || params.context.normalizedBootstrapEpoch,
    responseSeq,
    hostWidgetSessionId: params.context.hostWidgetSessionId || params.incomingOrdering.hostWidgetSessionId,
  });

  return attachIdempotencyDiagnostics({
    resultForClient: withBootstrap,
    idempotencyKey: params.context.idempotencyKey,
    outcome: params.outcome,
    errorCode: params.errorCode,
  });
}

export function createIdempotencyTracker(context: RunStepContext): IdempotencyTracker | null {
  if (!context.idempotencyKey) return null;

  const scopeKey = buildIdempotencyScopeKey({
    bootstrapSessionId: context.normalizedBootstrapSessionId,
    hostWidgetSessionId: context.hostWidgetSessionId,
  });
  const requestHash = createIdempotencyRequestHash({
    currentStepId: context.currentStepId,
    userMessage: context.userMessageRaw,
    inputMode: context.inputMode,
    localeHint: context.localeHint,
    localeHintSource: context.localeHintSource,
    state: context.stateForTool,
  });
  const registryKey = buildIdempotencyRegistryKey(scopeKey, context.idempotencyKey);

  if (!requestHash || !registryKey) return null;
  return {
    idempotencyKey: context.idempotencyKey,
    scopeKey,
    requestHash,
    registryKey,
  };
}

export function preflightIdempotency(params: {
  context: RunStepContext;
  incomingOrdering: BootstrapOrdering;
  nowMs: number;
  tracker: IdempotencyTracker | null;
}): RunStepTransportResult | null {
  const { context, incomingOrdering, tracker, nowMs } = params;
  if (!tracker) return null;

  purgeExpiredIdempotencyEntries(nowMs);
  const existing = idempotencyRegistry.get(tracker.registryKey);

  if (existing) {
    if (existing.requestHash !== tracker.requestHash) {
      const conflictResult = buildIdempotencyErrorResult({
        context,
        incomingOrdering,
        errorType: "idempotency_conflict",
        errorCode: IDEMPOTENCY_ERROR_CODES.CONFLICT,
        message: "Deze idempotency key is al gebruikt met een ander request.",
        retryAction: "regenerate_key",
        outcome: "conflict",
      });

      logStructuredEvent(
        "warn",
        "idempotency_conflict",
        {
          correlation_id: context.correlationId,
          trace_id: context.traceId,
          session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
          step_id: context.stepIdStr || "step_0",
          contract_id: resolveContractIdFromRecord(conflictResult),
        },
        {
          input_mode: context.inputMode || "chat",
          action: context.action,
          idempotency_key_present: "true",
          reason: "payload_mismatch",
        }
      );

      return createStructuredResponse({
        resultForClient: conflictResult,
        metaLabel: "idempotency_conflict",
      });
    }

    if (existing.status === "completed" && existing.resultForClient) {
      const replayResult = attachIdempotencyDiagnostics({
        resultForClient: cloneRecord(existing.resultForClient),
        idempotencyKey: context.idempotencyKey,
        outcome: "replay",
        errorCode: IDEMPOTENCY_ERROR_CODES.REPLAY,
      });
      const replayState =
        replayResult.state && typeof replayResult.state === "object"
          ? (replayResult.state as Record<string, unknown>)
          : {};
      const replayStepMeta = safeString(replayState.current_step ?? context.currentStepId ?? "unknown") || "unknown";
      const replaySpecialistMeta = safeString(replayResult.active_specialist ?? "unknown") || "unknown";

      logStructuredEvent(
        "info",
        "idempotency_replay_served",
        {
          correlation_id: context.correlationId,
          trace_id: context.traceId,
          session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
          step_id: replayStepMeta,
          contract_id: resolveContractIdFromRecord(replayResult),
        },
        {
          input_mode: context.inputMode || "chat",
          action: context.action,
          idempotency_key_present: "true",
        }
      );

      return createStructuredResponse({
        resultForClient: replayResult,
        metaLabel: `step: ${replayStepMeta} | specialist: ${replaySpecialistMeta}`,
      });
    }

    const inflightResult = buildIdempotencyErrorResult({
      context,
      incomingOrdering,
      errorType: "idempotency_inflight",
      errorCode: IDEMPOTENCY_ERROR_CODES.INFLIGHT,
      message: "Een request met dezelfde idempotency key wordt al verwerkt.",
      retryAction: "retry_same_key",
      outcome: "inflight",
    });

    logStructuredEvent(
      "warn",
      "idempotency_replay_inflight",
      {
        correlation_id: context.correlationId,
        trace_id: context.traceId,
        session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
        step_id: context.stepIdStr || "step_0",
        contract_id: resolveContractIdFromRecord(inflightResult),
      },
      {
        input_mode: context.inputMode || "chat",
        action: context.action,
        idempotency_key_present: "true",
      }
    );

    return createStructuredResponse({
      resultForClient: inflightResult,
      metaLabel: "idempotency_inflight",
    });
  }

  markIdempotencyInFlight({
    registryKey: tracker.registryKey,
    scopeKey: tracker.scopeKey,
    idempotencyKey: tracker.idempotencyKey,
    requestHash: tracker.requestHash,
    nowMs,
  });

  return null;
}
