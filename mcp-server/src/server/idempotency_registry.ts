import { createHash } from "node:crypto";

import {
  canonicalizeStateForRunStepArgs as canonicalizeStateForToolInput,
} from "../handlers/ingress.js";
import { safeString } from "../server_safe_string.js";

import {
  IDEMPOTENCY_ENTRY_TTL_MS,
} from "./server_config.js";

type IdempotencyRegistryEntry = {
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: "inflight" | "completed";
  updatedAtMs: number;
  resultForClient?: Record<string, unknown>;
};

const idempotencyRegistry = new Map<string, IdempotencyRegistryEntry>();

function toStableHashValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[depth_limit]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => toStableHashValue(entry, depth + 1));
  if (typeof value !== "object") return safeString(value);
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(raw).sort()) {
    if (key === "__request_id" || key === "__trace_id") continue;
    next[key] = toStableHashValue(raw[key], depth + 1);
  }
  return next;
}

function createIdempotencyRequestHash(args: {
  currentStepId: string;
  userMessage: string;
  inputMode: string;
  localeHint: string;
  localeHintSource: string;
  state: Record<string, unknown>;
}): string {
  const payload = toStableHashValue({
    current_step_id: safeString(args.currentStepId || "step_0") || "step_0",
    user_message: safeString(args.userMessage ?? ""),
    input_mode: safeString(args.inputMode || "chat") || "chat",
    locale_hint: safeString(args.localeHint ?? ""),
    locale_hint_source: safeString(args.localeHintSource ?? "none") || "none",
    state: canonicalizeStateForToolInput(args.state),
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildIdempotencyScopeKey(params: {
  bootstrapSessionId: string;
  hostWidgetSessionId: string;
}): string {
  if (params.bootstrapSessionId) return `session:${params.bootstrapSessionId}`;
  if (params.hostWidgetSessionId) return `host:${params.hostWidgetSessionId}`;
  return "scope:unknown";
}

function buildIdempotencyRegistryKey(scopeKey: string, idempotencyKey: string): string {
  return `${scopeKey}::${idempotencyKey}`;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function purgeExpiredIdempotencyEntries(nowMs: number): void {
  for (const [registryKey, snapshot] of idempotencyRegistry.entries()) {
    if (snapshot.updatedAtMs + IDEMPOTENCY_ENTRY_TTL_MS <= nowMs) {
      idempotencyRegistry.delete(registryKey);
    }
  }
}

function summarizeIdempotencyRegistry(nowMs: number): {
  total: number;
  inflight: number;
  completed: number;
} {
  purgeExpiredIdempotencyEntries(nowMs);
  let inflight = 0;
  let completed = 0;
  for (const entry of idempotencyRegistry.values()) {
    if (entry.status === "inflight") inflight += 1;
    else completed += 1;
  }
  return {
    total: idempotencyRegistry.size,
    inflight,
    completed,
  };
}

function markIdempotencyInFlight(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  nowMs: number;
}): void {
  idempotencyRegistry.set(params.registryKey, {
    scopeKey: params.scopeKey,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    status: "inflight",
    updatedAtMs: params.nowMs,
  });
}

function markIdempotencyCompleted(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  resultForClient: Record<string, unknown>;
  nowMs: number;
}): void {
  const existing = idempotencyRegistry.get(params.registryKey);
  if (existing && existing.requestHash !== params.requestHash) return;
  idempotencyRegistry.set(params.registryKey, {
    scopeKey: params.scopeKey,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    status: "completed",
    updatedAtMs: params.nowMs,
    resultForClient: cloneRecord(params.resultForClient),
  });
}

export {
  createIdempotencyRequestHash,
  buildIdempotencyScopeKey,
  buildIdempotencyRegistryKey,
  cloneRecord,
  idempotencyRegistry,
  markIdempotencyCompleted,
  markIdempotencyInFlight,
  purgeExpiredIdempotencyEntries,
  summarizeIdempotencyRegistry,
};
export type { IdempotencyRegistryEntry };
