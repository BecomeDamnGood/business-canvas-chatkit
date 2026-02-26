// mcp-server/server.ts
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRateLimitMiddleware } from "./src/middleware/rateLimit.js";
import { applySecurityHeaders } from "./src/middleware/security.js";
import {
  MCP_TOOL_CONTRACT_FAMILY_VERSION,
  RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
  RUN_STEP_TOOL_COMPAT_POLICY,
  RUN_STEP_TOOL_CONTRACT_META,
  RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
  RunStepToolInputSchema,
  RunStepToolStructuredContentOutputSchema,
} from "./src/contracts/mcp_tool_contract.js";
import {
  CURRENT_STATE_VERSION,
  CanvasStateZod,
  getDefaultState,
  getFinalsSnapshot,
  normalizeState,
} from "./src/core/state.js";
import { getPresentationTemplatePath } from "./src/core/presentation_paths.js";
import { safeString } from "./src/server_safe_string.js";
import {
  VIEW_CONTRACT_VERSION,
} from "./src/core/bootstrap_runtime.js";
import {
  canonicalizeStateForRunStepArgs as canonicalizeStateForToolInput,
  normalizeIngressIdempotencyKey,
} from "./src/handlers/ingress.js";

function loadDotEnv() {
  try {
    const raw = readFileSync(new URL("./.env", import.meta.url), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!key) continue;
      // Strip surrounding quotes if present.
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file found; ignore.
  }
}

loadDotEnv();

// Keep module reference cached, but force-load during boot so startup fails fast on handler/type errors.
let runStepModule: typeof import("./src/handlers/run_step.js") | null = null;
async function getRunStep() {
  if (!runStepModule) runStepModule = await import("./src/handlers/run_step.js");
  return runStepModule.run_step;
}

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const isLocalDev = process.env.LOCAL_DEV === "1";

// Keep this aligned with your release tag
const VERSION = safeString(process.env.VERSION ?? "").trim() || "v119";
const IMAGE_DIGEST = safeString(process.env.IMAGE_DIGEST ?? "").trim();

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

const MCP_PATH = "/mcp";
const UI_RESOURCE_PATH = "/ui/step-card";
const UI_RESOURCE_QUERY = `?v=${encodeURIComponent(VERSION)}`;
const UI_RESOURCE_NAME = "business-canvas-widget";
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024); // 1MB default
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000); // 30s default
const BOOTSTRAP_SESSION_REGISTRY_TTL_MS = Number(process.env.BOOTSTRAP_SESSION_REGISTRY_TTL_MS || 30 * 60 * 1000);
const IDEMPOTENCY_ENTRY_TTL_MS = Number(process.env.IDEMPOTENCY_ENTRY_TTL_MS || BOOTSTRAP_SESSION_REGISTRY_TTL_MS);
const BOOTSTRAP_SESSION_ID_PREFIX = "bs_";
const IDEMPOTENCY_ERROR_CODES = {
  REPLAY: "idempotency_replay",
  CONFLICT: "idempotency_key_conflict",
  INFLIGHT: "idempotency_replay_inflight",
} as const;
type BootstrapSessionSnapshot = {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  lastResponseSeq: number;
  updatedAtMs: number;
  lastWidgetResult: Record<string, unknown>;
};
const bootstrapSessionRegistry = new Map<string, BootstrapSessionSnapshot>();
type IdempotencyRegistryEntry = {
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: "inflight" | "completed";
  updatedAtMs: number;
  resultForClient?: Record<string, unknown>;
};
const idempotencyRegistry = new Map<string, IdempotencyRegistryEntry>();
let bootstrapResponseSeqCounter = 0;

function parsePositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

const normalizeIdempotencyKey = normalizeIngressIdempotencyKey;

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

function getHeader(req: any, name: string): string {
  return safeString(req?.headers?.[name.toLowerCase()] || "");
}

function getCorrelationId(req: any): string {
  const existing =
    getHeader(req, "x-correlation-id") ||
    getHeader(req, "x-request-id") ||
    getHeader(req, "x-amzn-trace-id") ||
    getHeader(req, "traceparent");
  return existing ? safeString(existing) : randomUUID();
}

function getTraceId(req: any): string {
  return (
    getHeader(req, "x-amzn-trace-id") ||
    getHeader(req, "traceparent") ||
    getHeader(req, "x-b3-traceid")
  );
}

function ensureCorrelationHeader(res: any, correlationId: string) {
  if (!res.headersSent) {
    res.setHeader("X-Correlation-Id", correlationId);
  }
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode: number, headers?: Record<string, string>) {
    const hdrs = headers ? { ...headers } : {};
    if (!hdrs["X-Correlation-Id"] && !hdrs["x-correlation-id"]) {
      hdrs["X-Correlation-Id"] = correlationId;
    }
    return originalWriteHead(statusCode, hdrs);
  };
}

type StructuredLogSeverity = "info" | "warn" | "error";

type StructuredLogContext = {
  correlation_id?: unknown;
  trace_id?: unknown;
  session_id?: unknown;
  step_id?: unknown;
  contract_id?: unknown;
};

const LOG_REDACT_KEY_RE = /(authorization|cookie|token|secret|password|api[_-]?key)/i;
const LOG_REDACT_VALUE_RE =
  /(bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9._-]{8,}|xox[baprs]-[a-z0-9-]{8,}|api[_-]?key\s*[:=]\s*\S+)/i;

function normalizeLogField(value: unknown, maxLen = 256): string {
  const text = safeString(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const normalized = normalizeLogField(value, 512);
    return LOG_REDACT_VALUE_RE.test(normalized) ? "[redacted]" : normalized;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    if (depth >= 2) return "[array_omitted]";
    return value.slice(0, 20).map((entry) => sanitizeLogValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object_omitted]";
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(entry, depth + 1);
    }
    return next;
  }
  return normalizeLogField(value, 256);
}

function sanitizeLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "event" || key === "severity") continue;
    if (
      key === "correlation_id" ||
      key === "trace_id" ||
      key === "session_id" ||
      key === "step_id" ||
      key === "contract_id"
    ) continue;
    next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(value, 0);
  }
  return next;
}

function resolveContractIdFromRecord(record: Record<string, unknown> | null | undefined): string {
  if (!record || typeof record !== "object") return "";
  const state =
    record.state && typeof record.state === "object"
      ? (record.state as Record<string, unknown>)
      : {};
  const ui =
    record.ui && typeof record.ui === "object"
      ? (record.ui as Record<string, unknown>)
      : {};
  const direct = normalizeLogField(record.contract_id ?? record.ui_contract_id ?? "", 128);
  if (direct) return direct;
  const fromState = normalizeLogField(state.contract_id ?? state.ui_contract_id ?? state.current_contract_id ?? "", 128);
  if (fromState) return fromState;
  return normalizeLogField(ui.contract_id ?? ui.view_contract_id ?? "", 128);
}

function getHeaderFromRequestInfo(requestInfo: unknown, headerName: string): string {
  const headersRaw =
    requestInfo && typeof requestInfo === "object" && (requestInfo as any).headers
      ? ((requestInfo as any).headers as unknown)
      : null;
  if (!headersRaw) return "";
  const normalizedHeaderName = headerName.toLowerCase();
  if (typeof (headersRaw as any).get === "function") {
    const fromGet = normalizeLogField((headersRaw as any).get(headerName) ?? (headersRaw as any).get(normalizedHeaderName), 512);
    if (fromGet) return fromGet;
  }
  if (Array.isArray(headersRaw)) {
    for (const entry of headersRaw) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const key = safeString(entry[0] ?? "").trim().toLowerCase();
      if (key !== normalizedHeaderName) continue;
      const value = normalizeLogField(entry[1], 512);
      if (value) return value;
    }
  }
  if (typeof headersRaw !== "object") return "";
  const record = headersRaw as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (safeString(key ?? "").trim().toLowerCase() !== normalizedHeaderName) continue;
    const normalized = normalizeLogField(value, 512);
    if (normalized) return normalized;
  }
  return "";
}

function resolveCorrelationIdFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "x-correlation-id") ||
    getHeaderFromRequestInfo(requestInfo, "x-request-id") ||
    getHeaderFromRequestInfo(requestInfo, "x-amzn-trace-id") ||
    getHeaderFromRequestInfo(requestInfo, "traceparent");
  if (fromHeaders) return fromHeaders;
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeLogField(meta["x-correlation-id"] ?? meta["x-request-id"] ?? meta["traceparent"] ?? "", 512);
}

function resolveTraceIdFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "x-amzn-trace-id") ||
    getHeaderFromRequestInfo(requestInfo, "traceparent") ||
    getHeaderFromRequestInfo(requestInfo, "x-b3-traceid");
  if (fromHeaders) return fromHeaders;
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeLogField(meta["x-amzn-trace-id"] ?? meta["traceparent"] ?? meta["x-b3-traceid"] ?? "", 512);
}

function resolveIdempotencyKeyFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "idempotency-key") ||
    getHeaderFromRequestInfo(requestInfo, "x-idempotency-key");
  if (fromHeaders) return normalizeIdempotencyKey(fromHeaders);
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeIdempotencyKey(
    meta["idempotency_key"] ??
      meta["idempotency-key"] ??
      meta["x-idempotency-key"] ??
      ""
  );
}

function logStructuredEvent(
  severity: StructuredLogSeverity,
  event: string,
  context: StructuredLogContext,
  details: Record<string, unknown> = {}
): void {
  const payload = {
    event: normalizeLogField(event, 128) || "event_unknown",
    correlation_id: normalizeLogField(context.correlation_id, 512),
    trace_id: normalizeLogField(context.trace_id, 512),
    session_id: normalizeLogField(context.session_id, 128),
    step_id: normalizeLogField(context.step_id, 128),
    contract_id: normalizeLogField(context.contract_id, 128),
    severity,
    ...sanitizeLogDetails(details),
  };
  const text = JSON.stringify(payload);
  if (severity === "error") {
    console.error(text);
    return;
  }
  if (severity === "warn") {
    console.warn(text);
    return;
  }
  console.log(text);
}

function jsonRpcErrorResponse(
  status: number,
  message: string,
  data: Record<string, unknown>,
  code = -32700
) {
  return {
    status,
    payload: {
      jsonrpc: "2.0",
      error: { code, message, data },
      id: null,
    },
  };
}

type RunStepErrorCategory = "contract" | "infra" | "internal";
type RunStepErrorSeverity = "transient" | "fatal";

type RunStepErrorClassification = {
  category: RunStepErrorCategory;
  severity: RunStepErrorSeverity;
  type: "contract_violation" | "infra_transient" | "server_error";
  retry_action: "restart_session" | "retry_same_action" | "reload";
  user_message: string;
  code: string;
};

function classifyRunStepExecutionError(err: any): RunStepErrorClassification {
  const rawStatus = Number(err?.status ?? err?.statusCode ?? err?.response?.status);
  const status = Number.isFinite(rawStatus) ? rawStatus : 0;
  const rawCode = safeString(err?.code ?? err?.response?.data?.code ?? err?.response?.data?.error?.code ?? "").trim();
  const code = rawCode.toLowerCase();
  const message = safeString(err?.message ?? err ?? "").trim().toLowerCase();
  const contractSignals = [
    "contract_violation",
    "ui contract",
    "invalid_state",
    "session_upgrade_required",
    "legacy session state is blocked",
    "strict startup/i18n contract",
  ];
  const transientSignals = [
    "timeout",
    "timed out",
    "rate_limit",
    "rate limit",
    "too many requests",
    "econnreset",
    "etimedout",
    "eai_again",
    "enotfound",
    "econnrefused",
    "fetch failed",
  ];
  const hasContractSignal = contractSignals.some((token) => message.includes(token) || code.includes(token));
  const hasTransientSignal =
    transientSignals.some((token) => message.includes(token) || code.includes(token)) ||
    status === 429 ||
    status === 408 ||
    status >= 500;
  if (hasContractSignal) {
    return {
      category: "contract",
      severity: "fatal",
      type: "contract_violation",
      retry_action: "restart_session",
      user_message: "Sessie ongeldig, start opnieuw.",
      code: code || "contract_violation",
    };
  }
  if (hasTransientSignal) {
    return {
      category: "infra",
      severity: "transient",
      type: "infra_transient",
      retry_action: "retry_same_action",
      user_message: "Probeer opnieuw.",
      code: code || (status === 429 ? "rate_limited" : status === 408 ? "timeout" : "infra_transient"),
    };
  }
  return {
    category: "internal",
    severity: "fatal",
    type: "server_error",
    retry_action: "reload",
    user_message: "Probeer opnieuw.",
    code: code || "server_error",
  };
}

async function readBodyWithLimit(req: any, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const onData = (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        cleanup();
        // Drain remaining data without destroying the request
        try { req.resume(); } catch {}
        const err = new Error("body_too_large");
        (err as any).code = "body_too_large";
        reject(err);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(Buffer.concat(chunks, size));
    };
    const onError = (err: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };
    const onAborted = () => {
      if (done) return;
      done = true;
      cleanup();
      const err = new Error("aborted");
      (err as any).code = "aborted";
      reject(err);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}

function injectUiVersion(html: string): string {
  return html.replace(/__UI_VERSION__/g, VERSION);
}

function normalizeStepId(rawStepId: string): string {
  const trimmed = safeString(rawStepId ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "start") return "step_0";
  return trimmed;
}

function normalizeLocaleHint(raw: unknown): string {
  const text = safeString(raw ?? "").trim();
  if (!text) return "";
  const firstPart = text.split(",")[0]?.trim() || "";
  const firstToken = firstPart.split(";")[0]?.trim() || "";
  if (!firstToken) return "";
  const normalizedRaw = firstToken
    .replace(/_/g, "-")
    .replace(/-{2,}/g, "-");
  const parts = normalizedRaw
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const languagePart = parts[0] || "";
  if (!/^[A-Za-z]{2,3}$/.test(languagePart)) return "";
  const language = languagePart.toLowerCase();
  if (language === "und") return "";
  const rest: string[] = [];
  for (const part of parts.slice(1)) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(part)) return "";
    if (/^[A-Za-z]{4}$/.test(part)) {
      rest.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
      continue;
    }
    if (/^[A-Za-z]{2}$/.test(part) || /^[0-9]{3}$/.test(part)) {
      rest.push(part.toUpperCase());
      continue;
    }
    rest.push(part.toLowerCase());
  }
  return [language, ...rest].join("-");
}

function localeFromMetaValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeLocaleHint(item);
      if (normalized) return normalized;
    }
    return "";
  }
  return normalizeLocaleHint(value);
}

function localeFromRequestHeaders(requestInfo: unknown): string {
  const headersRaw =
    requestInfo && typeof requestInfo === "object" && (requestInfo as any).headers
      ? ((requestInfo as any).headers as unknown)
      : null;
  if (!headersRaw) return "";
  if (typeof (headersRaw as any).get === "function") {
    const fromGet = localeFromMetaValue((headersRaw as any).get("accept-language"));
    if (fromGet) return fromGet;
  }
  if (Array.isArray(headersRaw)) {
    for (const entry of headersRaw) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const key = safeString(entry[0] ?? "").toLowerCase();
      if (key !== "accept-language") continue;
      const fromTuple = localeFromMetaValue(entry[1]);
      if (fromTuple) return fromTuple;
    }
  }
  if (typeof headersRaw !== "object") return "";
  const record = headersRaw as Record<string, unknown>;
  const direct = localeFromMetaValue(record["accept-language"]);
  if (direct) return direct;
  const canonical = Object.keys(record).find(
    (key) => safeString(key || "").toLowerCase() === "accept-language"
  );
  if (!canonical) return "";
  return localeFromMetaValue(record[canonical]);
}

function normalizeLocaleHintSource(
  raw: unknown
): "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none" {
  const value = safeString(raw).trim();
  return value === "openai_locale" ||
    value === "webplus_i18n" ||
    value === "request_header" ||
    value === "message_detect"
    ? value
    : "none";
}

function normalizeHostWidgetSessionId(raw: unknown): string {
  const value = safeString(raw ?? "").trim();
  if (!value) return "";
  if (value.length > 256) return value.slice(0, 256);
  return value;
}

