import { createHash } from "node:crypto";

const RUNTIME_IDEMPOTENCY_ENTRY_TTL_MS = Number(
  process.env.RUNTIME_IDEMPOTENCY_ENTRY_TTL_MS || 30 * 60 * 1000
);

export const RUNTIME_IDEMPOTENCY_ERROR_CODES = {
  REPLAY: "idempotency_replay",
  CONFLICT: "idempotency_key_conflict",
  INFLIGHT: "idempotency_replay_inflight",
} as const;

export type RuntimeIdempotencyEntry = {
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: "inflight" | "completed";
  updatedAtMs: number;
  resultForClient?: Record<string, unknown>;
};

const runtimeIdempotencyRegistry = new Map<string, RuntimeIdempotencyEntry>();

export function runtimeIdempotencyDelayMs(): number {
  const delayMs = Number(process.env.TEST_RUNTIME_IDEMPOTENCY_DELAY_MS || 0);
  return Number.isFinite(delayMs) && delayMs > 0 ? Math.trunc(delayMs) : 0;
}

function stableHashValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[depth_limit]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((entry) => stableHashValue(entry, depth + 1));
  if (typeof value !== "object") return String(value);
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(raw).sort()) {
    if (
      key === "__request_id" ||
      key === "__trace_id" ||
      key === "idempotency_key" ||
      key === "idempotency_outcome" ||
      key === "idempotency_error_code"
    ) {
      continue;
    }
    next[key] = stableHashValue(raw[key], depth + 1);
  }
  return next;
}

export function cloneRuntimeIdempotencyResult(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function createRuntimeIdempotencyRequestHash(args: {
  currentStepId: string;
  defaultStepId: string;
  userMessage: string;
  inputMode: string;
  localeHint: string;
  localeHintSource: string;
  state: Record<string, unknown>;
}): string {
  const payload = stableHashValue({
    current_step_id: String(args.currentStepId || args.defaultStepId).trim() || args.defaultStepId,
    user_message: String(args.userMessage || ""),
    input_mode: String(args.inputMode || "chat"),
    locale_hint: String(args.localeHint || ""),
    locale_hint_source: String(args.localeHintSource || "none"),
    state: args.state,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildRuntimeIdempotencyScopeKey(state: Record<string, unknown>): string {
  const bootstrapSessionId = String(state.bootstrap_session_id || "").trim();
  if (bootstrapSessionId) return `session:${bootstrapSessionId}`;
  const hostWidgetSessionId = String(state.host_widget_session_id || "").trim();
  if (hostWidgetSessionId) return `host:${hostWidgetSessionId}`;
  const runtimeSessionId = String(state.__session_id || "").trim();
  if (runtimeSessionId) return `runtime:${runtimeSessionId}`;
  return "scope:runtime_unknown";
}

export function buildRuntimeIdempotencyRegistryKey(scopeKey: string, idempotencyKey: string): string {
  return `${scopeKey}::${idempotencyKey}`;
}

export function getRuntimeIdempotencyEntry(registryKey: string): RuntimeIdempotencyEntry | undefined {
  return runtimeIdempotencyRegistry.get(registryKey);
}

export function deleteRuntimeIdempotencyEntry(registryKey: string): void {
  runtimeIdempotencyRegistry.delete(registryKey);
}

export function purgeExpiredRuntimeIdempotencyEntries(nowMs: number): void {
  for (const [registryKey, snapshot] of runtimeIdempotencyRegistry.entries()) {
    if (snapshot.updatedAtMs + RUNTIME_IDEMPOTENCY_ENTRY_TTL_MS <= nowMs) {
      runtimeIdempotencyRegistry.delete(registryKey);
    }
  }
}

export function markRuntimeIdempotencyInFlight(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  nowMs: number;
}): void {
  runtimeIdempotencyRegistry.set(params.registryKey, {
    scopeKey: params.scopeKey,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    status: "inflight",
    updatedAtMs: params.nowMs,
  });
}

export function markRuntimeIdempotencyCompleted(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  resultForClient: Record<string, unknown>;
  nowMs: number;
}): void {
  const existing = runtimeIdempotencyRegistry.get(params.registryKey);
  if (existing && existing.requestHash !== params.requestHash) return;
  runtimeIdempotencyRegistry.set(params.registryKey, {
    scopeKey: params.scopeKey,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    status: "completed",
    updatedAtMs: params.nowMs,
    resultForClient: cloneRuntimeIdempotencyResult(params.resultForClient),
  });
}

export function attachRuntimeIdempotencyDiagnostics(args: {
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
