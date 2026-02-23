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

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

const MCP_PATH = "/mcp";
const UI_RESOURCE_PATH = "/ui/step-card";
const UI_RESOURCE_QUERY = `?v=${encodeURIComponent(VERSION)}`;
const UI_RESOURCE_NAME = "business-canvas-widget";
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024); // 1MB default
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000); // 30s default
const OPEN_CANVAS_DEDUPE_TTL_MS = Number(process.env.OPEN_CANVAS_DEDUPE_TTL_MS || 5000);
const OPEN_CANVAS_CRITICAL_UI_KEYS_STEP0 = [
  "prestart.headline",
  "prestart.proven.title",
  "prestart.proven.body",
  "prestart.outcomes.title",
  "prestart.outcomes.item1",
  "prestart.outcomes.item2",
  "prestart.outcomes.item3",
  "prestart.meta.how.label",
  "prestart.meta.how.value",
  "prestart.meta.time.label",
  "prestart.meta.time.value",
] as const;

type OpenCanvasToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

const openCanvasDedupeCache = new Map<string, { expiresAt: number; response: OpenCanvasToolResponse }>();

function envFlagEnabled(name: string, defaultValue: boolean): boolean {
  const raw = safeString(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function stableStringify(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (input === null || input === undefined) return null;
    if (Array.isArray(input)) return input.map((item) => walk(item));
    if (typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, walk(val)]);
      return Object.fromEntries(entries);
    }
    if (typeof input === "number") {
      return Number.isFinite(input) ? input : null;
    }
    if (typeof input === "boolean" || typeof input === "string") return input;
    return safeString(input);
  };
  try {
    return JSON.stringify(walk(value));
  } catch {
    return "";
  }
}

function compactOpenCanvasState(state: unknown): Record<string, unknown> {
  const source = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return {
    current_step: safeString(source.current_step ?? ""),
    started: safeString(source.started ?? ""),
    language: safeString(source.language ?? ""),
    language_source: safeString(source.language_source ?? ""),
    ui_strings_status: safeString(source.ui_strings_status ?? ""),
    ui_bootstrap_status: safeString(source.ui_bootstrap_status ?? ""),
    step_0_final: safeString(source.step_0_final ?? ""),
    business_name: safeString(source.business_name ?? ""),
    initial_user_message: safeString(source.initial_user_message ?? ""),
  };
}

