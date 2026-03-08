import { randomUUID } from "node:crypto";

import { safeString } from "../server_safe_string.js";

import {
  classifyStaleInteractiveActionPolicy,
  normalizeStepId,
  resolveEffectiveHostWidgetSessionId,
} from "./locale_resolution.js";
import {
  createBootstrapSessionId,
  normalizeBootstrapSessionId,
  readBootstrapOrdering,
} from "./ordering_parity.js";
import {
  logStructuredEvent,
  normalizeLogField,
  resolveContractIdFromRecord,
} from "./observability.js";
import {
  normalizeIdempotencyKey,
  parsePositiveInt,
} from "./server_config.js";

export type RunStepHandlerArgs = {
  current_step_id: string;
  user_message: string;
  input_mode?: "widget" | "chat";
  locale_hint?: string;
  locale_hint_source?: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
  idempotency_key?: string;
  correlation_id?: string;
  trace_id?: string;
  host_widget_session_id?: string;
  state?: Record<string, unknown>;
};

type LocaleHintSource = "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";

type StaleInteractiveActionPolicy = {
  normalizedAction: string;
  isInteractiveAction: boolean;
  rebaseEligible: boolean;
  reasonCode: "text_input" | "interactive_action";
};

export type RunStepContext = {
  correlationId: string;
  traceId: string;
  currentStepId: string;
  stepIdStr: string;
  stateForTool: Record<string, unknown>;
  userMessage: string;
  userMessageRaw: string;
  normalizedMessage: string;
  localeHint: string;
  localeHintSource: LocaleHintSource;
  inputMode: string;
  action: string;
  hostWidgetSessionId: string;
  staleIngestGuardEnabled: boolean;
  staleRebaseEnabled: boolean;
  staleInteractiveActionPolicy: StaleInteractiveActionPolicy;
  idempotencyKey: string;
  clientActionId: string;
  normalizedBootstrapSessionId: string;
  normalizedBootstrapEpoch: number;
  hasInitiator: boolean;
  shouldSeedInitialUserMessage: boolean;
  shouldMarkStarted: boolean;
};

export type BootstrapOrdering = {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  responseSeq: number;
};

export type ActionAckStatus = "accepted" | "rejected" | "timeout" | "dropped";

export type ActionLivenessContract = {
  ack_status: ActionAckStatus;
  state_advanced: boolean;
  reason_code: string;
  action_code_echo: string;
  client_action_id_echo: string;
};

export type ActionLivenessFailureClass =
  | "none"
  | "timeout"
  | "rejected"
  | "dropped"
  | "accepted_no_advance";

function normalizeAckStatus(raw: unknown): ActionAckStatus {
  const normalized = safeString(raw).trim().toLowerCase();
  if (normalized === "accepted") return "accepted";
  if (normalized === "rejected") return "rejected";
  if (normalized === "timeout") return "timeout";
  if (normalized === "dropped") return "dropped";
  return "rejected";
}

function normalizeReasonCode(raw: unknown): string {
  return safeString(raw).trim().toLowerCase();
}

function buildServerClientActionId(params: {
  action: string;
  correlationId: string;
}): string {
  const normalizedAction = safeString(params.action || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "_")
    .slice(0, 32);
  const normalizedCorrelation = safeString(params.correlationId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 48);
  const candidate = `ca_srv_${normalizedAction || "action"}_${normalizedCorrelation || "req"}`;
  return normalizeIdempotencyKey(candidate);
}

function alignInternalHostWidgetSessionId(params: {
  hostWidgetSessionId: string;
  bootstrapSessionId: string;
}): string {
  const normalizedHost = safeString(params.hostWidgetSessionId ?? "").trim();
  const normalizedBootstrap = normalizeBootstrapSessionId(params.bootstrapSessionId);
  if (!normalizedBootstrap) return normalizedHost;
  if (!normalizedHost) return `internal:${normalizedBootstrap}`;
  if (!normalizedHost.startsWith("internal:")) return normalizedHost;
  const internalSuffix = normalizeBootstrapSessionId(
    normalizedHost.slice("internal:".length)
  );
  if (!internalSuffix || internalSuffix !== normalizedBootstrap) {
    return `internal:${normalizedBootstrap}`;
  }
  return normalizedHost;
}

