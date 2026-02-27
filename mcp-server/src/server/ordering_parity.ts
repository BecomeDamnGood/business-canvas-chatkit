import { randomUUID } from "node:crypto";

import {
  MCP_TOOL_CONTRACT_FAMILY_VERSION,
  RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
} from "../contracts/mcp_tool_contract.js";
import { VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import { safeString } from "../server_safe_string.js";

import {
  BOOTSTRAP_SESSION_ID_PREFIX,
  BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
  parsePositiveInt,
} from "./server_config.js";
import { logStructuredEvent, resolveContractIdFromRecord } from "./observability.js";

type BootstrapSessionSnapshot = {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  lastResponseSeq: number;
  updatedAtMs: number;
  lastWidgetResult: Record<string, unknown>;
};

const bootstrapSessionRegistry = new Map<string, BootstrapSessionSnapshot>();
let bootstrapResponseSeqCounter = 0;

function buildInternalHostWidgetSessionId(seed: unknown): string {
  const normalizedSeed = normalizeBootstrapSessionId(seed) || createBootstrapSessionId();
  return `internal:${normalizedSeed}`;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeBootstrapSessionId(raw: unknown): string {
  const value = safeString(raw ?? "").trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith(BOOTSTRAP_SESSION_ID_PREFIX)) {
    const uuid = value.slice(BOOTSTRAP_SESSION_ID_PREFIX.length);
    return isUuidV4(uuid) ? `${BOOTSTRAP_SESSION_ID_PREFIX}${uuid}` : "";
  }
  if (isUuidV4(value)) return `${BOOTSTRAP_SESSION_ID_PREFIX}${value}`;
  return "";
}

function createBootstrapSessionId(): string {
  return `${BOOTSTRAP_SESSION_ID_PREFIX}${randomUUID().toLowerCase()}`;
}

function nextBootstrapResponseSeq(): number {
  bootstrapResponseSeqCounter += 1;
  return bootstrapResponseSeqCounter;
}

function purgeExpiredBootstrapSessions(nowMs: number): void {
  for (const [sessionId, snapshot] of bootstrapSessionRegistry.entries()) {
    if (snapshot.updatedAtMs + BOOTSTRAP_SESSION_REGISTRY_TTL_MS <= nowMs) {
      bootstrapSessionRegistry.delete(sessionId);
    }
  }
}

function summarizeBootstrapSessions(nowMs: number): {
  total: number;
} {
  purgeExpiredBootstrapSessions(nowMs);
  return { total: bootstrapSessionRegistry.size };
}

function attachBootstrapDiagnostics(args: {
  responseKind: "run_step";
  resultForClient: Record<string, unknown>;
  bootstrapSessionId: string;
  bootstrapEpoch: number;
  responseSeq: number;
  hostWidgetSessionId?: string;
}): Record<string, unknown> {
  const {
    responseKind,
    resultForClient,
    bootstrapSessionId,
    bootstrapEpoch,
    responseSeq,
    hostWidgetSessionId,
  } = args;
  const stateRaw =
    resultForClient.state && typeof resultForClient.state === "object"
      ? (resultForClient.state as Record<string, unknown>)
      : {};
  const stateWithDiagnostics: Record<string, unknown> = {
    ...stateRaw,
    view_contract_version: VIEW_CONTRACT_VERSION,
    tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
    run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
    run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
    response_seq: responseSeq,
    response_kind: responseKind,
  };
  if (bootstrapSessionId) stateWithDiagnostics.bootstrap_session_id = bootstrapSessionId;
  if (bootstrapEpoch > 0) stateWithDiagnostics.bootstrap_epoch = bootstrapEpoch;
  if (hostWidgetSessionId) {
    stateWithDiagnostics.host_widget_session_id = hostWidgetSessionId;
  }
  const uiRaw =
    resultForClient.ui && typeof resultForClient.ui === "object"
      ? (resultForClient.ui as Record<string, unknown>)
      : {};
  const flagsRaw =
    uiRaw.flags && typeof uiRaw.flags === "object"
      ? (uiRaw.flags as Record<string, unknown>)
      : {};
  const uiWithDiagnostics: Record<string, unknown> = {
    ...uiRaw,
    flags: {
      ...flagsRaw,
      view_contract_version: VIEW_CONTRACT_VERSION,
      tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
      run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
      run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
      response_seq: responseSeq,
      response_kind: responseKind,
      ...(hostWidgetSessionId ? { host_widget_session_id: hostWidgetSessionId } : {}),
    },
  };
  if (bootstrapSessionId) {
    (uiWithDiagnostics.flags as Record<string, unknown>).bootstrap_session_id = bootstrapSessionId;
  }
  if (bootstrapEpoch > 0) {
    (uiWithDiagnostics.flags as Record<string, unknown>).bootstrap_epoch = bootstrapEpoch;
  }
  return {
    ...resultForClient,
    state: stateWithDiagnostics,
    ui: uiWithDiagnostics,
    response_seq: responseSeq,
    response_kind: responseKind,
    ...(bootstrapSessionId ? { bootstrap_session_id: bootstrapSessionId } : {}),
    ...(bootstrapEpoch > 0 ? { bootstrap_epoch: bootstrapEpoch } : {}),
    ...(hostWidgetSessionId ? { host_widget_session_id: hostWidgetSessionId } : {}),
  };
}

function attachIdempotencyDiagnostics(args: {
  resultForClient: Record<string, unknown>;
  idempotencyKey: string;
  outcome: "fresh" | "replay" | "conflict" | "inflight";
  errorCode?: string;
}): Record<string, unknown> {
  const { resultForClient, idempotencyKey, outcome, errorCode } = args;
  if (!idempotencyKey) return resultForClient;
  const stateRaw =
    resultForClient.state && typeof resultForClient.state === "object"
      ? (resultForClient.state as Record<string, unknown>)
      : {};
  const uiRaw =
    resultForClient.ui && typeof resultForClient.ui === "object"
      ? (resultForClient.ui as Record<string, unknown>)
      : {};
  const flagsRaw =
    uiRaw.flags && typeof uiRaw.flags === "object"
      ? (uiRaw.flags as Record<string, unknown>)
      : {};
  const stateWithDiagnostics: Record<string, unknown> = {
    ...stateRaw,
    idempotency_key: idempotencyKey,
    idempotency_outcome: outcome,
    ...(errorCode ? { idempotency_error_code: errorCode } : {}),
  };
  const uiWithDiagnostics: Record<string, unknown> = {
    ...uiRaw,
    flags: {
      ...flagsRaw,
      idempotency_key: idempotencyKey,
      idempotency_outcome: outcome,
      ...(errorCode ? { idempotency_error_code: errorCode } : {}),
    },
  };
  return {
    ...resultForClient,
    state: stateWithDiagnostics,
    ui: uiWithDiagnostics,
    idempotency_key: idempotencyKey,
    idempotency_outcome: outcome,
    ...(errorCode ? { idempotency_error_code: errorCode } : {}),
  };
}

function readBootstrapOrdering(result: Record<string, unknown> | null | undefined): {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  responseSeq: number;
} {
  const root = result && typeof result === "object" ? result : {};
  const state =
    root && typeof (root as any).state === "object"
      ? ((root as any).state as Record<string, unknown>)
      : {};
  const sessionId = normalizeBootstrapSessionId(state.bootstrap_session_id ?? (root as any).bootstrap_session_id ?? "");
  const hostWidgetSessionId = safeString(
    state.host_widget_session_id ??
      (root as any).host_widget_session_id ??
      ((root as any).ui && typeof (root as any).ui === "object" && (root as any).ui
        ? ((root as any).ui as any)?.flags?.host_widget_session_id
        : "")
  ).trim();
  const epoch = parsePositiveInt(state.bootstrap_epoch ?? (root as any).bootstrap_epoch);
  const responseSeq = parsePositiveInt(state.response_seq ?? (root as any).response_seq);
  return { sessionId, hostWidgetSessionId, epoch, responseSeq };
}

function hasCompleteOrderingTuple(ordering: {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  responseSeq: number;
}): boolean {
  return Boolean(ordering.sessionId && ordering.hostWidgetSessionId) && ordering.epoch > 0 && ordering.responseSeq > 0;
}

function describeBootstrapOrdering(ordering: {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  responseSeq: number;
}): {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  host_widget_session_id: string;
} {
  return {
    bootstrap_session_id: ordering.sessionId,
    bootstrap_epoch: ordering.epoch,
    response_seq: ordering.responseSeq,
    host_widget_session_id: ordering.hostWidgetSessionId,
  };
}

function orderingTupleEquals(
  left: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  },
  right: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  }
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.hostWidgetSessionId === right.hostWidgetSessionId &&
    left.epoch === right.epoch &&
    left.responseSeq === right.responseSeq
  );
}

