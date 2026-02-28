import { normalizeState } from "../core/state.js";
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

export function preflightStalePayload(params: {
  context: RunStepContext;
  incomingOrdering: BootstrapOrdering;
  nowMs: number;
  tracker: IdempotencyTracker | null;
}): StalePreflightResult {
  const { context, nowMs, tracker } = params;
  let stateForTool = params.context.stateForTool;
  let incomingOrdering = params.incomingOrdering;
  let staleRebaseApplied = false;
  let staleRebaseReasonCode = "";
  let earlyDropReasonCode = "";

  if (incomingOrdering.sessionId && incomingOrdering.epoch > 0 && context.staleIngestGuardEnabled) {
    const staleCheck = isStaleBootstrapPayload({
      sessionId: incomingOrdering.sessionId,
      hostWidgetSessionId: incomingOrdering.hostWidgetSessionId,
      epoch: incomingOrdering.epoch,
      responseSeq: incomingOrdering.responseSeq,
      nowMs,
    });

    if (
      incomingOrdering.hostWidgetSessionId &&
      staleCheck.latest?.hostWidgetSessionId &&
      incomingOrdering.hostWidgetSessionId !== staleCheck.latest.hostWidgetSessionId
    ) {
      logStructuredEvent(
        "warn",
        "host_session_mismatch_dropped",
        {
          correlation_id: context.correlationId,
          trace_id: context.traceId,
          session_id: incomingOrdering.sessionId,
          step_id: context.stepIdStr || "step_0",
          contract_id: resolveContractIdFromRecord({ state: stateForTool }),
        },
        {
          input_mode: context.inputMode || "chat",
          action: context.action,
          host_widget_session_id_present: "true",
          drop_reason_code: "host_session_mismatch",
        }
      );
    }

    if (staleCheck.stale) {
      const payloadEpoch = incomingOrdering.epoch;
      const payloadResponseSeq = incomingOrdering.responseSeq;
      const payloadHostWidgetSessionIdPresent = incomingOrdering.hostWidgetSessionId ? "true" : "false";
      const latestStateSnapshot = readStateFromWidgetResult(staleCheck.latest?.lastWidgetResult);
      const canRebaseStalePayload =
        staleCheck.reason !== "host_session" &&
        context.staleRebaseEnabled &&
        context.staleInteractiveActionPolicy.rebaseEligible &&
        !!latestStateSnapshot;

      if (canRebaseStalePayload && latestStateSnapshot) {
        const rebasedSessionId =
          normalizeBootstrapSessionId((latestStateSnapshot as { bootstrap_session_id?: unknown }).bootstrap_session_id) ||
          staleCheck.latest?.sessionId ||
          incomingOrdering.sessionId ||
          context.normalizedBootstrapSessionId;
        const rebasedEpoch =
          parsePositiveInt((latestStateSnapshot as { bootstrap_epoch?: unknown }).bootstrap_epoch) ||
          staleCheck.latest?.epoch ||
          incomingOrdering.epoch ||
          context.normalizedBootstrapEpoch;
        const rebasedResponseSeq =
          parsePositiveInt((latestStateSnapshot as { response_seq?: unknown }).response_seq) ||
          staleCheck.latest?.lastResponseSeq ||
          incomingOrdering.responseSeq;
        const rebasedHostWidgetSessionId =
          normalizeHostWidgetSessionId((latestStateSnapshot as { host_widget_session_id?: unknown }).host_widget_session_id) ||
          staleCheck.latest?.hostWidgetSessionId ||
          context.hostWidgetSessionId;

        stateForTool = {
          ...latestStateSnapshot,
          ...(context.hasInitiator || !context.shouldSeedInitialUserMessage ? {} : { initial_user_message: context.normalizedMessage }),
          ...(context.shouldMarkStarted ? { started: "true" } : {}),
          __request_id: context.correlationId,
          ...(context.traceId ? { __trace_id: context.traceId } : {}),
          bootstrap_session_id: rebasedSessionId,
          bootstrap_epoch: rebasedEpoch,
          ...(rebasedResponseSeq > 0 ? { response_seq: rebasedResponseSeq } : {}),
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
            session_id: incomingOrdering.sessionId || context.normalizedBootstrapSessionId,
            step_id: safeString((stateForTool as { current_step?: unknown }).current_step ?? context.stepIdStr ?? "step_0") || "step_0",
            contract_id: resolveContractIdFromRecord({ state: stateForTool }),
          },
          {
            input_mode: context.inputMode || "chat",
            action: context.action,
            stale_reason: staleCheck.reason || "unknown",
            stale_reason_code: staleCheck.reason || "unknown",
            stale_policy_reason_code: context.staleInteractiveActionPolicy.reasonCode,
            rebase_reason_code: "stale_interactive_action_rebased",
            payload_epoch: payloadEpoch,
            payload_response_seq: payloadResponseSeq,
            latest_epoch: staleCheck.latest?.epoch || incomingOrdering.epoch,
            latest_response_seq: staleCheck.latest?.lastResponseSeq || 0,
            host_widget_session_id_present: payloadHostWidgetSessionIdPresent,
            stale_ingest_guard_enabled: context.staleIngestGuardEnabled,
            stale_rebase_enabled: context.staleRebaseEnabled,
          }
        );

        staleRebaseApplied = true;
        staleRebaseReasonCode = "stale_interactive_action_rebased";
      } else {
        const staleSource =
          staleCheck.latest?.lastWidgetResult && Object.keys(staleCheck.latest.lastWidgetResult).length
            ? (JSON.parse(JSON.stringify(staleCheck.latest.lastWidgetResult)) as Record<string, unknown>)
            : {
                ok: true,
                tool: "run_step",
                current_step_id: safeString((stateForTool as { current_step?: unknown }).current_step ?? "step_0") || "step_0",
                active_specialist: safeString((stateForTool as { active_specialist?: unknown }).active_specialist ?? ""),
                text: "",
                prompt: "",
                specialist: {},
                state: normalizeState(stateForTool),
              };

        const staleResult = attachIdempotencyDiagnostics({
          resultForClient: staleSource,
          idempotencyKey: context.idempotencyKey,
          outcome: "replay",
          ...(context.idempotencyKey ? { errorCode: IDEMPOTENCY_ERROR_CODES.REPLAY } : {}),
        });

        const staleStepMeta =
          safeString((staleResult.state as Record<string, unknown> | undefined)?.current_step ?? "unknown") || "unknown";
        const staleSpecialistMeta = safeString(staleResult.active_specialist ?? "unknown") || "unknown";
        const dropReasonCode =
          staleCheck.reason === "host_session"
            ? "host_session_mismatch"
            : !context.staleRebaseEnabled
              ? "stale_rebase_flag_disabled"
              : context.staleInteractiveActionPolicy.rebaseEligible
                ? "stale_rebase_state_missing"
                : "stale_action_not_rebase_eligible";

        logStructuredEvent(
          "warn",
          "stale_bootstrap_payload_dropped",
          {
            correlation_id: context.correlationId,
            trace_id: context.traceId,
            session_id: incomingOrdering.sessionId,
            step_id: context.stepIdStr || "step_0",
            contract_id: resolveContractIdFromRecord(staleResult),
          },
          {
            input_mode: context.inputMode || "chat",
            action: context.action,
            stale_reason: staleCheck.reason || "unknown",
            stale_reason_code: staleCheck.reason || "unknown",
            stale_policy_reason_code: context.staleInteractiveActionPolicy.reasonCode,
            drop_reason_code: dropReasonCode,
            payload_epoch: payloadEpoch,
            payload_response_seq: payloadResponseSeq,
            latest_epoch: staleCheck.latest?.epoch || incomingOrdering.epoch,
            latest_response_seq: staleCheck.latest?.lastResponseSeq || 0,
            host_widget_session_id_present: payloadHostWidgetSessionIdPresent,
            stale_ingest_guard_enabled: context.staleIngestGuardEnabled,
            stale_rebase_enabled: context.staleRebaseEnabled,
          }
        );

        const structuredContent: Record<string, unknown> = {
          title: `The Business Strategy Canvas Builder (${VERSION})`,
          meta: `step: ${staleStepMeta} | specialist: ${staleSpecialistMeta}`,
          result: buildModelSafeResult(staleResult),
        };

        if (tracker) {
          markIdempotencyCompleted({
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
          staleRebaseApplied,
          staleRebaseReasonCode,
          earlyDropReasonCode: dropReasonCode,
          earlyResponse: {
            structuredContent,
            meta: { widget_result: staleResult },
          },
        };
      }
    }
  }

  return {
    stateForTool,
    incomingOrdering,
    staleRebaseApplied,
    staleRebaseReasonCode,
    earlyDropReasonCode,
    earlyResponse: null,
  };
}
