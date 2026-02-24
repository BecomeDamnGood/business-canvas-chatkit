// mcp-server/server.ts
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createRateLimitMiddleware } from "./src/middleware/rateLimit.js";
import { applySecurityHeaders } from "./src/middleware/security.js";
import {
  CanvasStateZod,
  getDefaultState,
  getFinalsSnapshot,
  normalizeState,
  normalizeStateLanguageSource,
} from "./src/core/state.js";
import { getPresentationTemplatePath } from "./src/core/presentation_paths.js";
import { safeString } from "./src/server_safe_string.js";
import {
  VIEW_CONTRACT_VERSION,
} from "./src/core/bootstrap_runtime.js";

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
const BOOTSTRAP_SESSION_ID_PREFIX = "bs_";
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

function parsePositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
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
  const text = safeString(raw ?? "").trim().toLowerCase();
  if (!text) return "";
  const firstPart = text.split(",")[0]?.trim() || "";
  const firstToken = firstPart.split(";")[0]?.trim() || "";
  if (!firstToken) return "";
  const code = firstToken.split(/[-_]/)[0]?.trim() || "";
  if (!/^[a-z]{2,3}$/.test(code)) return "";
  return code;
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

function canonicalizeStateForToolInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const next = { ...(raw as Record<string, unknown>) };
  next.language_source = normalizeStateLanguageSource(next.language_source);
  return next;
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
  host_widget_session_id?: string;
  state?: Record<string, unknown>;
}): Promise<{ structuredContent: Record<string, unknown>; meta?: Record<string, unknown> }> {
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
  console.log("[host_session_id_seen]", {
    source: hostWidgetSessionId.startsWith("internal:") ? "run_step_internal" : "run_step_args",
    host_widget_session_id: hostWidgetSessionId,
  });
  const hostSessionGuardV1 = true;
  let stateForTool: Record<string, unknown> = {
    ...state,
    ...(hasInitiator || !shouldSeedInitialUserMessage ? {} : { initial_user_message: normalizedMessage }),
    ...(shouldMarkStarted ? { started: "true" } : {}),
  };
  if (requiresExplicitStart && !shouldMarkStarted) {
    stateForTool = { ...stateForTool, started: "false" };
  }
  const incomingBootstrapSessionRaw = safeString((stateForTool as any).bootstrap_session_id ?? "").trim();
  const incomingBootstrapSession = normalizeBootstrapSessionId(incomingBootstrapSessionRaw);
  if (incomingBootstrapSessionRaw && !incomingBootstrapSession) {
    console.warn("[bootstrap_session_id_rejected]", {
      source: "run_step_state",
      provided: incomingBootstrapSessionRaw,
    });
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
  stateForTool = { ...stateForTool, host_widget_session_id: hostWidgetSessionId };

  const stepIdStr = safeString(current_step_id ?? "");
  const msgLen = typeof user_message_raw === "string" ? user_message_raw.length : 0;
  const stateKeysCount = stateForTool && typeof stateForTool === "object" && stateForTool !== null ? Object.keys(stateForTool).length : 0;
  const localeHint = safeString(args.locale_hint ?? "");
  const inputMode = safeString(args.input_mode ?? "chat");
  const action = upperMessage.startsWith("ACTION_") ? upperMessage : "text_input";
  console.log("[run_step] request", {
    input_mode: inputMode || "chat",
    action,
    step_id: stepIdStr,
    user_message_len: msgLen,
    state_keys: stateKeysCount,
    locale_hint: localeHint,
    locale_hint_source: localeHintSource,
    host_widget_session_id: hostWidgetSessionId || "",
  });
  const nowMs = Date.now();
  let incomingOrdering = readBootstrapOrdering({ state: stateForTool });
  const bootstrapSessionGuardV1 = true;
  if (bootstrapSessionGuardV1 && incomingOrdering.sessionId && incomingOrdering.epoch > 0) {
    const staleCheck = isStaleBootstrapPayload({
      sessionId: incomingOrdering.sessionId,
      hostWidgetSessionId: incomingOrdering.hostWidgetSessionId,
      epoch: incomingOrdering.epoch,
      responseSeq: incomingOrdering.responseSeq,
      nowMs,
    });
    if (
      hostSessionGuardV1 &&
      incomingOrdering.hostWidgetSessionId &&
      staleCheck.latest?.hostWidgetSessionId &&
      incomingOrdering.hostWidgetSessionId !== staleCheck.latest.hostWidgetSessionId
    ) {
      console.warn("[host_session_mismatch_dropped]", {
        input_mode: inputMode || "chat",
        action,
        incoming_host_widget_session_id: incomingOrdering.hostWidgetSessionId,
        latest_host_widget_session_id: staleCheck.latest.hostWidgetSessionId,
      });
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
      const responseSeq = nextBootstrapResponseSeq();
      const staleResult = attachBootstrapDiagnostics({
        responseKind: "run_step",
        resultForClient: staleSource,
        bootstrapSessionId: staleCheck.latest?.sessionId || incomingOrdering.sessionId,
        bootstrapEpoch: staleCheck.latest?.epoch || incomingOrdering.epoch,
        responseSeq,
        hostWidgetSessionId:
          staleCheck.latest?.hostWidgetSessionId || incomingOrdering.hostWidgetSessionId || hostWidgetSessionId,
      });
      registerBootstrapSnapshot({
        result: staleResult,
        nowMs,
      });
      const staleStepMeta =
        safeString((staleResult.state as Record<string, unknown> | undefined)?.current_step ?? "unknown") || "unknown";
      const staleSpecialistMeta = safeString(staleResult.active_specialist ?? "unknown") || "unknown";
      console.warn("[stale_bootstrap_payload_dropped]", {
        input_mode: inputMode || "chat",
        action,
        session_id: incomingOrdering.sessionId,
        host_widget_session_id: incomingOrdering.hostWidgetSessionId || "",
        stale_reason: staleCheck.reason || "unknown",
        payload_epoch: incomingOrdering.epoch,
        payload_response_seq: incomingOrdering.responseSeq,
        latest_epoch: staleCheck.latest?.epoch || incomingOrdering.epoch,
        latest_response_seq: staleCheck.latest?.lastResponseSeq || 0,
      });
      const modelResult = buildModelSafeResult(staleResult);
      const structuredContent: Record<string, unknown> = {
        title: `The Business Strategy Canvas Builder (${VERSION})`,
        meta: `step: ${staleStepMeta} | specialist: ${staleSpecialistMeta}`,
        result: modelResult,
      };
      const uiPayload = buildUiStructured(staleResult);
      if (uiPayload) structuredContent.ui = uiPayload;
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
    const resultForClient = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: resultForClientRaw,
      bootstrapSessionId: sessionId,
      bootstrapEpoch: epoch,
      responseSeq,
      hostWidgetSessionId,
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
    const bootstrapWaitingLocale = resultUiFlags.bootstrap_waiting_locale === true;
    const bootstrapRetryHint = safeString(resultUiFlags.bootstrap_retry_hint ?? "");
    const bootstrapRetryScheduled = bootstrapWaitingLocale && bootstrapRetryHint === "poll";
    console.log("[run_step] response", {
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
      interactive_fallback_active: resultUiFlags.interactive_fallback_active === true,
      bootstrap_retry_scheduled: bootstrapRetryScheduled,
      host_widget_session_id: hostWidgetSessionId || "",
      current_step: safeString(resultState.current_step ?? stepMeta),
      active_specialist: specialistMeta,
    });
    const modelResult = buildModelSafeResult(resultForClient);
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: `step: ${stepMeta} | specialist: ${specialistMeta}`,
      result: modelResult,
    };
    const uiPayload = buildUiStructured(resultForClient);
    if (uiPayload) structuredContent.ui = uiPayload;
    registerBootstrapSnapshot({
      result: resultForClient,
      nowMs: Date.now(),
    });
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
    console.error("[run_step] ERROR:", safeString(err?.message ?? err), safeString(err?.meta ?? ""));
    if (err?.stack) {
      console.error("[run_step] STACK:", safeString(err.stack));
    }
    if (debugEnabled) {
      const details = err instanceof Error
        ? [err.message, err.stack].filter(Boolean).join("\n")
        : inspect(err, { depth: 8, breakLength: 120 });
      console.error("[run_step] DEV: exception details:", details);
      if (err?.cause) {
        console.error("[run_step] DEV: cause:", inspect(err.cause, { depth: 8, breakLength: 120 }));
      }
      const status = err?.status ?? err?.statusCode ?? err?.response?.status;
      if (status !== undefined) {
        console.error("[run_step] DEV: status:", safeString(status));
      }
      const code = err?.code ?? err?.response?.data?.code ?? err?.response?.data?.error?.code;
      if (code !== undefined) {
        console.error("[run_step] DEV: code:", safeString(code));
      }
      console.error("[run_step] DEV: OPENAI_API_KEY present:", Boolean(process.env.OPENAI_API_KEY));
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
        type: "server_error",
        message: "Probeer opnieuw", // UI message, niet chat
        retry_action: "reload"
      },
    };
    const fallbackResult = attachBootstrapDiagnostics({
      responseKind: "run_step",
      resultForClient: fallbackResultBase as Record<string, unknown>,
      bootstrapSessionId: incomingOrdering.sessionId,
      bootstrapEpoch: incomingOrdering.epoch,
      responseSeq,
      hostWidgetSessionId: hostWidgetSessionId || incomingOrdering.hostWidgetSessionId,
    });
    registerBootstrapSnapshot({
      result: fallbackResult,
      nowMs: Date.now(),
    });
    const modelResult = buildModelSafeResult(fallbackResult as Record<string, unknown>);
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: "error",
      result: modelResult,
    };
    const uiPayload = buildUiStructured(fallbackResult as Record<string, unknown>);
    if (uiPayload) structuredContent.ui = uiPayload;
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
  const uiStringsStatus = safeString(state.ui_strings_status || (result as any).ui_strings_status || "");
  const uiGateStatus = safeString((result as any).ui_gate_status || state.ui_gate_status || "");
  const bootstrapPhase = safeString((result as any).bootstrap_phase || state.bootstrap_phase || "");
  const bootstrapSessionId = normalizeBootstrapSessionId(
    (result as any).bootstrap_session_id || state.bootstrap_session_id || ""
  );
  const bootstrapEpoch = parsePositiveInt((result as any).bootstrap_epoch ?? state.bootstrap_epoch);
  const responseSeq = parsePositiveInt((result as any).response_seq ?? state.response_seq);
  const responseKindRaw = safeString((result as any).response_kind || state.response_kind || "");
  const responseKind = responseKindRaw === "run_step" ? "run_step" : "";
  const hostWidgetSessionId = safeString(
    (result as any).host_widget_session_id ||
      state.host_widget_session_id ||
      flags.host_widget_session_id ||
      ""
  );
  const safeState: Record<string, unknown> = {
    current_step: currentStep || "step_0",
  };
  if (started) safeState.started = started;
  if (uiStringsStatus) safeState.ui_strings_status = uiStringsStatus;
  if (uiGateStatus) safeState.ui_gate_status = uiGateStatus;
  if (bootstrapPhase) safeState.bootstrap_phase = bootstrapPhase;
  if (bootstrapSessionId) safeState.bootstrap_session_id = bootstrapSessionId;
  if (bootstrapEpoch > 0) safeState.bootstrap_epoch = bootstrapEpoch;
  if (responseSeq > 0) safeState.response_seq = responseSeq;
  if (responseKind) safeState.response_kind = responseKind;
  if (hostWidgetSessionId) safeState.host_widget_session_id = hostWidgetSessionId;
  return {
    model_result_shape_version: "v2_minimal",
    ok: result.ok === true,
    tool: safeString(result.tool || "run_step"),
    current_step_id: currentStep,
    ui_gate_status: uiGateStatus,
    language: safeString((result as any).language || state.language || ""),
    interactive_fallback_active: flags.interactive_fallback_active === true,
    bootstrap_phase: bootstrapPhase,
    ...(bootstrapSessionId ? { bootstrap_session_id: bootstrapSessionId } : {}),
    ...(bootstrapEpoch > 0 ? { bootstrap_epoch: bootstrapEpoch } : {}),
    ...(responseSeq > 0 ? { response_seq: responseSeq } : {}),
    ...(responseKind ? { response_kind: responseKind } : {}),
    ...(hostWidgetSessionId ? { host_widget_session_id: hostWidgetSessionId } : {}),
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

function buildUiStructured(result: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const prestartModeV1 = true;
  const viewContractHardenV1 = true;
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const flags =
    uiObj.flags && typeof uiObj.flags === "object"
      ? (uiObj.flags as Record<string, unknown>)
      : {};
  const state =
    result && typeof (result as any).state === "object" && (result as any).state
      ? ((result as any).state as Record<string, unknown>)
      : {};
  const bootstrapPhaseRaw = safeString(flags.bootstrap_phase || state.bootstrap_phase || "");
  const bootstrapPhase =
    bootstrapPhaseRaw === "interactive_fallback" ? "waiting_locale" : bootstrapPhaseRaw;
  const waitingLocaleByPhase =
    bootstrapPhase === "waiting_locale" ||
    bootstrapPhase === "waiting_both" ||
    bootstrapPhase === "waiting_state";
  const waitingLocale = flags.bootstrap_waiting_locale === true || waitingLocaleByPhase;
  const viewContractVersion =
    safeString(flags.view_contract_version || state.view_contract_version || (result as any).view_contract_version || "") ||
    VIEW_CONTRACT_VERSION;
  const started = safeString(state.started || "").toLowerCase() === "true";
  const prompt = safeString((result as any).prompt ?? "");
  const text = safeString((result as any).text ?? "");
  const promptBodyRaw = prompt || text || "";
  const actionCodesRaw = Array.isArray(uiObj.action_codes) ? uiObj.action_codes : [];
  const retryHint = safeString(flags.bootstrap_retry_hint ?? "");
  const optionsRaw = actionCodesRaw.map((code: unknown, idx: number) => ({
    id: safeString(idx + 1),
    actionCode: safeString(code),
  }));
  const hasInteractivePayload = safeString(promptBodyRaw).length > 0 || optionsRaw.length > 0;
  let mode: "waiting_locale" | "prestart" | "interactive" | "recovery" = "interactive";
  if (viewContractHardenV1) {
    if (waitingLocale) mode = "waiting_locale";
    else if (prestartModeV1 && !started) mode = "prestart";
    else if (!hasInteractivePayload) mode = "recovery";
  } else if (waitingLocale) {
    mode = "waiting_locale";
  }
  const promptBody = mode === "interactive" ? promptBodyRaw : "";
  const options = mode === "interactive" ? optionsRaw : [];
  if (mode !== "interactive" && !waitingLocale && started && !hasInteractivePayload) {
    console.warn("[ui_interactive_empty_payload_blocked]", {
      current_step: safeString(state.current_step ?? ""),
      bootstrap_phase: bootstrapPhase,
      result_ok: result.ok === true,
    });
  }
  const expectedChoiceCount =
    typeof uiObj.expected_choice_count === "number"
      ? uiObj.expected_choice_count
      : (options.length ? options.length : undefined);
  const nextFlags: Record<string, unknown> = { ...flags };
  const transportReady = safeString(state.transport_ready ?? "");
  const startDispatchState = safeString(state.start_dispatch_state ?? "");
  const hostWidgetSessionId = safeString(
    state.host_widget_session_id || flags.host_widget_session_id || (result as any).host_widget_session_id || ""
  );
  if (transportReady) nextFlags.transport_ready = transportReady;
  if (startDispatchState) nextFlags.start_dispatch_state = startDispatchState;
  if (hostWidgetSessionId) nextFlags.host_widget_session_id = hostWidgetSessionId;
  if (viewContractVersion) nextFlags.view_contract_version = viewContractVersion;
  return {
    prompt: { body: promptBody },
    options,
    state: {
      menu_id: safeString((result as any)?.specialist?.menu_id ?? ""),
      expected_choice_count: expectedChoiceCount,
      flags: nextFlags,
    },
    view: {
      version: VERSION,
      mode,
      waiting_locale: waitingLocale,
      view_contract_version: viewContractVersion,
      recovery_action:
        waitingLocale && retryHint === "poll"
          ? "retry_poll"
          : (mode === "recovery" ? "retry_poll" : ""),
      bootstrap_phase: bootstrapPhase,
    },
  };
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

  const RunStepInputSchema = z.object({
    // ChatGPT/Widget sometimes sends this as "start" or omits it
    current_step_id: z.string().optional().default("step_0"),
    user_message: z.string().optional().default(""),
    input_mode: z.enum(["widget", "chat"]).optional(),
    locale_hint: z.string().optional(),
    locale_hint_source: z
      .enum(["openai_locale", "webplus_i18n", "request_header", "message_detect", "none"])
      .optional(),
    host_widget_session_id: z.string().optional(),
    // Use CanvasStateZod schema for type safety and validation
    // .partial() makes all fields optional (for empty/partial state)
    // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
    state: z.preprocess(canonicalizeStateForToolInput, CanvasStateZod.partial().passthrough().optional()),
  });
  const ModelSafeResultOutputSchema = z.object({
    model_result_shape_version: z.literal("v2_minimal"),
    ok: z.boolean(),
    tool: z.string(),
    current_step_id: z.string(),
    state: z.record(z.string(), z.unknown()),
  }).passthrough();
  const ToolStructuredContentOutputSchema = z.object({
    title: z.string().optional(),
    meta: z.string().optional(),
    result: ModelSafeResultOutputSchema,
  }).passthrough();

  server.registerTool(
    "run_step",
    {
      title: "Business Strategy Canvas Builder",
      description:
        "Use this tool to open or progress the Business Strategy Canvas Builder UI. Do not generate business content in chat. Do not summarize or explain what the app shows. After calling this tool, output nothing or at most one short neutral sentence confirming the app is open. All questions and interaction happen inside the app UI.",
      inputSchema: RunStepInputSchema,
      annotations: {
        readOnlyHint: false, // Tool generates files and modifies state
        openWorldHint: false, // No external posts
        destructiveHint: false, // No destructive actions
        idempotentHint: false,
      },
      outputSchema: ToolStructuredContentOutputSchema,
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
      },
    },
    async (args, extra) => {
      const normalizedStepId = normalizeStepId(args.current_step_id ?? "");
      const isFirstStart = isFirstStartStep(
        normalizedStepId,
        (args.state ?? {}) as Record<string, unknown>
      );
      const localeFromExtra = resolveLocaleHintFromExtra(extra);
      const hostWidgetSessionId = normalizeHostWidgetSessionId(
        args.host_widget_session_id ?? resolveHostWidgetSessionIdFromExtra(extra)
      );
      const mergedLocale = mergeLocaleHintInputs(
        args.locale_hint,
        args.locale_hint_source,
        localeFromExtra
      );
      const { structuredContent, meta } = await runStepHandler({
        current_step_id: safeString(args.current_step_id ?? ""),
        user_message: safeString(args.user_message ?? ""),
        input_mode: args.input_mode,
        locale_hint: mergedLocale.locale_hint,
        locale_hint_source: mergedLocale.locale_hint_source,
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
      return {
        content: [{ type: "text", text: contentText }],
        structuredContent,
        ...(meta ? { _meta: meta } : {}),
      };
    }
  );

  console.log("[mcp_tool_contract]", {
    run_step_visibility: ["model", "app"],
    run_step_output_template: true,
    ui_resource_uri: uiResourceUri,
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

  // Health check (App Runner)
  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    if (req.method === "GET") {
      res.end(`VERSION=${VERSION}\nIMAGE_DIGEST=${IMAGE_DIGEST || "unknown"}`);
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
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const args = JSON.parse(body || "{}") as {
          current_step_id?: string;
          user_message?: string;
          input_mode?: "widget" | "chat";
          locale_hint?: string;
          locale_hint_source?: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
          host_widget_session_id?: string;
          state?: Record<string, unknown>;
        };
        const { structuredContent, meta } = await runStepHandler({
          current_step_id: safeString(args.current_step_id ?? "step_0") || "step_0",
          user_message: safeString(args.user_message ?? ""),
          input_mode: args.input_mode,
          locale_hint: safeString(args.locale_hint ?? ""),
          locale_hint_source: args.locale_hint_source ?? "none",
          host_widget_session_id: normalizeHostWidgetSessionId(args.host_widget_session_id),
          state: args.state,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ structuredContent, ...(meta ? { _meta: meta } : {}) }));
      } catch (e) {
        console.error("[POST /run_step]", e);
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
              max_size: MAX_REQUEST_SIZE_BYTES,
            }, -32000);
            res.writeHead(errPayload.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(errPayload.payload));
            return;
          }
          const errPayload = jsonRpcErrorResponse(400, "Request aborted", {
            error_code: "request_aborted",
            correlation_id: correlationId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
        (req as any).__bodySize = raw.length;
        const hashPrefix = createHash("sha256").update(raw.slice(0, 256)).digest("hex");
        console.warn(
          "[mcp] request",
          JSON.stringify({
            correlationId,
            method: req.method,
            url: req.url,
            contentType,
            accept: acceptHeader,
            contentLength,
            bodySize: raw.length,
            bodyHashPrefix: hashPrefix,
          })
        );
        try {
          parsedBody = JSON.parse(raw.toString("utf-8"));
        } catch (e) {
          const errPayload = jsonRpcErrorResponse(400, "Parse error: Invalid JSON", {
            error_code: "invalid_json",
            correlation_id: correlationId,
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
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        const errPayload = jsonRpcErrorResponse(500, "Internal server error", {
          error_code: "server_error",
          correlation_id: correlationId,
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