function patchOrderingTupleOnResult(params: {
  result: Record<string, unknown>;
  ordering: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  };
  includeUiFlags?: boolean;
}): Record<string, unknown> {
  const root = params.result && typeof params.result === "object" ? params.result : {};
  const stateRaw =
    root.state && typeof root.state === "object"
      ? (root.state as Record<string, unknown>)
      : {};
  const patchedState: Record<string, unknown> = {
    ...stateRaw,
    bootstrap_session_id: params.ordering.sessionId,
    bootstrap_epoch: params.ordering.epoch,
    response_seq: params.ordering.responseSeq,
    host_widget_session_id: params.ordering.hostWidgetSessionId,
  };
  const patchedResult: Record<string, unknown> = {
    ...root,
    bootstrap_session_id: params.ordering.sessionId,
    bootstrap_epoch: params.ordering.epoch,
    response_seq: params.ordering.responseSeq,
    host_widget_session_id: params.ordering.hostWidgetSessionId,
    state: patchedState,
  };
  if (params.includeUiFlags) {
    const uiRaw =
      root.ui && typeof root.ui === "object"
        ? (root.ui as Record<string, unknown>)
        : {};
    const flagsRaw =
      uiRaw.flags && typeof uiRaw.flags === "object"
        ? (uiRaw.flags as Record<string, unknown>)
        : {};
    patchedResult.ui = {
      ...uiRaw,
      flags: {
        ...flagsRaw,
        bootstrap_session_id: params.ordering.sessionId,
        bootstrap_epoch: params.ordering.epoch,
        response_seq: params.ordering.responseSeq,
        host_widget_session_id: params.ordering.hostWidgetSessionId,
      },
    };
  }
  return patchedResult;
}

