import { createHash } from "node:crypto";

import {
  canonicalizeStateForRunStepArgs as canonicalizeStateForToolInput,
} from "../handlers/ingress.js";
import { safeString } from "../server_safe_string.js";

import {
  claimSharedAction,
  completeSharedAction,
  releaseSharedAction,
  sharedStoreBackend,
  type SharedActionEntry,
} from "./shared_session_store.js";

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
    if (key === "__request_id" || key === "__trace_id" || key === "__client_action_id") continue;
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

async function claimIdempotency(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  nowMs: number;
}): Promise<{ claimed: boolean; existing: SharedActionEntry | null }> {
  return claimSharedAction(params);
}

async function markIdempotencyCompleted(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  resultForClient: Record<string, unknown>;
  nowMs: number;
}): Promise<void> {
  await completeSharedAction({
    registryKey: params.registryKey,
    requestHash: params.requestHash,
    resultForClient: params.resultForClient,
    nowMs: params.nowMs,
  });
}

async function releaseIdempotency(params: {
  registryKey: string;
  requestHash: string;
}): Promise<void> {
  await releaseSharedAction(params);
}

function summarizeIdempotencyRegistry(): { backend: "memory" | "dynamodb" } {
  return { backend: sharedStoreBackend() };
}

export {
  createIdempotencyRequestHash,
  buildIdempotencyScopeKey,
  buildIdempotencyRegistryKey,
  claimIdempotency,
  cloneRecord,
  markIdempotencyCompleted,
  releaseIdempotency,
  summarizeIdempotencyRegistry,
};
