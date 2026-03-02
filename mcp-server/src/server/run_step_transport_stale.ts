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
  const { context } = params;
  const stateForTool = context.stateForTool;
  const incomingOrdering = params.incomingOrdering;
  void params.nowMs;
  void params.tracker;
  return {
    stateForTool,
    incomingOrdering,
    staleRebaseApplied: false,
    staleRebaseReasonCode: "",
    earlyDropReasonCode: "",
    earlyResponse: null,
  };
}