export function buildActionLivenessContract(
  context: RunStepContext,
  params: {
    ack_status: ActionAckStatus;
    state_advanced: boolean;
    reason_code?: string;
  }
): ActionLivenessContract {
  const ackStatus = normalizeAckStatus(params.ack_status);
  const stateAdvanced = params.state_advanced === true;
  const reasonCode = normalizeReasonCode(params.reason_code);
  return {
    ack_status: ackStatus,
    state_advanced: stateAdvanced,
    reason_code: stateAdvanced ? "" : (reasonCode || "state_not_advanced"),
    action_code_echo: safeString(context.action || "").trim().toUpperCase() || "TEXT_INPUT",
    client_action_id_echo: safeString(context.clientActionId || "").trim(),
  };
}

export function classifyActionLivenessFailureClass(
  contract: ActionLivenessContract
): ActionLivenessFailureClass {
  const ackStatus = normalizeAckStatus(contract.ack_status);
  if (ackStatus === "timeout") return "timeout";
  if (ackStatus === "dropped") return "dropped";
  if (ackStatus === "rejected") return "rejected";
  if (ackStatus === "accepted" && contract.state_advanced !== true) return "accepted_no_advance";
  return "none";
}

export function attachActionLivenessToResult(
  resultForClient: Record<string, unknown>,
  contract: ActionLivenessContract
): Record<string, unknown> {
  const failureClass = classifyActionLivenessFailureClass(contract);
  const state =
    resultForClient && typeof resultForClient.state === "object" && resultForClient.state
      ? (resultForClient.state as Record<string, unknown>)
      : {};
  const nextState = {
    ...state,
    ui_action_liveness: {
      ack_status: contract.ack_status,
      state_advanced: contract.state_advanced,
      reason_code: contract.reason_code,
      failure_class: failureClass,
      action_code_echo: contract.action_code_echo,
      client_action_id_echo: contract.client_action_id_echo,
    },
  };
  return {
    ...resultForClient,
    state: nextState,
    ack_status: contract.ack_status,
    state_advanced: contract.state_advanced,
    reason_code: contract.reason_code,
    failure_class: failureClass,
    action_code_echo: contract.action_code_echo,
    client_action_id_echo: contract.client_action_id_echo,
  };
}

export function hasStateAdvancedByResponseSeq(
  incomingOrdering: BootstrapOrdering,
  outgoingResponseSeq: number
): boolean {
  const outgoing = Number(outgoingResponseSeq);
  if (!Number.isFinite(outgoing) || outgoing <= 0) return false;
  const incoming = Number(incomingOrdering.responseSeq || 0);
  if (!Number.isFinite(incoming) || incoming <= 0) return true;
  return outgoing > incoming;
}

function normalizeLocaleHintSource(raw: unknown): LocaleHintSource {
  const localeHintSourceRaw = safeString(raw ?? "none");
  return localeHintSourceRaw === "openai_locale" ||
    localeHintSourceRaw === "webplus_i18n" ||
    localeHintSourceRaw === "request_header" ||
    localeHintSourceRaw === "message_detect"
    ? localeHintSourceRaw
    : "none";
}