function mergeLocaleHintInputs(
  argsLocaleHint: unknown,
  argsLocaleSource: unknown,
  extraLocale: {
    locale_hint: string;
    locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
  }
): {
  locale_hint: string;
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
} {
  const argHint = normalizeLocaleHint(safeString(argsLocaleHint));
  const argSource = normalizeLocaleHintSource(argsLocaleSource);
  const extraHint = normalizeLocaleHint(safeString(extraLocale.locale_hint));
  const extraSource = normalizeLocaleHintSource(extraLocale.locale_hint_source);
  const mergedHint = argHint || extraHint;
  if (!mergedHint) return { locale_hint: "", locale_hint_source: "none" };
  if (argSource !== "none") return { locale_hint: mergedHint, locale_hint_source: argSource };
  if (extraSource !== "none") return { locale_hint: mergedHint, locale_hint_source: extraSource };
  return { locale_hint: mergedHint, locale_hint_source: "none" };
}

function resolveLocaleHintFromExtra(extra: unknown): {
  locale_hint: string;
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
} {
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : null;
  if (meta) {
    const openaiLocale = localeFromMetaValue(meta["openai/locale"]);
    if (openaiLocale) {
      return { locale_hint: openaiLocale, locale_hint_source: "openai_locale" };
    }
    const webplusLocale = localeFromMetaValue(meta["webplus/i18n"]);
    if (webplusLocale) {
      return { locale_hint: webplusLocale, locale_hint_source: "webplus_i18n" };
    }
  }
  const headerLocale = localeFromRequestHeaders(
    extra && typeof extra === "object" ? (extra as any).requestInfo : null
  );
  if (headerLocale) {
    return { locale_hint: headerLocale, locale_hint_source: "request_header" };
  }
  return { locale_hint: "", locale_hint_source: "none" };
}

function resolveHostWidgetSessionIdFromExtra(extra: unknown): string {
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : null;
  if (!meta) return "";
  const direct = normalizeHostWidgetSessionId(meta["openai/widgetSessionId"]);
  if (direct) return direct;
  const fallback = normalizeHostWidgetSessionId(meta["openai/widget_session_id"]);
  return fallback;
}

function buildInternalHostWidgetSessionId(seed: unknown): string {
  const normalizedSeed = normalizeBootstrapSessionId(seed) || createBootstrapSessionId();
  return `internal:${normalizedSeed}`;
}

function resolveEffectiveHostWidgetSessionId(params: {
  provided?: unknown;
  state?: Record<string, unknown> | null | undefined;
  bootstrapSessionId?: unknown;
}): string {
  const provided = normalizeHostWidgetSessionId(params.provided);
  if (provided) return provided;
  const state = params.state && typeof params.state === "object" ? params.state : {};
  const fromState = normalizeHostWidgetSessionId((state as any).host_widget_session_id);
  if (fromState) return fromState;
  return buildInternalHostWidgetSessionId(
    normalizeBootstrapSessionId(params.bootstrapSessionId ?? (state as any).bootstrap_session_id ?? "")
  );
}

function hasNonBusinessFinals(state: Record<string, unknown> | null | undefined): boolean {
  const snapshot = getFinalsSnapshot((state ?? {}) as any);
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "business_name") continue;
    if (safeString(value ?? "").trim()) return true;
  }
  return false;
}

function isFirstStartStep(stepId: string, state: Record<string, unknown> | null | undefined): boolean {
  return stepId === "step_0" && !hasNonBusinessFinals(state);
}

function loadUiHtml(): string {
  try {
    const raw = readFileSync(new URL("./ui/step-card.bundled.html", import.meta.url), "utf-8");
    return injectUiVersion(raw);
  } catch (e) {
    console.error("[loadUiHtml] Failed:", e);
    return "<html><body>UI not available</body></html>";
  }
}