function openCanvasDedupeToken(args: {
  user_message?: unknown;
  locale_hint?: unknown;
  locale_hint_source?: unknown;
  state?: unknown;
}): string {
  const payload = {
    tool: "open_canvas",
    user_message: safeString(args.user_message ?? "").trim(),
    locale_hint: normalizeLocaleHint(args.locale_hint),
    locale_hint_source: normalizeLocaleHintSource(args.locale_hint_source),
    state: compactOpenCanvasState(args.state),
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function purgeExpiredOpenCanvasDedupeEntries(nowMs: number): void {
  for (const [key, value] of openCanvasDedupeCache.entries()) {
    if (value.expiresAt <= nowMs) openCanvasDedupeCache.delete(key);
  }
}

function cloneOpenCanvasResponse<T extends OpenCanvasToolResponse>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stampOpenCanvasDedupeMetadata(
  response: OpenCanvasToolResponse,
  dedupeToken: string,
  dedupeAtMs: number
): OpenCanvasToolResponse {
  const meta = response._meta && typeof response._meta === "object" ? (response._meta as Record<string, unknown>) : null;
  const widgetResult =
    meta && meta.widget_result && typeof meta.widget_result === "object"
      ? (meta.widget_result as Record<string, unknown>)
      : null;
  const widgetState =
    widgetResult && widgetResult.state && typeof widgetResult.state === "object"
      ? (widgetResult.state as Record<string, unknown>)
      : null;
  if (widgetState) {
    widgetState.open_canvas_dedupe_token = dedupeToken;
    widgetState.open_canvas_dedupe_at_ms = dedupeAtMs;
  }
  return response;
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

function normalizeLocaleHintSource(raw: unknown): "openai_locale" | "webplus_i18n" | "request_header" | "none" {
  const value = safeString(raw).trim();
  return value === "openai_locale" || value === "webplus_i18n" || value === "request_header"
    ? value
    : "none";
}

function canonicalizeStateForToolInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const next = { ...(raw as Record<string, unknown>) };
  next.language_source = normalizeStateLanguageSource(next.language_source);
  return next;
}

function uiStringsRenderableForLang(uiStringsRaw: unknown): boolean {
  if (!uiStringsRaw || typeof uiStringsRaw !== "object" || Array.isArray(uiStringsRaw)) return false;
  const uiStrings = uiStringsRaw as Record<string, unknown>;
  return OPEN_CANVAS_CRITICAL_UI_KEYS_STEP0.every((key) => safeString(uiStrings[key] || "").trim().length > 0);
}

function mergeLocaleHintInputs(
  argsLocaleHint: unknown,
  argsLocaleSource: unknown,
  extraLocale: { locale_hint: string; locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "none" }
): { locale_hint: string; locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "none" } {
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
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "none";
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

function buildOpenCanvasBootstrapResponse(args: {
  locale_hint: string;
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "none";
  state?: Record<string, unknown>;
  seed_user_message?: string;
}): { structuredContent: Record<string, unknown>; meta: Record<string, unknown> } {
  const sourceStateRaw = args.state && typeof args.state === "object" ? args.state : {};
  const sourceState = normalizeState(sourceStateRaw);
  const defaults = getDefaultState();
  const resolvedLanguage = normalizeLocaleHint(args.locale_hint);
  const persistedLanguage = safeString(sourceState.language || "").trim().toLowerCase();
  const persistedLanguageSource = normalizeStateLanguageSource(sourceState.language_source);
  const finalLanguage = resolvedLanguage || persistedLanguage || "en";
  const finalLanguageSource =
    resolvedLanguage
      ? "locale_hint"
      : (persistedLanguageSource || (persistedLanguage ? "persisted" : ""));
  const seedMessage = safeString(args.seed_user_message ?? "").trim();
  const incomingUiStrings =
    sourceState.ui_strings && typeof sourceState.ui_strings === "object"
      ? (sourceState.ui_strings as Record<string, string>)
      : {};
  const stringsRenderable = uiStringsRenderableForLang(incomingUiStrings);
  const clientClaimsReady =
    safeString(sourceState.ui_strings_status) === "ready" &&
    safeString(sourceState.ui_strings_critical_ready) === "true" &&
    persistedLanguage === finalLanguage;
  const gateReady = clientClaimsReady || stringsRenderable || finalLanguage === "en";
  const interactiveFallbackEnabled = envFlagEnabled("UI_INTERACTIVE_FALLBACK_V1", true);
  const waitingLocale = !gateReady;
  const interactiveFallbackActive = waitingLocale && interactiveFallbackEnabled;
  const bootstrapInteractiveReady = gateReady || interactiveFallbackActive;
  const uiStringsStatus = gateReady ? "ready" : "pending";
  const bootstrapState: Record<string, unknown> = {
    state_version: safeString(sourceState.state_version || defaults.state_version) || defaults.state_version,
    current_step: "step_0",
    started: "false",
    active_specialist: "ValidationAndBusinessName",
    intro_shown_for_step: "",
    intro_shown_session: "false",
    language: finalLanguage,
    language_locked: finalLanguage ? "true" : "false",
    language_override: "false",
    language_source: finalLanguageSource,
    ui_strings: stringsRenderable ? incomingUiStrings : {},
    ui_strings_lang: finalLanguage,
    ui_strings_version: safeString(sourceState.ui_strings_version || ""),
    ui_strings_status: uiStringsStatus,
    ui_strings_requested_lang: finalLanguage,
    ui_bootstrap_status: gateReady ? "ready" : "awaiting_locale",
    ui_gate_status: gateReady ? "ready" : "waiting_locale",
    ui_gate_reason: gateReady ? "" : "translation_pending",
    ui_gate_since_ms: gateReady ? 0 : Date.now(),
    ui_translation_mode: gateReady ? "full" : "critical_first",
    ui_strings_critical_ready: gateReady ? "true" : "false",
    ui_strings_full_ready: gateReady ? "true" : "false",
    ui_strings_background_inflight: gateReady ? "false" : "true",
    last_specialist_result: {},
    step_0_final: safeString(sourceState.step_0_final || ""),
    dream_final: "",
    purpose_final: "",
    bigwhy_final: "",
    role_final: "",
    entity_final: "",
    strategy_final: "",
    targetgroup_final: "",
    productsservices_final: "",
    rulesofthegame_final: "",
    presentation_brief_final: "",
    provisional_by_step: {},
    provisional_source_by_step: {},
    __dream_runtime_mode: "self",
    dream_builder_statements: [],
    business_name: safeString(sourceState.business_name || "TBD") || "TBD",
    quote_last_by_step: {},
    summary_target: safeString(sourceState.summary_target || "unknown") || "unknown",
  };
  if (seedMessage && !safeString(bootstrapState.initial_user_message ?? "").trim()) {
    bootstrapState.initial_user_message = seedMessage;
  }

  const resultForClient: Record<string, unknown> = {
    ok: true,
    tool: "open_canvas",
    current_step_id: "step_0",
    active_specialist: "ValidationAndBusinessName",
    text: "",
    prompt: "",
    specialist: {},
    state: bootstrapState,
    ui: {
      action_codes: [],
      flags: {
        bootstrap_waiting_locale: waitingLocale,
        bootstrap_interactive_ready: bootstrapInteractiveReady,
        interactive_fallback_active: interactiveFallbackActive,
        bootstrap_retry_hint: waitingLocale ? "poll" : "",
      },
    },
  };
  const modelResult = buildModelSafeResult(resultForClient);
  const structuredContent: Record<string, unknown> = {
    title: `The Business Strategy Canvas Builder (${VERSION})`,
    meta: "step: step_0 | specialist: ValidationAndBusinessName",
    result: modelResult,
  };
  const uiPayload = buildUiStructured(resultForClient);
  if (uiPayload) structuredContent.ui = uiPayload;
  return {
    structuredContent,
    meta: {
      widget_result: resultForClient,
    },
  };
}

/** Shared run_step logic for MCP tool and POST /run_step (local testing). */
async function runStepHandler(args: {
  current_step_id: string;
  user_message: string;
  input_mode?: "widget" | "chat";
  locale_hint?: string;
  locale_hint_source?: "openai_locale" | "webplus_i18n" | "request_header" | "none";
  state?: Record<string, unknown>;
}): Promise<{ structuredContent: Record<string, unknown>; meta?: Record<string, unknown> }> {
  const current_step_id = normalizeStepId(args.current_step_id ?? "");
  const state = (args.state ?? {}) as Record<string, unknown>;
  const user_message_raw = safeString(args.user_message ?? "");
  const localeHintSourceRaw = safeString(args.locale_hint_source ?? "none");
  const localeHintSource =
    localeHintSourceRaw === "openai_locale" ||
    localeHintSourceRaw === "webplus_i18n" ||
    localeHintSourceRaw === "request_header"
      ? localeHintSourceRaw
      : "none";
  const isStart = current_step_id === "step_0";
  const user_message =
    isStart && !user_message_raw.trim() ? "" : user_message_raw;
  const normalizedMessage = user_message_raw.trim();
  const upperMessage = normalizedMessage.toUpperCase();
  const isActionMessage = upperMessage.startsWith("ACTION_");
  const isBootstrapPollAction = upperMessage === "ACTION_BOOTSTRAP_POLL";
  const isStartAction = upperMessage === "ACTION_START";
  const isTechnicalRouteMessage =
    normalizedMessage.startsWith("__ROUTE__") || normalizedMessage.startsWith("choice:");
  const shouldMarkStarted =
    isStart &&
    Boolean(normalizedMessage) &&
    !isBootstrapPollAction &&
    !isTechnicalRouteMessage &&
    (isStartAction || !isActionMessage);
  const shouldSeedInitialUserMessage =
    Boolean(normalizedMessage) &&
    !isActionMessage &&
    !isBootstrapPollAction &&
    !isTechnicalRouteMessage;
  const hasInitiator = safeString(state?.initial_user_message ?? "").trim() !== "";
  const stateForTool =
    shouldMarkStarted
      ? {
          ...state,
          ...(hasInitiator || !shouldSeedInitialUserMessage ? {} : { initial_user_message: normalizedMessage }),
          started: "true",
        }
      : state;

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
  });

  try {
    const runStepTool = await getRunStep();
    const result = await runStepTool({
      user_message,
      input_mode: args.input_mode,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      state: stateForTool,
    });
    const { debug: _omit, ...resultForClient } = result as {
      debug?: unknown;
      [key: string]: unknown;
    };
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
      ui_bootstrap_status: safeString(resultState.ui_bootstrap_status ?? ""),
      ui_gate_status: safeString(resultState.ui_gate_status ?? ""),
      ui_gate_reason: safeString(resultState.ui_gate_reason ?? ""),
      ui_gate_since_ms: Number(resultState.ui_gate_since_ms ?? 0) || 0,
      bootstrap_waiting_locale: bootstrapWaitingLocale,
      interactive_fallback_active: resultUiFlags.interactive_fallback_active === true,
      bootstrap_retry_scheduled: bootstrapRetryScheduled,
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
    
    const fallbackResult = {
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
  const safeState: Record<string, unknown> = {
    current_step: currentStep || "step_0",
  };
  if (started) safeState.started = started;
  if (uiStringsStatus) safeState.ui_strings_status = uiStringsStatus;
  if (uiGateStatus) safeState.ui_gate_status = uiGateStatus;
  return {
    model_result_shape_version: "v2_minimal",
    ok: result.ok === true,
    tool: safeString(result.tool || "run_step"),
    current_step_id: currentStep,
    ui_gate_status: uiGateStatus,
    language: safeString((result as any).language || state.language || ""),
    interactive_fallback_active: flags.interactive_fallback_active === true,
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
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const flags =
    uiObj.flags && typeof uiObj.flags === "object"
      ? (uiObj.flags as Record<string, unknown>)
      : {};
  const waitingLocale = flags.bootstrap_waiting_locale === true;
  const prompt = safeString((result as any).prompt ?? "");
  const text = safeString((result as any).text ?? "");
  const promptBody = waitingLocale ? "" : (prompt || text || "");
  const actionCodes = waitingLocale ? [] : (Array.isArray(uiObj.action_codes) ? uiObj.action_codes : []);
  const retryHint = safeString(flags.bootstrap_retry_hint ?? "");
  const options = actionCodes.map((code: unknown, idx: number) => ({
    id: safeString(idx + 1),
    actionCode: safeString(code),
  }));
  const expectedChoiceCount =
    typeof uiObj.expected_choice_count === "number"
      ? uiObj.expected_choice_count
      : (actionCodes.length ? actionCodes.length : undefined);
  return {
    prompt: { body: promptBody },
    options,
    state: {
      menu_id: safeString((result as any)?.specialist?.menu_id ?? ""),
      expected_choice_count: expectedChoiceCount,
      flags,
    },
    view: {
      version: VERSION,
      mode: waitingLocale ? "waiting_locale" : "interactive",
      waiting_locale: waitingLocale,
      recovery_action: waitingLocale && retryHint === "poll" ? "retry_poll" : "",
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
    locale_hint_source: z.enum(["openai_locale", "webplus_i18n", "request_header", "none"]).optional(),
    // Use CanvasStateZod schema for type safety and validation
    // .partial() makes all fields optional (for empty/partial state)
    // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
    state: z.preprocess(canonicalizeStateForToolInput, CanvasStateZod.partial().passthrough().optional()),
  });
  const OpenCanvasInputSchema = z.object({
    user_message: z.string().optional().default(""),
    locale_hint: z.string().optional(),
    locale_hint_source: z.enum(["openai_locale", "webplus_i18n", "request_header", "none"]).optional(),
    state: z.preprocess(canonicalizeStateForToolInput, CanvasStateZod.partial().passthrough().optional()),
  });

  server.registerTool(
    "open_canvas",
    {
      title: "Open Business Strategy Canvas Builder",
      description:
        "Open the Business Strategy Canvas Builder app so the user can continue in the UI. Call this once per user turn unless the user explicitly asks to reopen the app. Do not generate business content in chat after this call. Do not summarize app content. Output nothing or at most one short neutral sentence that the app is open.",
      inputSchema: OpenCanvasInputSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
      },
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: {
          resourceUri: uiResourceUri,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": uiResourceUri,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening app...",
        "openai/toolInvocation/invoked": "App opened",
      },
    },
    async (args, extra) => {
      const localeFromExtra = resolveLocaleHintFromExtra(extra);
      const mergedLocale = mergeLocaleHintInputs(
        args.locale_hint,
        args.locale_hint_source,
        localeFromExtra
      );
      const dedupeEnabled = envFlagEnabled("OPEN_CANVAS_DEDUPE_V1", true);
      const dedupeToken = openCanvasDedupeToken({
        user_message: args.user_message,
        locale_hint: mergedLocale.locale_hint,
        locale_hint_source: mergedLocale.locale_hint_source,
        state: args.state ?? {},
      });
      const nowMs = Date.now();
      if (dedupeEnabled) {
        purgeExpiredOpenCanvasDedupeEntries(nowMs);
        const cached = openCanvasDedupeCache.get(dedupeToken);
        if (cached && cached.expiresAt > nowMs) {
          console.log("[open_canvas] dedupe", {
            open_canvas_deduped: true,
            open_canvas_dedupe_key_hash: dedupeToken.slice(0, 16),
          });
          return cloneOpenCanvasResponse(cached.response);
        }
      }
      const { structuredContent, meta } = buildOpenCanvasBootstrapResponse({
        locale_hint: mergedLocale.locale_hint,
        locale_hint_source: mergedLocale.locale_hint_source,
        seed_user_message: safeString(args.user_message ?? ""),
        state: (args.state ?? {}) as Record<string, unknown>,
      });
      const response = stampOpenCanvasDedupeMetadata(
        {
        content: [{ type: "text", text: "" }],
        structuredContent,
        ...(meta ? { _meta: meta } : {}),
        },
        dedupeToken,
        nowMs
      );
      const bootstrapResult =
        meta && typeof meta === "object" && (meta as any).widget_result && typeof (meta as any).widget_result === "object"
          ? ((meta as any).widget_result as Record<string, unknown>)
          : {};
      const bootstrapState =
        bootstrapResult.state && typeof bootstrapResult.state === "object"
          ? (bootstrapResult.state as Record<string, unknown>)
          : {};
      const shouldCacheOpenCanvasResponse =
        safeString(bootstrapState.ui_gate_status ?? "") !== "waiting_locale";
      if (dedupeEnabled && shouldCacheOpenCanvasResponse) {
        openCanvasDedupeCache.set(dedupeToken, {
          expiresAt: nowMs + OPEN_CANVAS_DEDUPE_TTL_MS,
          response: cloneOpenCanvasResponse(response),
        });
      }
      console.log("[open_canvas] dedupe", {
        open_canvas_deduped: false,
        open_canvas_dedupe_key_hash: dedupeToken.slice(0, 16),
      });
      console.log("[open_canvas] bootstrap response", {
        locale_hint_source: mergedLocale.locale_hint_source,
        resolved_language: safeString(bootstrapState.language ?? ""),
        bootstrap_state_language_source: safeString(bootstrapState.language_source ?? ""),
        ui_gate_status: safeString(bootstrapState.ui_gate_status ?? ""),
        ui_bootstrap_status: safeString(bootstrapState.ui_bootstrap_status ?? ""),
        current_step: safeString(bootstrapState.current_step ?? ""),
      });
      return response;
    }
  );

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
      },
      // Note: securitySchemes is in _meta per MCP SDK implementation requirements.
      // The MCP SDK does not support top-level securitySchemes in the current version.
      // This is included in the MCP response JSON that ChatGPT/OpenAI receives.
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: {
          resourceUri: uiResourceUri,
          visibility: ["model", "app"],
        },
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
    open_canvas_visibility: ["model", "app"],
    open_canvas_output_template: true,
    run_step_visibility: ["model", "app"],
    run_step_output_template: false,
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
      res.end(`VERSION=${VERSION}`);
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
          locale_hint_source?: "openai_locale" | "webplus_i18n" | "request_header" | "none";
          state?: Record<string, unknown>;
        };
        const { structuredContent, meta } = await runStepHandler({
          current_step_id: safeString(args.current_step_id ?? "step_0") || "step_0",
          user_message: safeString(args.user_message ?? ""),
          input_mode: args.input_mode,
          locale_hint: safeString(args.locale_hint ?? ""),
          locale_hint_source: args.locale_hint_source ?? "none",
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
          "cache-control": "public, max-age=3600",
          "x-ui-version": VERSION,
        });
        res.end(withVersion);
        return;
      }
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
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