function normalizeStep0Token(raw: unknown): string {
  return safeString(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function hydrateStep0ContextFromBootstrap(state: Record<string, unknown>): Record<string, unknown> {
  const bootstrap =
    state.step0_bootstrap && typeof state.step0_bootstrap === "object" && !Array.isArray(state.step0_bootstrap)
      ? (state.step0_bootstrap as Record<string, unknown>)
      : {};
  const venture = normalizeStep0Token(bootstrap.venture);
  const name = normalizeStep0Token(bootstrap.name);
  if (!venture || !name) return state;
  const status = safeString(bootstrap.status).trim().toLowerCase() === "existing" ? "existing" : "starting";
  const source = normalizeStep0Token(bootstrap.source);
  const businessName = normalizeStep0Token(state.business_name);
  const step0Final = normalizeStep0Token(state.step_0_final);
  return {
    ...state,
    step0_bootstrap: {
      ...(source ? { source } : {}),
      venture,
      name,
      status,
    },
    ...((!businessName || businessName.toLowerCase() === "tbd") ? { business_name: name } : {}),
    ...(step0Final ? {} : { step_0_final: `Venture: ${venture} | Name: ${name} | Status: ${status}` }),
  };
}

export function buildRunStepContext(args: RunStepHandlerArgs): RunStepContext {
  const correlationId = normalizeLogField(args.correlation_id, 512) || randomUUID();
  const traceId = normalizeLogField(args.trace_id, 512) || correlationId;
  const currentStepId = normalizeStepId(args.current_step_id ?? "");
  const state = (args.state ?? {}) as Record<string, unknown>;
  const userMessageRaw = safeString(args.user_message ?? "");
  const localeHintSource = normalizeLocaleHintSource(args.locale_hint_source);

  const isStart = currentStepId === "step_0";
  const normalizedMessage = userMessageRaw.trim();
  const upperMessage = normalizedMessage.toUpperCase();
  const isActionMessage = upperMessage.startsWith("ACTION_");
  const isBootstrapPollAction = upperMessage === "ACTION_BOOTSTRAP_POLL";
  const isStartAction = upperMessage === "ACTION_START";
  const isTechnicalRouteMessage =
    normalizedMessage.startsWith("__ROUTE__") || normalizedMessage.startsWith("choice:");
  const shouldMarkStarted = isStart && isStartAction;
  const shouldSeedInitialUserMessage =
    Boolean(normalizedMessage) &&
    !isActionMessage &&
    !isBootstrapPollAction &&
    !isTechnicalRouteMessage;
  const userMessage = isStart && !userMessageRaw.trim() ? "" : userMessageRaw;

  const hasInitiator = safeString(state.initial_user_message ?? "").trim() !== "";
  const resolvedHostWidgetSessionId = resolveEffectiveHostWidgetSessionId({
    provided: args.host_widget_session_id,
    state,
    bootstrapSessionId: state.bootstrap_session_id,
  });

  let stateForTool: Record<string, unknown> = hydrateStep0ContextFromBootstrap({
    ...state,
    ...(hasInitiator || !shouldSeedInitialUserMessage ? {} : { initial_user_message: normalizedMessage }),
    ...(shouldMarkStarted ? { started: "true" } : {}),
    __request_id: correlationId,
    ...(traceId ? { __trace_id: traceId } : {}),
  });

  const incomingBootstrapSessionRaw = safeString(stateForTool.bootstrap_session_id ?? "").trim();
  const incomingBootstrapSession = normalizeBootstrapSessionId(incomingBootstrapSessionRaw);
  if (incomingBootstrapSessionRaw && !incomingBootstrapSession) {
    logStructuredEvent(
      "warn",
      "bootstrap_session_id_rejected",
      {
        correlation_id: correlationId,
        trace_id: traceId,
        session_id: "",
        step_id: currentStepId,
        contract_id: resolveContractIdFromRecord({ state: stateForTool }),
      },
      {
        source: "run_step_state",
        provided_length: incomingBootstrapSessionRaw.length,
      }
    );
  }

  const normalizedBootstrapSessionId = incomingBootstrapSession || createBootstrapSessionId();
  const normalizedBootstrapEpoch = incomingBootstrapSession
    ? parsePositiveInt(stateForTool.bootstrap_epoch) || 1
    : 1;
  // Als het incoming session ID afgewezen was (niet geldig formaat), is dit een
  // volledig nieuwe sessie. Reset response_seq naar 0 zodat de eerste server-response
  // (seq=1) altijd > 0 is en state_advanced correct true wordt.
  const normalizedResponseSeq = incomingBootstrapSession
    ? parsePositiveInt(stateForTool.response_seq) // bestaande sessie: bewaar waarde
    : 0; // nieuwe sessie: altijd 0
  const hostWidgetSessionId = alignInternalHostWidgetSessionId({
    hostWidgetSessionId: resolvedHostWidgetSessionId,
    bootstrapSessionId: normalizedBootstrapSessionId,
  });
  stateForTool = {
    ...stateForTool,
    bootstrap_session_id: normalizedBootstrapSessionId,
    bootstrap_epoch: normalizedBootstrapEpoch,
    response_seq: normalizedResponseSeq,
    host_widget_session_id: hostWidgetSessionId,
    __idempotency_registry_owner: "server",
  };

  if (hostWidgetSessionId !== resolvedHostWidgetSessionId) {
    logStructuredEvent(
      "warn",
      "host_session_id_realigned_to_bootstrap",
      {
        correlation_id: correlationId,
        trace_id: traceId,
        session_id: normalizedBootstrapSessionId,
        step_id: currentStepId,
        contract_id: resolveContractIdFromRecord({ state: stateForTool }),
      },
      {
        previous_host_widget_session_id: resolvedHostWidgetSessionId,
        next_host_widget_session_id: hostWidgetSessionId,
        realign_reason: "internal_host_mismatch",
      }
    );
  }

  logStructuredEvent(
    "info",
    "host_session_id_seen",
    {
      correlation_id: correlationId,
      trace_id: traceId,
      session_id: normalizeBootstrapSessionId(state.bootstrap_session_id),
      step_id: currentStepId,
      contract_id: resolveContractIdFromRecord({ state }),
    },
    {
      source: hostWidgetSessionId.startsWith("internal:") ? "run_step_internal" : "run_step_args",
      host_widget_session_id_present: hostWidgetSessionId ? "true" : "false",
    }
  );

  const stepIdStr = safeString(currentStepId ?? "");
  const msgLen = typeof userMessageRaw === "string" ? userMessageRaw.length : 0;
  const localeHint = safeString(args.locale_hint ?? "");
  const inputMode = safeString(args.input_mode ?? "chat");
  const action = upperMessage.startsWith("ACTION_") ? upperMessage : "text_input";
  const staleIngestGuardEnabled = false;
  const staleRebaseEnabled = false;
  const staleInteractiveActionPolicy = classifyStaleInteractiveActionPolicy(action);
  const existingClientActionId = normalizeIdempotencyKey(
    safeString((stateForTool as { __client_action_id?: unknown }).__client_action_id ?? "")
  );
  const fallbackClientActionId =
    !existingClientActionId
      ? buildServerClientActionId({ action, correlationId })
      : "";
  const clientActionId = existingClientActionId || fallbackClientActionId;
  if (clientActionId) {
    stateForTool = {
      ...stateForTool,
      __client_action_id: clientActionId,
    };
  }
  const idempotencyKey =
    normalizeIdempotencyKey(args.idempotency_key) ||
    clientActionId;
  const stateKeysCount = Object.keys(stateForTool).length;

  logStructuredEvent(
    "info",
    "run_step_request",
    {
      correlation_id: correlationId,
      trace_id: traceId,
      session_id: normalizedBootstrapSessionId,
      step_id: stepIdStr || "step_0",
      contract_id: resolveContractIdFromRecord({ state: stateForTool }),
    },
    {
      input_mode: inputMode || "chat",
      action,
      user_message_len: msgLen,
      state_keys: stateKeysCount,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      host_widget_session_id_present: hostWidgetSessionId ? "true" : "false",
      idempotency_key_present: idempotencyKey ? "true" : "false",
      client_action_id_present: clientActionId ? "true" : "false",
      stale_ingest_guard_enabled: staleIngestGuardEnabled,
      stale_rebase_enabled: staleRebaseEnabled,
    }
  );

  return {
    correlationId,
    traceId,
    currentStepId,
    stepIdStr,
    stateForTool,
    userMessage,
    userMessageRaw,
    normalizedMessage,
    localeHint,
    localeHintSource,
    inputMode,
    action,
    hostWidgetSessionId,
    staleIngestGuardEnabled,
    staleRebaseEnabled,
    staleInteractiveActionPolicy,
    idempotencyKey,
    clientActionId,
    normalizedBootstrapSessionId,
    normalizedBootstrapEpoch,
    hasInitiator,
    shouldSeedInitialUserMessage,
    shouldMarkStarted,
  };
}

export function readIncomingOrdering(stateForTool: Record<string, unknown>): BootstrapOrdering {
  return readBootstrapOrdering({ state: stateForTool });
}