function resolveOrderingTupleParityCandidate(params: {
  metaOrdering: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  };
  topLevelOrdering: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  };
  requestOrdering: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  };
}): {
  ordering: {
    sessionId: string;
    hostWidgetSessionId: string;
    epoch: number;
    responseSeq: number;
  };
  source: string;
  complete: boolean;
} {
  const candidates = [
    { source: "meta_widget_result", ordering: params.metaOrdering },
    { source: "structured_content_result", ordering: params.topLevelOrdering },
    { source: "request_state", ordering: params.requestOrdering },
  ];
  const firstComplete = candidates.find((candidate) => hasCompleteOrderingTuple(candidate.ordering));
  if (firstComplete) {
    return {
      ordering: firstComplete.ordering,
      source: firstComplete.source,
      complete: true,
    };
  }
  const sessionEpochSeqCandidate = candidates.find((candidate) => {
    const ordering = candidate.ordering;
    return Boolean(ordering.sessionId) && ordering.epoch > 0 && ordering.responseSeq > 0;
  });
  if (!sessionEpochSeqCandidate) {
    return {
      ordering: {
        sessionId: "",
        hostWidgetSessionId: "",
        epoch: 0,
        responseSeq: 0,
      },
      source: "none",
      complete: false,
    };
  }
  const hostWidgetSessionId =
    sessionEpochSeqCandidate.ordering.hostWidgetSessionId ||
    params.requestOrdering.hostWidgetSessionId ||
    buildInternalHostWidgetSessionId(sessionEpochSeqCandidate.ordering.sessionId);
  return {
    ordering: {
      sessionId: sessionEpochSeqCandidate.ordering.sessionId,
      epoch: sessionEpochSeqCandidate.ordering.epoch,
      responseSeq: sessionEpochSeqCandidate.ordering.responseSeq,
      hostWidgetSessionId,
    },
    source: `${sessionEpochSeqCandidate.source}_host_backfilled`,
    complete: Boolean(hostWidgetSessionId),
  };
}