/** Shared run_step logic for MCP tool and POST /run_step (local testing). */
async function runStepHandler(args: {
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
}): Promise<{ structuredContent: Record<string, unknown>; meta?: Record<string, unknown> }> {
  const correlationId = normalizeLogField(args.correlation_id, 512) || randomUUID();
  const traceId = normalizeLogField(args.trace_id, 512) || correlationId;
  const current_step_id = normalizeStepId(args.current_step_id ?? "");
  const state = (args.state ?? {}) as Record<string, unknown>;
  const user_message_raw = safeString(args.user_message ?? "");
  const localeHintSourceRaw = safeString(args.locale_hint_source ?? "none");
  const localeHintSource =
    localeHintSourceRaw === "openai_locale" ||
    localeHintSourceRaw === "webplus_i18n" ||
    localeHintSourceRaw === "request_header" ||
    localeHintSourceRaw === "message_detect"
      ? localeHintSourceRaw
      : "none";
  const isStart = current_step_id === "step_0";
  const stateStarted = safeString((state as any).started ?? "").trim().toLowerCase() === "true";
  const requiresExplicitStart = isStart && !stateStarted;
  let user_message =
    isStart && !user_message_raw.trim() ? "" : user_message_raw;
  const normalizedMessage = user_message_raw.trim();
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
  const holdForExplicitStart = requiresExplicitStart && !isStartAction && !isBootstrapPollAction;
  if (holdForExplicitStart) user_message = "";
  const hasInitiator = safeString(state?.initial_user_message ?? "").trim() !== "";
  const hostWidgetSessionId = resolveEffectiveHostWidgetSessionId({
    provided: args.host_widget_session_id,
    state,
    bootstrapSessionId: (state as any).bootstrap_session_id,
  });
  logStructuredEvent(
    "info",
    "host_session_id_seen",
    {
      correlation_id: correlationId,
      trace_id: traceId,
      session_id: normalizeBootstrapSessionId((state as any).bootstrap_session_id),
      step_id: current_step_id,
      contract_id: resolveContractIdFromRecord({ state }),
    },
    {
      source: hostWidgetSessionId.startsWith("internal:") ? "run_step_internal" : "run_step_args",
      host_widget_session_id_present: hostWidgetSessionId ? "true" : "false",
    }
  );
  let stateForTool: Record<string, unknown> = {
    ...state,
    ...(hasInitiator || !shouldSeedInitialUserMessage ? {} : { initial_user_message: normalizedMessage }),
    ...(shouldMarkStarted ? { started: "true" } : {}),
    __request_id: correlationId,
    ...(traceId ? { __trace_id: traceId } : {}),
  };
  if (requiresExplicitStart && !shouldMarkStarted) {
    stateForTool = { ...stateForTool, started: "false" };
  }
  const incomingBootstrapSessionRaw = safeString((stateForTool as any).bootstrap_session_id ?? "").trim();
  const incomingBootstrapSession = normalizeBootstrapSessionId(incomingBootstrapSessionRaw);
  if (incomingBootstrapSessionRaw && !incomingBootstrapSession) {
    logStructuredEvent(
      "warn",
      "bootstrap_session_id_rejected",
      {
        correlation_id: correlationId,
        trace_id: traceId,
        session_id: "",
        step_id: current_step_id,
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
    ? (parsePositiveInt((stateForTool as any).bootstrap_epoch) || 1)
    : 1;
  stateForTool = {
    ...stateForTool,
    bootstrap_session_id: normalizedBootstrapSessionId,
    bootstrap_epoch: normalizedBootstrapEpoch,
  };
  stateForTool = {
    ...stateForTool,
    host_widget_session_id: hostWidgetSessionId,
    __idempotency_registry_owner: "server",
  };

  const stepIdStr = safeString(current_step_id ?? "");
  const msgLen = typeof user_message_raw === "string" ? user_message_raw.length : 0;
  const stateKeysCount = stateForTool && typeof stateForTool === "object" && stateForTool !== null ? Object.keys(stateForTool).length : 0;
  const localeHint = safeString(args.locale_hint ?? "");
  const inputMode = safeString(args.input_mode ?? "chat");
  const action = upperMessage.startsWith("ACTION_") ? upperMessage : "text_input";
  const idempotencyKey = normalizeIdempotencyKey(
    args.idempotency_key ?? (stateForTool as any).__client_action_id ?? ""
  );
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
    }
  );
  const nowMs = Date.now();
  let incomingOrdering = readBootstrapOrdering({ state: stateForTool });
  const idempotencyScopeKey = buildIdempotencyScopeKey({
    bootstrapSessionId: normalizedBootstrapSessionId,
    hostWidgetSessionId,
  });
  const idempotencyRequestHash = idempotencyKey
    ? createIdempotencyRequestHash({
        currentStepId: current_step_id,
        userMessage: user_message_raw,
        inputMode,
        localeHint,
        localeHintSource,
        state: stateForTool,
      })
    : "";
  const idempotencyRecordKey =
    idempotencyKey && idempotencyRequestHash
      ? buildIdempotencyRegistryKey(idempotencyScopeKey, idempotencyKey)
      : "";
  const idempotencyTracker =
    idempotencyKey && idempotencyRequestHash && idempotencyRecordKey
      ? {
          idempotencyKey,
          scopeKey: idempotencyScopeKey,
          requestHash: idempotencyRequestHash,
          registryKey: idempotencyRecordKey,
        }
      : null;

  const buildIdempotencyErrorResult = (params: {
    errorType: "idempotency_conflict" | "idempotency_inflight";
    errorCode: string;
    message: string;
    retryAction: "retry_same_key" | "regenerate_key";
    outcome: "conflict" | "inflight";
  }): Record<string, unknown> => {
    const normalizedState = (() => {
      try {
        return normalizeState(
          (stateForTool && typeof stateForTool === "object" && stateForTool !== null)
            ? stateForTool
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
      current_step_id: current_step_id || "step_0",
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
      bootstrapSessionId: incomingOrdering.sessionId || normalizedBootstrapSessionId,
      bootstrapEpoch: incomingOrdering.epoch || normalizedBootstrapEpoch,
      responseSeq,
      hostWidgetSessionId: hostWidgetSessionId || incomingOrdering.hostWidgetSessionId,
    });
    return attachIdempotencyDiagnostics({
      resultForClient: withBootstrap,
      idempotencyKey,
      outcome: params.outcome,
      errorCode: params.errorCode,
    });
  };

  if (idempotencyTracker) {
    purgeExpiredIdempotencyEntries(nowMs);
    const existing = idempotencyRegistry.get(idempotencyTracker.registryKey);
    if (existing) {
      if (existing.requestHash !== idempotencyTracker.requestHash) {
        const conflictResult = buildIdempotencyErrorResult({
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
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: incomingOrdering.sessionId || normalizedBootstrapSessionId,
            step_id: stepIdStr || "step_0",
            contract_id: resolveContractIdFromRecord(conflictResult),
          },
          {
            input_mode: inputMode || "chat",
            action,
            idempotency_key_present: "true",
            reason: "payload_mismatch",
          }
        );
        const modelResult = buildModelSafeResult(conflictResult);
        return {
          structuredContent: {
            title: `The Business Strategy Canvas Builder (${VERSION})`,
            meta: "idempotency_conflict",
            result: modelResult,
          },
          meta: { widget_result: conflictResult },
        };
      }
      if (existing.status === "completed" && existing.resultForClient) {
        const replayResult = attachIdempotencyDiagnostics({
          resultForClient: cloneRecord(existing.resultForClient),
          idempotencyKey,
          outcome: "replay",
          errorCode: IDEMPOTENCY_ERROR_CODES.REPLAY,
        });
        const replayState =
          replayResult.state && typeof replayResult.state === "object"
            ? (replayResult.state as Record<string, unknown>)
            : {};
        const replayStepMeta = safeString(replayState.current_step ?? current_step_id ?? "unknown") || "unknown";
        const replaySpecialistMeta = safeString(replayResult.active_specialist ?? "unknown") || "unknown";
        logStructuredEvent(
          "info",
          "idempotency_replay_served",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: incomingOrdering.sessionId || normalizedBootstrapSessionId,
            step_id: replayStepMeta,
            contract_id: resolveContractIdFromRecord(replayResult),
          },
          {
            input_mode: inputMode || "chat",
            action,
            idempotency_key_present: "true",
          }
        );
        return {
          structuredContent: {
            title: `The Business Strategy Canvas Builder (${VERSION})`,
            meta: `step: ${replayStepMeta} | specialist: ${replaySpecialistMeta}`,
            result: buildModelSafeResult(replayResult),
          },
          meta: { widget_result: replayResult },
        };
      }
      const inflightResult = buildIdempotencyErrorResult({
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
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: incomingOrdering.sessionId || normalizedBootstrapSessionId,
          step_id: stepIdStr || "step_0",
          contract_id: resolveContractIdFromRecord(inflightResult),
        },
        {
          input_mode: inputMode || "chat",
          action,
          idempotency_key_present: "true",
        }
      );
      return {
        structuredContent: {
          title: `The Business Strategy Canvas Builder (${VERSION})`,
          meta: "idempotency_inflight",
          result: buildModelSafeResult(inflightResult),
        },
        meta: { widget_result: inflightResult },
      };
    }
    markIdempotencyInFlight({
      registryKey: idempotencyTracker.registryKey,
      scopeKey: idempotencyTracker.scopeKey,
      idempotencyKey: idempotencyTracker.idempotencyKey,
      requestHash: idempotencyTracker.requestHash,
      nowMs,
    });
  }

  if (incomingOrdering.sessionId && incomingOrdering.epoch > 0) {
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
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: incomingOrdering.sessionId,
          step_id: stepIdStr || "step_0",
          contract_id: resolveContractIdFromRecord({ state: stateForTool }),
        },
        {
          input_mode: inputMode || "chat",
          action,
          host_widget_session_id_present: "true",
        }
      );
    }
    if (staleCheck.stale) {
      const staleSource =
        staleCheck.latest && staleCheck.latest.lastWidgetResult && Object.keys(staleCheck.latest.lastWidgetResult).length
          ? (JSON.parse(JSON.stringify(staleCheck.latest.lastWidgetResult)) as Record<string, unknown>)
          : {
              ok: true,
              tool: "run_step",
              current_step_id: safeString((stateForTool as any).current_step ?? "step_0") || "step_0",
              active_specialist: safeString((stateForTool as any).active_specialist ?? ""),
              text: "",
              prompt: "",
              specialist: {},
              state: normalizeState(stateForTool),
            };
      const staleResult = attachIdempotencyDiagnostics({
        resultForClient: staleSource,
        idempotencyKey,
        outcome: "replay",
        ...(idempotencyKey ? { errorCode: IDEMPOTENCY_ERROR_CODES.REPLAY } : {}),
      });
      const staleStepMeta =
        safeString((staleResult.state as Record<string, unknown> | undefined)?.current_step ?? "unknown") || "unknown";
      const staleSpecialistMeta = safeString(staleResult.active_specialist ?? "unknown") || "unknown";
      logStructuredEvent(
        "warn",
        "stale_bootstrap_payload_dropped",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: incomingOrdering.sessionId,
          step_id: stepIdStr || "step_0",
          contract_id: resolveContractIdFromRecord(staleResult),
        },
        {
          input_mode: inputMode || "chat",
          action,
          stale_reason: staleCheck.reason || "unknown",
          payload_epoch: incomingOrdering.epoch,
          payload_response_seq: incomingOrdering.responseSeq,
          latest_epoch: staleCheck.latest?.epoch || incomingOrdering.epoch,
          latest_response_seq: staleCheck.latest?.lastResponseSeq || 0,
          host_widget_session_id_present: incomingOrdering.hostWidgetSessionId ? "true" : "false",
        }
      );
      const modelResult = buildModelSafeResult(staleResult);
      const structuredContent: Record<string, unknown> = {
        title: `The Business Strategy Canvas Builder (${VERSION})`,
        meta: `step: ${staleStepMeta} | specialist: ${staleSpecialistMeta}`,
        result: modelResult,
      };
      if (idempotencyTracker) {
        markIdempotencyCompleted({
          registryKey: idempotencyTracker.registryKey,
          scopeKey: idempotencyTracker.scopeKey,
          idempotencyKey: idempotencyTracker.idempotencyKey,
          requestHash: idempotencyTracker.requestHash,
          resultForClient: staleResult,
          nowMs: Date.now(),
        });
      }
      return {
        structuredContent,
        meta: { widget_result: staleResult },
      };
    }
  }

  try {
    const runStepTool = await getRunStep();
    const result = await runStepTool({
      user_message,
      input_mode: args.input_mode,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      state: stateForTool,
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
    const sessionId = normalizeBootstrapSessionId(resultStateRaw.bootstrap_session_id ?? incomingOrdering.sessionId);
    const epoch = parsePositiveInt(resultStateRaw.bootstrap_epoch ?? incomingOrdering.epoch);
    let resultForClient = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: resultForClientRaw,
      bootstrapSessionId: sessionId,
      bootstrapEpoch: epoch,
      responseSeq,
      hostWidgetSessionId,
    });
    resultForClient = attachIdempotencyDiagnostics({
      resultForClient,
      idempotencyKey,
      outcome: "fresh",
    });
    const stepMeta =
      safeString((result as { state?: { current_step?: string } }).state?.current_step ?? "unknown") || "unknown";
    const specialistMeta =
      safeString((result as { active_specialist?: string }).active_specialist ?? "unknown") || "unknown";
    const resultState =
      (resultForClient && typeof resultForClient.state === "object" && resultForClient.state)
        ? (resultForClient.state as Record<string, unknown>)
        : {};
    const resultUi =
      (resultForClient && typeof resultForClient.ui === "object" && resultForClient.ui)
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
        correlation_id: correlationId,
        trace_id: traceId,
        session_id: normalizeBootstrapSessionId(resultState.bootstrap_session_id ?? sessionId),
        step_id: safeString(resultState.current_step ?? stepMeta) || "unknown",
        contract_id: resolveContractIdFromRecord(resultForClient),
      },
      {
        input_mode: inputMode || "chat",
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
        host_widget_session_id_present: hostWidgetSessionId ? "true" : "false",
        active_specialist: specialistMeta,
      }
    );
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
    const err = error as any;
    const debugEnabled =
      process.env.LOCAL_DEV === "1" ||
      safeString((stateForTool as any)?.debug?.enable ?? "").toLowerCase() === "true";
    const errorStatus = err?.status ?? err?.statusCode ?? err?.response?.status;
    const errorCode = err?.code ?? err?.response?.data?.code ?? err?.response?.data?.error?.code;
    const classification = classifyRunStepExecutionError(err);
    logStructuredEvent(
      "error",
      "run_step_error",
      {
        correlation_id: correlationId,
        trace_id: traceId,
        session_id: incomingOrdering.sessionId || normalizeBootstrapSessionId((stateForTool as any).bootstrap_session_id),
        step_id: safeString((stateForTool as any).current_step ?? current_step_id) || "step_0",
        contract_id: resolveContractIdFromRecord({ state: stateForTool }),
      },
      {
        message: safeString(err?.message ?? err ?? "unknown_error"),
        status: errorStatus === undefined ? "" : safeString(errorStatus),
        code: errorCode === undefined ? "" : safeString(errorCode),
        error_category: classification.category,
        error_severity: classification.severity,
        error_type: classification.type,
        retry_action: classification.retry_action,
        debug_enabled: debugEnabled ? "true" : "false",
      }
    );
    if (debugEnabled && err?.stack) {
      logStructuredEvent(
        "error",
        "run_step_error_stack",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: incomingOrdering.sessionId || normalizeBootstrapSessionId((stateForTool as any).bootstrap_session_id),
          step_id: safeString((stateForTool as any).current_step ?? current_step_id) || "step_0",
          contract_id: resolveContractIdFromRecord({ state: stateForTool }),
        },
        {
          stack: safeString(err.stack),
          openai_api_key_present: Boolean(process.env.OPENAI_API_KEY),
        }
      );
    }
    
    // Canonicalize fallback state so widget payload never leaks non-CanvasState fields.
    const currentState = (() => {
      try {
        return normalizeState(
          (stateForTool && typeof stateForTool === "object" && stateForTool !== null)
            ? stateForTool
            : getDefaultState()
        );
      } catch {
        return getDefaultState();
      }
    })();
    const currentStep = safeString((currentState as any).current_step ?? "step_0") || "step_0";
    
    const responseSeq = nextBootstrapResponseSeq();
    const fallbackResultBase = {
      ok: false as const,
      tool: "run_step",
      current_step_id: currentStep,
      active_specialist: "",
      text: "", // Geen chat tekst
      prompt: "",
      specialist: {},
      state: currentState,
      error: {
        type: classification.type,
        category: classification.category,
        severity: classification.severity,
        retryable: classification.severity === "transient",
        code: classification.code,
        message: classification.user_message, // UI message, niet chat
        retry_action: classification.retry_action,
      },
    };
    let fallbackResult = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: fallbackResultBase as Record<string, unknown>,
      bootstrapSessionId: incomingOrdering.sessionId,
      bootstrapEpoch: incomingOrdering.epoch,
      responseSeq,
      hostWidgetSessionId: hostWidgetSessionId || incomingOrdering.hostWidgetSessionId,
    });
    fallbackResult = attachIdempotencyDiagnostics({
      resultForClient: fallbackResult,
      idempotencyKey,
      outcome: "fresh",
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

function buildModelSafeResult(result: Record<string, unknown>): Record<string, unknown> {
  const state =
    result && typeof result.state === "object" && result.state
      ? (result.state as Record<string, unknown>)
      : {};
  const ui =
    result && typeof result.ui === "object" && result.ui
      ? (result.ui as Record<string, unknown>)
      : {};
  const flags =
    ui.flags && typeof ui.flags === "object"
      ? (ui.flags as Record<string, unknown>)
      : {};
  const currentStep = safeString(result.current_step_id || state.current_step || "step_0");
  const started = safeString(state.started || "");
  const initialUserMessage = safeString(state.initial_user_message || "");
  const locale = safeString((result as any).locale || state.locale || "");
  const language = safeString((result as any).language || state.language || "");
  const languageSource = safeString((result as any).language_source || state.language_source || "");
  const uiStringsLang = safeString(state.ui_strings_lang || (result as any).ui_strings_lang || "");
  const uiStringsStatus = safeString(state.ui_strings_status || (result as any).ui_strings_status || "");
  const uiStringsRequestedLang = safeString(
    state.ui_strings_requested_lang || (result as any).ui_strings_requested_lang || ""
  );
  const uiStringsFallbackApplied = safeString(
    state.ui_strings_fallback_applied || (result as any).ui_strings_fallback_applied || "false"
  );
  const uiStringsFallbackReason = safeString(
    state.ui_strings_fallback_reason || (result as any).ui_strings_fallback_reason || ""
  );
  const uiBootstrapStatus = safeString(state.ui_bootstrap_status || (result as any).ui_bootstrap_status || "");
  const uiGateStatus = safeString((result as any).ui_gate_status || state.ui_gate_status || "");
  const uiGateReason = safeString((result as any).ui_gate_reason || state.ui_gate_reason || "");
  const uiGateSinceMs = Number((result as any).ui_gate_since_ms ?? state.ui_gate_since_ms ?? 0) || 0;
  const bootstrapPhase = safeString((result as any).bootstrap_phase || state.bootstrap_phase || "");
  const bootstrapSessionId = normalizeBootstrapSessionId(
    (result as any).bootstrap_session_id || state.bootstrap_session_id || ""
  );
  const bootstrapEpoch = parsePositiveInt((result as any).bootstrap_epoch ?? state.bootstrap_epoch);
  const responseSeq = parsePositiveInt((result as any).response_seq ?? state.response_seq);
  const responseKindRaw = safeString((result as any).response_kind || state.response_kind || "");
  const responseKind = responseKindRaw === "run_step" ? "run_step" : "";
  const idempotencyKey = normalizeIdempotencyKey(
    (result as any).idempotency_key ||
      state.idempotency_key ||
      flags.idempotency_key ||
      ""
  );
  const idempotencyOutcomeRaw = safeString(
    (result as any).idempotency_outcome ||
      state.idempotency_outcome ||
      flags.idempotency_outcome ||
      ""
  );
  const idempotencyOutcome =
    idempotencyOutcomeRaw === "fresh" ||
    idempotencyOutcomeRaw === "replay" ||
    idempotencyOutcomeRaw === "conflict" ||
    idempotencyOutcomeRaw === "inflight"
      ? idempotencyOutcomeRaw
      : "";
  const idempotencyErrorCode = safeString(
    (result as any).idempotency_error_code ||
      state.idempotency_error_code ||
      flags.idempotency_error_code ||
      ""
  );
  const hostWidgetSessionId = safeString(
    (result as any).host_widget_session_id ||
      state.host_widget_session_id ||
      flags.host_widget_session_id ||
      ""
  );
  const toolContractFamilyVersion = safeString(
    (result as any).tool_contract_family_version ||
      state.tool_contract_family_version ||
      flags.tool_contract_family_version ||
      MCP_TOOL_CONTRACT_FAMILY_VERSION
  );
  const runStepInputSchemaVersion = safeString(
    (result as any).run_step_input_schema_version ||
      state.run_step_input_schema_version ||
      flags.run_step_input_schema_version ||
      RUN_STEP_TOOL_INPUT_SCHEMA_VERSION
  );
  const runStepOutputSchemaVersion = safeString(
    (result as any).run_step_output_schema_version ||
      state.run_step_output_schema_version ||
      flags.run_step_output_schema_version ||
      RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION
  );
  const safeState: Record<string, unknown> = {
    current_step: currentStep || "step_0",
  };
  if (started) safeState.started = started;
  if (initialUserMessage) safeState.initial_user_message = initialUserMessage;
  if (locale) safeState.locale = locale;
  if (language) safeState.language = language;
  if (languageSource) safeState.language_source = languageSource;
  if (uiStringsLang) safeState.ui_strings_lang = uiStringsLang;
  if (uiStringsStatus) safeState.ui_strings_status = uiStringsStatus;
  if (uiStringsRequestedLang) safeState.ui_strings_requested_lang = uiStringsRequestedLang;
  safeState.ui_strings_fallback_applied = uiStringsFallbackApplied === "true" ? "true" : "false";
  if (uiStringsFallbackReason) safeState.ui_strings_fallback_reason = uiStringsFallbackReason;
  if (uiBootstrapStatus) safeState.ui_bootstrap_status = uiBootstrapStatus;
  if (uiGateStatus) safeState.ui_gate_status = uiGateStatus;
  if (uiGateReason) safeState.ui_gate_reason = uiGateReason;
  if (uiGateSinceMs > 0) safeState.ui_gate_since_ms = uiGateSinceMs;
  if (bootstrapPhase) safeState.bootstrap_phase = bootstrapPhase;
  if (bootstrapSessionId) safeState.bootstrap_session_id = bootstrapSessionId;
  if (bootstrapEpoch > 0) safeState.bootstrap_epoch = bootstrapEpoch;
  if (responseSeq > 0) safeState.response_seq = responseSeq;
  if (responseKind) safeState.response_kind = responseKind;
  if (idempotencyKey) safeState.idempotency_key = idempotencyKey;
  if (idempotencyOutcome) safeState.idempotency_outcome = idempotencyOutcome;
  if (idempotencyErrorCode) safeState.idempotency_error_code = idempotencyErrorCode;
  if (hostWidgetSessionId) safeState.host_widget_session_id = hostWidgetSessionId;
  if (toolContractFamilyVersion) safeState.tool_contract_family_version = toolContractFamilyVersion;
  if (runStepInputSchemaVersion) safeState.run_step_input_schema_version = runStepInputSchemaVersion;
  if (runStepOutputSchemaVersion) safeState.run_step_output_schema_version = runStepOutputSchemaVersion;
  return {
    model_result_shape_version: RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
    ok: result.ok === true,
    tool: safeString(result.tool || "run_step"),
    current_step_id: currentStep,
    ui_gate_status: uiGateStatus,
    ui_gate_reason: uiGateReason,
    ...(locale ? { locale } : {}),
    language,
    ui_strings_status: uiStringsStatus,
    ui_strings_lang: uiStringsLang,
    ui_strings_requested_lang: uiStringsRequestedLang,
    ui_strings_fallback_applied: uiStringsFallbackApplied === "true",
    ui_strings_fallback_reason: uiStringsFallbackReason,
    bootstrap_phase: bootstrapPhase,
    ...(bootstrapSessionId ? { bootstrap_session_id: bootstrapSessionId } : {}),
    ...(bootstrapEpoch > 0 ? { bootstrap_epoch: bootstrapEpoch } : {}),
    ...(responseSeq > 0 ? { response_seq: responseSeq } : {}),
    ...(responseKind ? { response_kind: responseKind } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(idempotencyOutcome ? { idempotency_outcome: idempotencyOutcome } : {}),
    ...(idempotencyErrorCode ? { idempotency_error_code: idempotencyErrorCode } : {}),
    ...(hostWidgetSessionId ? { host_widget_session_id: hostWidgetSessionId } : {}),
    ...(toolContractFamilyVersion ? { tool_contract_family_version: toolContractFamilyVersion } : {}),
    ...(runStepInputSchemaVersion ? { run_step_input_schema_version: runStepInputSchemaVersion } : {}),
    ...(runStepOutputSchemaVersion ? { run_step_output_schema_version: runStepOutputSchemaVersion } : {}),
    state: safeState,
  };
}

function buildContentFromResult(
  result: Record<string, unknown> | null | undefined,
  options?: { isFirstStart?: boolean }
): string {
  // App-only contract: keep chat silent on success.
  if (!result || typeof result !== "object") return "";
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const flags =
    uiObj.flags && typeof uiObj.flags === "object"
      ? (uiObj.flags as Record<string, unknown>)
      : {};
  const waitingLocale = flags.bootstrap_waiting_locale === true;
  const hasError = Boolean((result as any).error);
  if (hasError) return "Open de app om verder te gaan.";
  if (waitingLocale) return "";
  if (options?.isFirstStart) return "Canvas Builder geopend in de app.";
  return "";
}

function resolveBaseUrl(req?: any): string {
  const explicit = safeString(process.env.PUBLIC_BASE_URL ?? process.env.BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (isLocalDev) {
    const portStr = safeString(process.env.PORT ?? port).trim();
    return `http://localhost:${portStr}`;
  }
  if (req) {
    const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
    if (host) {
      const protoHeader = getHeader(req, "x-forwarded-proto");
      const scheme = protoHeader ? protoHeader.split(",")[0].trim() : "https";
      return `${scheme}://${host}`.replace(/\/+$/, "");
    }
  }
  return "";
}

function createAppServer(baseUrl: string): McpServer {
  const server = new McpServer(
    {
      name: "business-canvas-chatkit",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register UI resource
  const uiResourceUri = baseUrl
    ? `${baseUrl}${UI_RESOURCE_PATH}${UI_RESOURCE_QUERY}`
    : `${UI_RESOURCE_PATH}${UI_RESOURCE_QUERY}`;
  
  server.registerResource(
    UI_RESOURCE_NAME,
    uiResourceUri,
    {
      mimeType: "text/html;profile=mcp-app",
      description: "Business Strategy Canvas Builder widget UI",
    },
    async () => {
      // Return the UI HTML content
      return {
        contents: [
          {
            uri: uiResourceUri,
            text: loadUiHtml(),
          },
        ],
      };
    }
  );

  server.registerTool(
    "run_step",
    {
      title: "Business Strategy Canvas Builder",
      description:
        "Use this tool to open or progress the Business Strategy Canvas Builder UI. Do not generate business content in chat. Do not summarize or explain what the app shows. After calling this tool, output nothing or at most one short neutral sentence confirming the app is open. All questions and interaction happen inside the app UI.",
      inputSchema: RunStepToolInputSchema,
      annotations: {
        readOnlyHint: false, // Tool generates files and modifies state
        openWorldHint: false, // No external posts
        destructiveHint: false, // No destructive actions
        idempotentHint: false,
      },
      outputSchema: RunStepToolStructuredContentOutputSchema,
      // Note: securitySchemes is in _meta per MCP SDK implementation requirements.
      // The MCP SDK does not support top-level securitySchemes in the current version.
      // This is included in the MCP response JSON that ChatGPT/OpenAI receives.
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: {
          resourceUri: uiResourceUri,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": uiResourceUri,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Thinking...",
        "openai/toolInvocation/invoked": "Updated",
        contract: RUN_STEP_TOOL_CONTRACT_META,
      },
    },
    async (args, extra) => {
      const normalizedStepId = normalizeStepId(args.current_step_id ?? "");
      const isFirstStart = isFirstStartStep(
        normalizedStepId,
        (args.state ?? {}) as Record<string, unknown>
      );
      const correlationId = resolveCorrelationIdFromExtra(extra);
      const traceId = resolveTraceIdFromExtra(extra) || correlationId;
      const localeFromExtra = resolveLocaleHintFromExtra(extra);
      const hostWidgetSessionId = normalizeHostWidgetSessionId(
        args.host_widget_session_id ?? resolveHostWidgetSessionIdFromExtra(extra)
      );
      const mergedLocale = mergeLocaleHintInputs(
        args.locale_hint,
        args.locale_hint_source,
        localeFromExtra
      );
      const idempotencyKey =
        normalizeIdempotencyKey(args.idempotency_key) ||
        resolveIdempotencyKeyFromExtra(extra) ||
        normalizeIdempotencyKey(
          (args.state as Record<string, unknown> | undefined)?.__client_action_id ?? ""
        );
      const { structuredContent, meta } = await runStepHandler({
        current_step_id: safeString(args.current_step_id ?? ""),
        user_message: safeString(args.user_message ?? ""),
        input_mode: args.input_mode,
        locale_hint: mergedLocale.locale_hint,
        locale_hint_source: mergedLocale.locale_hint_source,
        idempotency_key: idempotencyKey,
        correlation_id: correlationId,
        trace_id: traceId,
        host_widget_session_id: hostWidgetSessionId,
        state: (args.state ?? {}) as Record<string, unknown>,
      });
      const contentSource =
        meta && typeof meta === "object" && (meta as any).widget_result && typeof (meta as any).widget_result === "object"
          ? ((meta as any).widget_result as Record<string, unknown>)
          : ((structuredContent && (structuredContent as any).result)
            ? ((structuredContent as any).result as Record<string, unknown>)
            : null);
      const contentText = buildContentFromResult(contentSource, { isFirstStart });
      const parsedStructuredContent = RunStepToolStructuredContentOutputSchema.parse(structuredContent);
      return {
        content: [{ type: "text", text: contentText }],
        structuredContent: parsedStructuredContent,
        ...(meta ? { _meta: meta } : {}),
      };
    }
  );

  console.log("[mcp_tool_contract]", {
    run_step_visibility: ["model", "app"],
    run_step_output_template: true,
    ui_resource_uri: uiResourceUri,
    tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
    run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
    run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
  });

  return server;
}

const httpServer = async (req: any, res: any) => {
  const hostHeader = safeString(req?.headers?.host ?? "localhost");
  const url = new URL(req.url || "/", `http://${hostHeader}`);

  // Apply security headers to all responses
  applySecurityHeaders(res);

  // OpenAI Apps Challenge endpoint (for App Store submission verification)
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Health/ready checks (App Runner + local smoke)
  const isVersionEndpoint = url.pathname === "/version";
  const isReadyEndpoint =
    url.pathname === "/health" || url.pathname === "/healthz" || url.pathname === "/ready";
  const isDiagnosticsEndpoint = url.pathname === "/diagnostics";
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (isVersionEndpoint || isReadyEndpoint || isDiagnosticsEndpoint)
  ) {
    const correlationId = getCorrelationId(req);
    const traceId = getTraceId(req) || correlationId;
    ensureCorrelationHeader(res, correlationId);
    if (isVersionEndpoint) {
      res.writeHead(200, { "content-type": "text/plain" });
      if (req.method === "GET") {
        res.end(
          `VERSION=${VERSION}\nIMAGE_DIGEST=${IMAGE_DIGEST || "unknown"}\nCONTRACT_VERSION=${VIEW_CONTRACT_VERSION}\nSTATE_VERSION=${CURRENT_STATE_VERSION}\nTOOL_CONTRACT_FAMILY_VERSION=${MCP_TOOL_CONTRACT_FAMILY_VERSION}\nRUN_STEP_INPUT_SCHEMA_VERSION=${RUN_STEP_TOOL_INPUT_SCHEMA_VERSION}\nRUN_STEP_OUTPUT_SCHEMA_VERSION=${RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION}`
        );
      } else {
        res.end();
      }
      return;
    }
    if (isDiagnosticsEndpoint) {
      const nowMs = Date.now();
      const bootstrapSessions = summarizeBootstrapSessions(nowMs);
      const idempotency = summarizeIdempotencyRegistry(nowMs);
      const memoryUsage = process.memoryUsage();
      logStructuredEvent(
        "info",
        "diagnostics_endpoint_read",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: "",
          step_id: "",
          contract_id: "",
        },
        {
          method: req.method,
        }
      );
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "GET") {
        res.end(
          JSON.stringify({
            status: "ok",
            ready: true,
            timestamp: new Date(nowMs).toISOString(),
            uptime_s: Math.floor(process.uptime()),
            correlation_id: correlationId,
            trace_id: traceId,
            versions: {
              app: VERSION,
              state: CURRENT_STATE_VERSION,
              view_contract: VIEW_CONTRACT_VERSION,
              tool_contract_family: MCP_TOOL_CONTRACT_FAMILY_VERSION,
              run_step_input_schema: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
              run_step_output_schema: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
            },
            registries: {
              bootstrap_sessions: bootstrapSessions,
              idempotency,
            },
            limits: {
              max_request_size_bytes: MAX_REQUEST_SIZE_BYTES,
              request_timeout_ms: REQUEST_TIMEOUT_MS,
              bootstrap_session_registry_ttl_ms: BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
              idempotency_entry_ttl_ms: IDEMPOTENCY_ENTRY_TTL_MS,
            },
            runtime: {
              local_dev: isLocalDev,
              pid: process.pid,
              memory_bytes: {
                rss: memoryUsage.rss,
                heap_total: memoryUsage.heapTotal,
                heap_used: memoryUsage.heapUsed,
                external: memoryUsage.external,
              },
            },
          })
        );
      } else {
        res.end();
      }
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "GET") {
      res.end(
        JSON.stringify({
          status: "ok",
          ready: true,
          version: VERSION,
          state_version: CURRENT_STATE_VERSION,
          contract_version: VIEW_CONTRACT_VERSION,
          tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
          run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
          run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
          run_step_compatibility: RUN_STEP_TOOL_COMPAT_POLICY,
        })
      );
    } else {
      res.end();
    }
    return;
  }

  // Favicon: 200 + minimal 1x1 PNG so browser does not show 404
  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    const faviconPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwEHgP5fFuuHAAAAAElFTkSuQmCC",
      "base64"
    );
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    });
    res.end(faviconPng);
    return;
  }

  // Static template: Presentation PPTX
  if (req.method === "GET" && url.pathname === "/templates/presentation.pptx") {
    try {
      const filePath = getPresentationTemplatePath();
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-length": stat.size,
        "cache-control": "public, max-age=86400",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Template not found");
    }
    return;
  }

  // Generated presentations (local or server temp)
  if (req.method === "GET" && url.pathname.startsWith("/presentations/")) {
    try {
      const fileName = path.basename(url.pathname);
      const dir = path.join(os.tmpdir(), "business-canvas-presentations");
      const filePath = path.join(dir, fileName);
      const stat = fs.statSync(filePath);
      const ext = path.extname(fileName).toLowerCase();

      let contentType = "application/octet-stream";
      let disposition = `attachment; filename="${fileName}"`;
      if (ext === ".pptx") {
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (ext === ".pdf") {
        contentType = "application/pdf";
        disposition = `inline; filename="${fileName}"`;
      } else if (ext === ".png") {
        contentType = "image/png";
        disposition = `inline; filename="${fileName}"`;
      }

      res.writeHead(200, {
        "content-type": contentType,
        "content-length": stat.size,
        "content-disposition": disposition,
        "cache-control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Presentation not found");
    }
    return;
  }

  // --- Local dev only: /test and /run_step (no impact on production / MCP) ---
  if (isLocalDev) {
    // POST /run_step — bridge endpoint: same handler as MCP tool, same structuredContent shape.
    if (req.method === "POST" && url.pathname === "/run_step") {
      const correlationId = getCorrelationId(req);
      const traceId = getTraceId(req) || correlationId;
      ensureCorrelationHeader(res, correlationId);
      let raw: Buffer;
      try {
        raw = await readBodyWithLimit(req, MAX_REQUEST_SIZE_BYTES);
      } catch (e: any) {
        const code = safeString(e?.code ?? "");
        if (code === "body_too_large") {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({
            error: "body_too_large",
            error_code: "body_too_large",
            max_size: MAX_REQUEST_SIZE_BYTES,
          }));
          return;
        }
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "request_aborted", error_code: "request_aborted" }));
        return;
      }
      let parsedBody: unknown = {};
      try {
        parsedBody = JSON.parse(raw.toString("utf-8") || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json", error_code: "invalid_json" }));
        return;
      }
      const parsedArgsResult = RunStepToolInputSchema.safeParse(parsedBody);
      if (!parsedArgsResult.success) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "invalid_run_step_payload",
            error_code: "invalid_run_step_payload",
            issues: parsedArgsResult.error.issues,
          })
        );
        return;
      }
      try {
        const args = parsedArgsResult.data;
        const parsedState =
          args.state && typeof args.state === "object" && !Array.isArray(args.state)
            ? (args.state as Record<string, unknown>)
            : {};
        const idempotencyKeyFromHeaders =
          normalizeIdempotencyKey(getHeader(req, "idempotency-key")) ||
          normalizeIdempotencyKey(getHeader(req, "x-idempotency-key"));
        const { structuredContent, meta } = await runStepHandler({
          current_step_id: safeString(args.current_step_id ?? "step_0") || "step_0",
          user_message: safeString(args.user_message ?? ""),
          input_mode: args.input_mode,
          locale_hint: safeString(args.locale_hint ?? ""),
          locale_hint_source: args.locale_hint_source ?? "none",
          idempotency_key:
            normalizeIdempotencyKey(args.idempotency_key) ||
            idempotencyKeyFromHeaders ||
            normalizeIdempotencyKey(
              parsedState.__client_action_id ?? ""
            ),
          correlation_id: correlationId,
          trace_id: traceId,
          host_widget_session_id: normalizeHostWidgetSessionId(args.host_widget_session_id),
          state: parsedState,
        });
        const parsedStructuredContent = RunStepToolStructuredContentOutputSchema.parse(structuredContent);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ structuredContent: parsedStructuredContent, ...(meta ? { _meta: meta } : {}) }));
      } catch (e) {
        logStructuredEvent(
          "error",
          "post_run_step_error",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            message: safeString((e as Error)?.message ?? e),
          }
        );
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: safeString((e as Error)?.message ?? e) }));
      }
      return;
    }

    // GET /test — step-card HTML + injected openai bridge (callTool → fetch /run_step, set toolOutput, dispatch openai:set_globals).
    if (req.method === "GET" && (url.pathname === "/test" || url.pathname === "/test/")) {
      const widgetHtml = loadUiHtml();
      const OPENAI_BRIDGE = `
  <script>
    (function() {
      if (typeof globalThis.openai !== "undefined") return;
      globalThis.openai = {
        callTool: async function(name, args) {
          const resp = await fetch("/run_step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          });
          const data = await resp.json();
          return data;
        },
        toolOutput: null,
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    })();
  </script>
`;
      const withBridge = widgetHtml.replace("<body>", "<body>" + OPENAI_BRIDGE);
      res.writeHead(200, { "content-type": "text/html" });
      res.end(withBridge);
      return;
    }
  }

  // Static root for /ui/* – serve step-card.bundled.html, lib/*.js, assets, etc.
  if (req.method === "GET" && url.pathname.startsWith("/ui/")) {
    const uiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ui");
    let filePath: string;
    if (url.pathname === "/ui/step-card" || url.pathname === "/ui/step-card/") {
      filePath = path.join(uiDir, "step-card.bundled.html");
    } else {
      const rest = url.pathname.slice("/ui/".length).replace(/\/$/, "") || "index.html";
      filePath = path.join(uiDir, rest);
    }
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(uiDir)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      const contentType =
        ext === ".html" ? "text/html;profile=mcp-app" :
        ext === ".js" ? "application/javascript" :
        ext === ".css" ? "text/css" :
        ext === ".svg" ? "image/svg+xml" :
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        "application/octet-stream";
      if (path.basename(resolved) === "step-card.bundled.html") {
        const withVersion = loadUiHtml();
        res.writeHead(200, {
          "content-type": contentType,
          "cache-control": "no-store",
          "x-ui-version": VERSION,
        });
        res.end(withVersion);
        return;
      }
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-ui-version": VERSION,
      });
      fs.createReadStream(resolved).pipe(res);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    }
    return;
  }

  // MCP endpoint (production + local dev)
  const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    const correlationId = getCorrelationId(req);
    const traceId = getTraceId(req) || correlationId;
    (req as any).__correlationId = correlationId;
    ensureCorrelationHeader(res, correlationId);

    const acceptHeader = getHeader(req, "accept");
    const contentType = getHeader(req, "content-type");
    const contentLength = Number(getHeader(req, "content-length") || 0);

    // Apply rate limiting
    const rateLimitMiddleware = createRateLimitMiddleware();
    let rateLimitPassed = false;
    
    await new Promise<void>((resolve) => {
      rateLimitMiddleware(req, res, () => {
        rateLimitPassed = true;
        resolve();
      });
      
      // If headers were sent (rate limit hit), resolve immediately
      if (res.headersSent) {
        resolve();
      }
    });
    
    // If rate limited, stop here
    if (!rateLimitPassed || res.headersSent) {
      return;
    }

    const baseUrl = resolveBaseUrl(req);
    const mcpServer = createAppServer(baseUrl);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    let timeout: NodeJS.Timeout | null = null;
    try {
      let parsedBody: unknown | undefined = undefined;

      // Pre-parse only when headers are spec-compliant, otherwise let SDK handle 406/415.
      const shouldPreParse =
        req.method === "POST" &&
        acceptHeader.includes("application/json") &&
        acceptHeader.includes("text/event-stream") &&
        contentType.includes("application/json");

      if (shouldPreParse) {
        let raw: Buffer;
        try {
          raw = await readBodyWithLimit(req, MAX_REQUEST_SIZE_BYTES);
        } catch (e: any) {
          const code = safeString(e?.code ?? "");
          if (code === "body_too_large") {
            const errPayload = jsonRpcErrorResponse(413, "Request entity too large", {
              error_code: "body_too_large",
              correlation_id: correlationId,
              trace_id: traceId,
              max_size: MAX_REQUEST_SIZE_BYTES,
            }, -32000);
            res.writeHead(errPayload.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(errPayload.payload));
            return;
          }
          const errPayload = jsonRpcErrorResponse(400, "Request aborted", {
            error_code: "request_aborted",
            correlation_id: correlationId,
            trace_id: traceId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
        (req as any).__bodySize = raw.length;
        const hashPrefix = createHash("sha256").update(raw.slice(0, 256)).digest("hex");
        logStructuredEvent(
          "info",
          "mcp_request_received",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            method: req.method,
            url: req.url,
            content_type: contentType,
            accept: acceptHeader,
            content_length: contentLength,
            body_size: raw.length,
            body_hash_prefix: hashPrefix,
          }
        );
        try {
          parsedBody = JSON.parse(raw.toString("utf-8"));
        } catch (e) {
          const errPayload = jsonRpcErrorResponse(400, "Parse error: Invalid JSON", {
            error_code: "invalid_json",
            correlation_id: correlationId,
            trace_id: traceId,
          });
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
      }

      timeout = setTimeout(() => {
        if (!res.headersSent) {
          const errPayload = jsonRpcErrorResponse(408, "Request timeout", {
            error_code: "timeout",
            correlation_id: correlationId,
            trace_id: traceId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
        }
        try { transport.close(); } catch {}
        try { mcpServer.close(); } catch {}
      }, REQUEST_TIMEOUT_MS);

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      logStructuredEvent(
        "error",
        "mcp_request_error",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: "",
          step_id: "",
          contract_id: "",
        },
        {
          message: safeString((error as Error)?.message ?? error),
        }
      );
      if (!res.headersSent) {
        const errPayload = jsonRpcErrorResponse(500, "Internal server error", {
          error_code: "server_error",
          correlation_id: correlationId,
          trace_id: traceId,
        }, -32000);
        res.writeHead(errPayload.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(errPayload.payload));
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return;
  }

  res.writeHead(404).end("Not Found");
};

httpServer.listen = createServer(httpServer).listen.bind(createServer(httpServer));

async function startServer(): Promise<void> {
  try {
    await getRunStep();
  } catch (err) {
    console.error("[FATAL] run_step module failed to load at startup:", err);
    process.exit(1);
  }

  httpServer.listen(port, host, () => {
    console.log(
      `Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`
    );
    if (isLocalDev) {
      console.log(`Local dev: GET http://localhost:${port}/test  POST http://localhost:${port}/run_step`);
    }
  });
}

void startServer();