function ensureRunStepOutputTupleParity(params: {
  structuredContent: Record<string, unknown>;
  meta?: Record<string, unknown>;
  requestState: Record<string, unknown>;
  requestHostWidgetSessionId: string;
  correlationId: string;
  traceId: string;
  defaultStepId: string;
}): { structuredContent: Record<string, unknown>; meta?: Record<string, unknown> } {
  const metaRecord =
    params.meta && typeof params.meta === "object"
      ? (params.meta as Record<string, unknown>)
      : undefined;
  const structuredContent = params.structuredContent;
  const structuredRecord =
    structuredContent && typeof structuredContent === "object"
      ? (structuredContent as Record<string, unknown>)
      : null;
  const structuredResultCandidate = structuredRecord ? structuredRecord["result"] : undefined;
  const structuredResult =
    structuredResultCandidate && typeof structuredResultCandidate === "object"
      ? (structuredResultCandidate as Record<string, unknown>)
      : null;
  const metaWidgetResult =
    metaRecord &&
    metaRecord.widget_result &&
    typeof metaRecord.widget_result === "object"
      ? (metaRecord.widget_result as Record<string, unknown>)
      : null;
  if (!structuredResult && !metaWidgetResult) {
    return {
      structuredContent,
      ...(metaRecord ? { meta: metaRecord } : {}),
    };
  }

  const topLevelOrdering = readBootstrapOrdering(structuredResult);
  const metaOrdering = readBootstrapOrdering(metaWidgetResult);
  const requestOrdering = readBootstrapOrdering({
    state: params.requestState,
    host_widget_session_id: params.requestHostWidgetSessionId,
  });
  const candidate = resolveOrderingTupleParityCandidate({
    metaOrdering,
    topLevelOrdering,
    requestOrdering,
  });
  if (!candidate.complete) {
    return {
      structuredContent,
      ...(metaRecord ? { meta: metaRecord } : {}),
    };
  }

  let nextStructuredContent = structuredContent;
  let nextMeta = metaRecord;
  let patchedTopLevel = false;
  let patchedMeta = false;

  if (structuredResult && !orderingTupleEquals(topLevelOrdering, candidate.ordering)) {
    patchedTopLevel = true;
    nextStructuredContent = {
      ...structuredContent,
      result: patchOrderingTupleOnResult({
        result: structuredResult,
        ordering: candidate.ordering,
        includeUiFlags: false,
      }),
    };
  }
  if (metaWidgetResult && !orderingTupleEquals(metaOrdering, candidate.ordering)) {
    patchedMeta = true;
    nextMeta = {
      ...(metaRecord || {}),
      widget_result: patchOrderingTupleOnResult({
        result: metaWidgetResult,
        ordering: candidate.ordering,
        includeUiFlags: true,
      }),
    };
  }

  if (patchedTopLevel || patchedMeta) {
    logStructuredEvent(
      "warn",
      "run_step_output_tuple_parity_patched",
      {
        correlation_id: params.correlationId,
        trace_id: params.traceId,
        session_id: candidate.ordering.sessionId,
        step_id: params.defaultStepId || "step_0",
        contract_id: resolveContractIdFromRecord(metaWidgetResult || structuredResult || { state: params.requestState }),
      },
      {
        patched_top_level: patchedTopLevel,
        patched_meta_widget_result: patchedMeta,
        tuple_source: candidate.source,
        top_level_tuple_before: describeBootstrapOrdering(topLevelOrdering),
        meta_widget_result_tuple_before: describeBootstrapOrdering(metaOrdering),
        tuple_after: describeBootstrapOrdering(candidate.ordering),
      }
    );
  }

  return {
    structuredContent: nextStructuredContent,
    ...(nextMeta ? { meta: nextMeta } : {}),
  };
}

function registerBootstrapSnapshot(params: {
  result: Record<string, unknown>;
  nowMs: number;
}): void {
  purgeExpiredBootstrapSessions(params.nowMs);
  const ordering = readBootstrapOrdering(params.result);
  if (!ordering.sessionId || ordering.epoch <= 0 || ordering.responseSeq <= 0) return;
  const existing = bootstrapSessionRegistry.get(ordering.sessionId);
  if (
    existing &&
    (ordering.epoch < existing.epoch ||
      (ordering.epoch === existing.epoch && ordering.responseSeq < existing.lastResponseSeq))
  ) {
    return;
  }
  bootstrapSessionRegistry.set(ordering.sessionId, {
    sessionId: ordering.sessionId,
    hostWidgetSessionId: ordering.hostWidgetSessionId,
    epoch: ordering.epoch,
    lastResponseSeq: ordering.responseSeq,
    updatedAtMs: params.nowMs,
    lastWidgetResult: JSON.parse(JSON.stringify(params.result)) as Record<string, unknown>,
  });
}

function isStaleBootstrapPayload(params: {
  sessionId: string;
  hostWidgetSessionId?: string;
  epoch: number;
  responseSeq: number;
  nowMs: number;
}): { stale: boolean; latest: BootstrapSessionSnapshot | null; reason?: "host_session" | "epoch" | "response_seq" } {
  purgeExpiredBootstrapSessions(params.nowMs);
  const latest = bootstrapSessionRegistry.get(params.sessionId) || null;
  if (!latest) return { stale: false, latest: null };
  if (
    params.hostWidgetSessionId &&
    latest.hostWidgetSessionId &&
    params.hostWidgetSessionId !== latest.hostWidgetSessionId
  ) {
    return { stale: true, latest, reason: "host_session" };
  }
  if (params.epoch > 0 && params.epoch < latest.epoch) return { stale: true, latest, reason: "epoch" };
  if (
    params.epoch > 0 &&
    params.epoch === latest.epoch &&
    params.responseSeq > 0 &&
    params.responseSeq < latest.lastResponseSeq
  ) {
    return { stale: true, latest, reason: "response_seq" };
  }
  return { stale: false, latest };
}


export {
  attachBootstrapDiagnostics,
  attachIdempotencyDiagnostics,
  buildInternalHostWidgetSessionId,
  createBootstrapSessionId,
  describeBootstrapOrdering,
  ensureRunStepOutputTupleParity,
  hasCompleteOrderingTuple,
  isStaleBootstrapPayload,
  nextBootstrapResponseSeq,
  normalizeBootstrapSessionId,
  orderingTupleEquals,
  readBootstrapOrdering,
  registerBootstrapSnapshot,
  summarizeBootstrapSessions,
};
export type { BootstrapSessionSnapshot };
