/**
 * run_step calling, rate limit UX, and loading/disable logic.
 * Uses ui_state for shared state; no state export from this module.
 */

import {
  getIsLoading,
  getRateLimitUntil,
  setIsLoading,
  setRateLimitUntil,
} from "./ui_state.js";
import {
  computeBootstrapRenderState as computeBootstrapRenderStateCore,
  computeHydrationState as computeHydrationStateCore,
  mergeToolOutputWithResponseMetadata,
  normalizeToolOutput as normalizeToolOutputCore,
  resolveWidgetPayload as resolveWidgetPayloadCore,
} from "./locale_bootstrap_runtime.js";
export type { BootstrapRenderState, HydrationStatus, ResolvedWidgetPayload, WaitingReason } from "./locale_bootstrap_runtime.js";
import type { HydrationStatus, ResolvedWidgetPayload } from "./locale_bootstrap_runtime.js";
export { mergeToolOutputWithResponseMetadata };

// Injected by main during init
let _render: (overrideRaw?: unknown) => void;
let _t: (lang: string, key: string) => string;

let bridgeEnabled = false;
let bridgeSeq = 0;
const pendingBridgeCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

export function initActionsConfig(config: {
  render: (overrideRaw?: unknown) => void;
  t: (lang: string, key: string) => string;
}): void {
  _render = config.render;
  _t = config.t;
}

export function setBridgeEnabled(enabled: boolean): void {
  bridgeEnabled = enabled;
}

function oa(): unknown {
  return (globalThis as Record<string, unknown>).openai;
}

function canUseBridge(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.parent || window.parent === window) return false;
  return bridgeEnabled;
}

const HYDRATION_MAX_RETRIES = 3;

let localeWaitRetryCount = 0;
let localeWaitRetryExhausted = false;
let lastPollSignature = "";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeToolOutput(
  raw: unknown,
  options?: { fallbackRaw?: unknown }
): Record<string, unknown> {
  return normalizeToolOutputCore(raw, {
    fallbackRaw: options?.fallbackRaw,
    retryState: {
      retry_count: localeWaitRetryCount,
      retry_exhausted: localeWaitRetryExhausted,
    },
  });
}

export function computeHydrationState(resolved: import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload): import("./locale_bootstrap_runtime.js").HydrationStatus {
  return computeHydrationStateCore(resolved, {
    retry_count: localeWaitRetryCount,
    retry_exhausted: localeWaitRetryExhausted,
  });
}

export function resolveWidgetPayload(
  raw: unknown,
  options?: { fallbackRaw?: unknown }
): import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload {
  return resolveWidgetPayloadCore(raw, {
    fallbackRaw: options?.fallbackRaw,
    retryState: {
      retry_count: localeWaitRetryCount,
      retry_exhausted: localeWaitRetryExhausted,
    },
  });
}

export function computeBootstrapRenderState(params: {
  hydration: import("./locale_bootstrap_runtime.js").HydrationStatus;
  uiGateStatus: string;
  uiStringsStatus: import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload["ui_strings_status"];
  uiFlags: Record<string, unknown>;
  uiView: Record<string, unknown>;
  localeKnownNonEn: boolean;
  hasState?: boolean;
  hasCurrentStep?: boolean;
}): import("./locale_bootstrap_runtime.js").BootstrapRenderState {
  return computeBootstrapRenderStateCore(params);
}

export function applyToolResult(raw: unknown): Record<string, unknown> {
  const previous = getLastToolOutput();
  const normalized = normalizeToolOutput(raw, { fallbackRaw: previous });
  try {
    (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = normalized;
  } catch {}
  return normalized;
}

export function setLastToolOutput(raw: unknown): void {
  try {
    const previous = getLastToolOutput();
    (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = normalizeToolOutput(raw, { fallbackRaw: previous });
  } catch {}
}

function getLastToolOutput(): Record<string, unknown> {
  const cached = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  return cached && typeof cached === "object" ? (cached as Record<string, unknown>) : {};
}

export function hasToolOutput(): boolean {
  const o = oa();
  const oo = o as { toolOutput?: unknown; toolResponseMetadata?: unknown };
  return (
    Boolean(o && (oo.toolOutput || oo.toolResponseMetadata)) ||
    Boolean(getLastToolOutput() && Object.keys(getLastToolOutput()).length)
  );
}

/** Allow render() to use callTool return value, otherwise fall back to host toolOutput / cache. */
export function toolData(overrideRaw?: unknown): Record<string, unknown> {
  const cached = getLastToolOutput();
  if (overrideRaw) return normalizeToolOutput(overrideRaw);
  const o = oa();
  const oo = o as { toolOutput?: unknown; toolResponseMetadata?: unknown };
  if (o && (oo.toolOutput || oo.toolResponseMetadata)) {
    return normalizeToolOutput(
      mergeToolOutputWithResponseMetadata(oo.toolOutput, oo.toolResponseMetadata),
      { fallbackRaw: cached }
    );
  }
  if (cached && Object.keys(cached).length) return cached;
  return {};
}

export function widgetState(): Record<string, unknown> {
  const o = oa() as { widgetState?: unknown } | null | undefined;
  return o?.widgetState && typeof o.widgetState === "object" ? (o.widgetState as Record<string, unknown>) : {};
}

export function setWidgetStateSafe(patch: Record<string, unknown> | null): void {
  const o = oa();
  if (!o || typeof (o as { setWidgetState?: (s: Record<string, unknown>) => void }).setWidgetState !== "function")
    return;
  const ws = widgetState() || {};
  const next = { ...ws, ...(patch || {}) };
  const keys = Object.keys(next);
  let changed = false;
  for (const k of keys) {
    if (String(ws[k] ?? "") !== String(next[k] ?? "")) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  try {
    (o as { setWidgetState: (s: Record<string, unknown>) => void }).setWidgetState(next);
  } catch {}
}

export function languageFromState(resultState: Record<string, unknown> | null | undefined): string {
  const fromResult =
    resultState?.language ? String(resultState.language).toLowerCase().trim() : "";
  return fromResult || "";
}

export function uiLang(resultState: Record<string, unknown> | null | undefined): string {
  return languageFromState(resultState);
}

function localeHintFromLocation(): string {
  if (typeof window === "undefined" || !window.location) return "";
  try {
    const params = new URLSearchParams(String(window.location.search || ""));
    const raw = params.get("locale_hint") || params.get("locale") || params.get("lang") || "";
    return String(raw || "").trim().toLowerCase().replace(/_/g, "-");
  } catch {
    return "";
  }
}

function uiText(
  state: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string
): string {
  const map = state?.ui_strings && typeof state.ui_strings === "object"
    ? (state.ui_strings as Record<string, unknown>)
    : null;
  const fromState = map ? String(map[key] || "").trim() : "";
  if (fromState) return fromState;
  const lang = uiLang(state) || "en";
  const translated = _t ? String(_t(lang, key) || "").trim() : "";
  return translated || fallback;
}

let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
let lastCallAt = 0;
const CLICK_DEBOUNCE_MS = 250;
const RUN_STEP_TIMEOUT_MS = 25000;
const BRIDGE_RESPONSE_TIMEOUT_MS = 6000;
const LOCALE_WAIT_RETRY_MIN_MS = 800;
const LOCALE_WAIT_RETRY_MAX_MS = 2000;
const ACTION_BOOTSTRAP_POLL = "ACTION_BOOTSTRAP_POLL";
let localeWaitRetryTimer: ReturnType<typeof setTimeout> | null = null;
let localeWaitRetryDelayMs = LOCALE_WAIT_RETRY_MIN_MS;

function clearLocaleWaitRetry(opts?: { resetCounters?: boolean }): void {
  if (localeWaitRetryTimer) clearTimeout(localeWaitRetryTimer);
  localeWaitRetryTimer = null;
  localeWaitRetryDelayMs = LOCALE_WAIT_RETRY_MIN_MS;
  if (opts?.resetCounters !== false) {
    localeWaitRetryCount = 0;
    localeWaitRetryExhausted = false;
    lastPollSignature = "";
  }
}

function isUiBootstrapWaitRetryEnabled(result: Record<string, unknown>): boolean {
  const uiPayload =
    result?.ui && typeof result.ui === "object"
      ? (result.ui as Record<string, unknown>)
      : {};
  const uiFlags =
    uiPayload.flags && typeof uiPayload.flags === "object"
      ? (uiPayload.flags as Record<string, unknown>)
      : {};
  if (uiFlags.ui_bootstrap_wait_retry_v1 === false) return false;
  if (uiFlags.ui_bootstrap_wait_retry_v1 === true) return true;
  return true;
}
function buildRetryState(result: Record<string, unknown>): Record<string, unknown> {
  const stateFromResult = toRecord(result.state);
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const latestState = toRecord(latest.state);
  const stateFromWidget = toRecord(widgetState());
  return {
    ...stateFromWidget,
    ...latestState,
    ...stateFromResult,
  };
}

function maybeScheduleBootstrapRetry(
  resolved: ResolvedWidgetPayload,
  source: string,
  opts?: { is_poll_response?: boolean }
): HydrationStatus {
  const hydration = computeHydrationState(resolved);
  const waiting = hydration.waiting_reason !== "none";
  if (!waiting || !isUiBootstrapWaitRetryEnabled(resolved.result)) {
    clearLocaleWaitRetry();
    return computeHydrationState(resolved);
  }
  if (opts?.is_poll_response === true) {
    const state = toRecord(resolved.result.state);
    const gateStatus = toLower(state.ui_gate_status || resolved.result.ui_gate_status);
    const signature = `${gateStatus}|${resolved.ui_strings_status}`;
    if (signature === lastPollSignature) {
      localeWaitRetryExhausted = true;
      clearLocaleWaitRetry({ resetCounters: false });
      if (isDevEnv()) {
        console.log("[hydration_same_response_circuit_breaker]", {
          source,
          signature,
          retry_count: localeWaitRetryCount,
          waiting_reason: hydration.waiting_reason,
        });
      }
      return computeHydrationState(resolved);
    }
    lastPollSignature = signature;
  }
  if (hydration.retry_exhausted || localeWaitRetryExhausted || localeWaitRetryCount >= HYDRATION_MAX_RETRIES) {
    localeWaitRetryExhausted = true;
    if (isDevEnv()) {
      console.log("[hydration_failed_max_retries]", {
        source,
        retry_count: localeWaitRetryCount,
        waiting_reason: hydration.waiting_reason,
      });
    }
    return computeHydrationState(resolved);
  }
  if (!localeWaitRetryTimer) {
    const retryState = buildRetryState(resolved.result);
    const delay = localeWaitRetryDelayMs;
    localeWaitRetryTimer = setTimeout(() => {
      localeWaitRetryTimer = null;
      localeWaitRetryCount += 1;
      void callRunStep(ACTION_BOOTSTRAP_POLL, {
        ...retryState,
        __bootstrap_poll: "true",
        __hydrate_poll: "true",
      });
    }, delay);
    localeWaitRetryDelayMs = Math.min(
      LOCALE_WAIT_RETRY_MAX_MS,
      Math.round(localeWaitRetryDelayMs * 1.8)
    );
    if (isDevEnv()) {
      console.log("[ui_bootstrap_retry_scheduled]", {
        source,
        delay_ms: delay,
        next_delay_ms: localeWaitRetryDelayMs,
        waiting_reason: hydration.waiting_reason,
        retry_count: localeWaitRetryCount,
      });
    }
  }
  return computeHydrationState(resolved);
}

export function resetHydrationRetryCycle(opts?: { trigger_poll?: boolean; source?: string }): void {
  clearLocaleWaitRetry();
  if (opts?.trigger_poll !== true) return;
  const source = String(opts?.source || "manual");
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const latestState = toRecord(latest.state);
  if (isDevEnv()) {
    console.log("[recovery_retry_clicked]", {
      source,
      has_state: Object.keys(latestState).length > 0,
    });
  }
  void callRunStep(ACTION_BOOTSTRAP_POLL, {
    ...latestState,
    __bootstrap_poll: "true",
    __hydrate_poll: "true",
    __manual_retry: "true",
  });
}

export function ensureBootstrapRetryForResult(
  rawOrResult: Record<string, unknown> | null | undefined,
  opts?: { source?: string }
): boolean {
  const source = String(opts?.source || "render");
  const resolved = resolveWidgetPayload(rawOrResult || {});
  const hydration = maybeScheduleBootstrapRetry(resolved, source, { is_poll_response: false });
  return hydration.waiting_reason !== "none";
}

export function handleToolResultAndMaybeScheduleBootstrapRetry(
  raw: unknown,
  opts?: {
    source?: "call_run_step" | "host_notification" | "set_globals" | "unknown";
    is_poll_response?: boolean;
  }
): Record<string, unknown> {
  const normalized = applyToolResult(raw);
  if (_render) _render(normalized);
  const resolved = resolveWidgetPayload(normalized);
  const result = resolved.result;
  const source = String(opts?.source || "unknown");
  const hydration = maybeScheduleBootstrapRetry(resolved, source, {
    is_poll_response: opts?.is_poll_response === true,
  });
  if (isDevEnv()) {
    console.log("[ui_bootstrap_state]", {
      source,
      payload_source: resolved.source,
      has_state: resolved.has_state,
      waiting_hydration: hydration.waiting_reason !== "none",
      waiting_reason: hydration.waiting_reason,
      needs_hydration: hydration.needs_hydration,
      retry_count: hydration.retry_count,
      retry_exhausted: hydration.retry_exhausted,
      resolved_language: resolved.resolved_language,
      resolved_language_source: resolved.resolved_language_source,
      ui_strings_status: resolved.ui_strings_status,
      bootstrap_phase: resolved.bootstrap_phase,
      gate_status: String(((result?.state as Record<string, unknown>) || {}).ui_gate_status || ""),
    });
  }
  return result;
}

export function handleBridgeResponse(msg: any): boolean {
  if (!msg || typeof msg !== "object") return false;
  if (msg.jsonrpc !== "2.0" || !msg.id) return false;
  const id = String(msg.id);
  const pending = pendingBridgeCalls.get(id);
  if (!pending) return false;
  pendingBridgeCalls.delete(id);
  if (msg.error) pending.reject(msg.error);
  else pending.resolve(msg.result);
  return true;
}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type SanitizeResult =
  | { kind: "keep"; value: JSONValue }
  | { kind: "drop" };

type SanitizeContext = {
  seen: WeakMap<object, JSONValue>;
  inProgress: WeakSet<object>;
  removedPaths: string[];
  maxRemovedPaths: number;
};

const DROP_KEYS = new Set(["signal", "abortSignal", "controller", "abortController"]);
const DEV_LOG_HOSTNAME = "localhost";

function isDevEnv(): boolean {
  if (typeof location !== "undefined" && location.hostname === DEV_LOG_HOSTNAME) return true;
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

function recordRemovedPath(ctx: SanitizeContext, path: string): void {
  if (ctx.removedPaths.length >= ctx.maxRemovedPaths) return;
  ctx.removedPaths.push(path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeValue(value: unknown, path: string, ctx: SanitizeContext): SanitizeResult {
  if (value === null) return { kind: "keep", value: null };

  const t = typeof value;
  if (t === "string" || t === "boolean") return { kind: "keep", value: value as string | boolean };
  if (t === "number") {
    const num = value as number;
    return { kind: "keep", value: Number.isFinite(num) ? num : null };
  }
  if (t === "bigint") return { kind: "keep", value: String(value) };
  if (t === "undefined" || t === "function" || t === "symbol") {
    recordRemovedPath(ctx, path);
    return { kind: "drop" };
  }

  if (typeof value === "object") {
    const obj = value as object;
    if (ctx.seen.has(obj)) {
      return { kind: "keep", value: ctx.seen.get(obj) as JSONValue };
    }
    if (ctx.inProgress.has(obj)) {
      recordRemovedPath(ctx, path);
      return { kind: "drop" };
    }
    ctx.inProgress.add(obj);

    const tag = Object.prototype.toString.call(obj);
    if (tag === "[object Error]") {
      const err = obj as Error;
      const out: { name: string; message: string; stack?: string } = {
        name: String(err.name || "Error"),
        message: String(err.message || ""),
      };
      if (err.stack) out.stack = String(err.stack);
      ctx.inProgress.delete(obj);
      ctx.seen.set(obj, out);
      return { kind: "keep", value: out };
    }
    if (tag === "[object Date]") {
      const date = obj as Date;
      try {
        const iso = date.toISOString();
        ctx.inProgress.delete(obj);
        ctx.seen.set(obj, iso);
        return { kind: "keep", value: iso };
      } catch {
        const str = String(date);
        ctx.inProgress.delete(obj);
        ctx.seen.set(obj, str);
        return { kind: "keep", value: str };
      }
    }
    if (tag === "[object RegExp]") {
      const str = String(obj);
      ctx.inProgress.delete(obj);
      ctx.seen.set(obj, str);
      return { kind: "keep", value: str };
    }

    if (Array.isArray(obj)) {
      const out: JSONValue[] = [];
      for (let i = 0; i < obj.length; i += 1) {
        const res = sanitizeValue(obj[i], `${path}[${i}]`, ctx);
        if (res.kind === "keep") out.push(res.value);
      }
      ctx.inProgress.delete(obj);
      ctx.seen.set(obj, out);
      return { kind: "keep", value: out };
    }

    if (!isPlainObject(obj)) {
      ctx.inProgress.delete(obj);
      recordRemovedPath(ctx, path);
      return { kind: "drop" };
    }

    const out: { [key: string]: JSONValue } = {};
    for (const [key, val] of Object.entries(obj)) {
      const nextPath = `${path}.${key}`;
      if (DROP_KEYS.has(key)) {
        recordRemovedPath(ctx, nextPath);
        continue;
      }
      const res = sanitizeValue(val, nextPath, ctx);
      if (res.kind === "keep") out[key] = res.value;
    }
    ctx.inProgress.delete(obj);
    ctx.seen.set(obj, out);
    return { kind: "keep", value: out };
  }

  recordRemovedPath(ctx, path);
  return { kind: "drop" };
}

function sanitizeForPostMessage(
  value: unknown,
  opts?: { basePath?: string; maxRemovedPaths?: number }
): { clean: JSONValue | null; removedPaths: string[] } {
  const ctx: SanitizeContext = {
    seen: new WeakMap(),
    inProgress: new WeakSet(),
    removedPaths: [],
    maxRemovedPaths: opts?.maxRemovedPaths ?? 20,
  };
  const basePath = opts?.basePath ?? "value";
  const res = sanitizeValue(value, basePath, ctx);
  return { clean: res.kind === "keep" ? res.value : null, removedPaths: ctx.removedPaths };
}

function safePostMessage(message: unknown, removedPaths?: string[]): void {
  const isDev = isDevEnv();
  if (isDev && removedPaths && removedPaths.length > 0) {
    const shown = removedPaths.slice(0, 20).join(", ");
    const suffix = removedPaths.length > 20 ? " ..." : "";
    console.warn(`[postMessage] sanitized ${removedPaths.length} path(s): ${shown}${suffix}`);
  }
  if (isDev && typeof structuredClone === "function") {
    try {
      structuredClone(message);
    } catch (err) {
      const lastPath = removedPaths && removedPaths.length ? removedPaths[removedPaths.length - 1] : "";
      const name = (err as { name?: string }).name || "CloneError";
      const msg = (err as Error)?.message || String(err);
      console.warn(`[postMessage] structuredClone failed: ${name}${lastPath ? ` @ ${lastPath}` : ""} ${msg}`);
    }
  }
  window.parent.postMessage(message, "*");
}

async function callToolViaBridge(name: string, args: unknown): Promise<unknown> {
  if (!canUseBridge() || typeof window === "undefined") {
    throw new Error("bridge unavailable");
  }
  const id = `bsc_${Date.now()}_${++bridgeSeq}`;
  const { clean: argsClean, removedPaths } = sanitizeForPostMessage(args, {
    basePath: "params.arguments",
  });
  const safeArgs = (argsClean ?? {}) as JSONValue;
  const message = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: safeArgs },
  };
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingBridgeCalls.delete(id);
      reject(new Error("bridge timeout"));
    }, BRIDGE_RESPONSE_TIMEOUT_MS);
    pendingBridgeCalls.set(id, {
      resolve: (value: unknown) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      reject: (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });
    try {
      safePostMessage(message, removedPaths);
    } catch (e) {
      clearTimeout(timeoutId);
      pendingBridgeCalls.delete(id);
      reject(e);
    }
  });
}

export function isRateLimited(): boolean {
  const until = getRateLimitUntil();
  return until > 0 && Date.now() < until;
}

export function setInlineNotice(message: string | null | undefined): void {
  const el = document.getElementById("inlineNotice");
  if (!el) return;
  el.textContent = String(message || "");
  el.style.display = message ? "block" : "none";
}

export function clearInlineNotice(): void {
  const el = document.getElementById("inlineNotice");
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

export function lockRateLimit(ms: number): void {
  let delay = Number(ms);
  if (isNaN(delay) || delay <= 0) delay = 1500;
  setRateLimitUntil(Date.now() + delay);
  if (rateLimitTimer) clearTimeout(rateLimitTimer);
  setLoading(true);
  rateLimitTimer = setTimeout(() => {
    setRateLimitUntil(0);
    setLoading(false);
    clearInlineNotice();
  }, delay);
}

export function setSendEnabled(enabled: boolean): void {
  const el = document.getElementById("send") as HTMLButtonElement | null;
  if (el) el.disabled = getIsLoading() || !enabled;
}

export function setLoading(next: boolean): void {
  const loading = isRateLimited() ? true : Boolean(next);
  setIsLoading(loading);

  const stepper = document.getElementById("stepper");
  if (stepper) {
    stepper.classList.toggle("loading-stepper", loading);
  }

  const inputEl = document.getElementById("input");
  const sendEl = document.getElementById("send");
  const btnStart = document.getElementById("btnStart") as HTMLButtonElement | null;
  const btnGoToNextStep = document.getElementById("btnGoToNextStep") as HTMLButtonElement | null;
  const btnStartDreamExercise = document.getElementById("btnStartDreamExercise") as HTMLButtonElement | null;
  const btnSwitchToSelfDream = document.getElementById("btnSwitchToSelfDream") as HTMLButtonElement | null;
  const wordingChoicePickUser = document.getElementById("wordingChoicePickUser") as HTMLButtonElement | null;
  const wordingChoicePickSuggestion = document.getElementById("wordingChoicePickSuggestion") as HTMLButtonElement | null;

  if (inputEl) (inputEl as HTMLInputElement).disabled = loading;
  if (sendEl) (sendEl as HTMLButtonElement).disabled = loading;
  if (btnStart) btnStart.disabled = loading;
  if (btnGoToNextStep) btnGoToNextStep.disabled = loading;
  if (btnStartDreamExercise) btnStartDreamExercise.disabled = loading;
  if (btnSwitchToSelfDream) btnSwitchToSelfDream.disabled = loading;
  if (wordingChoicePickUser) wordingChoicePickUser.disabled = loading;
  if (wordingChoicePickSuggestion) wordingChoicePickSuggestion.disabled = loading;

  document.querySelectorAll("#choiceWrap button").forEach((b) => {
    (b as HTMLButtonElement).disabled = loading;
  });

  const v = (inputEl && (inputEl as HTMLInputElement).value
    ? (inputEl as HTMLInputElement).value
    : ""
  ).trim();
  if (sendEl) (sendEl as HTMLButtonElement).disabled = loading || v.length === 0;
}

export async function callRunStep(
  message: string | number,
  extraState?: Record<string, unknown>
): Promise<void> {
  const o = oa();
  const hasCallTool = Boolean(o && typeof (o as { callTool?: (name: string, args: unknown) => Promise<unknown> }).callTool === "function");
  const hasBridge = canUseBridge();
  if (!hasCallTool && !hasBridge) {
    console.warn("run_step: host did not provide callTool or MCP bridge");
    const errEl = document.getElementById("cardDesc");
    const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__;
    const state = latest?.state || {};
    if (errEl && _t) errEl.textContent = _t(uiLang(state), "errorMessage");
    return;
  }

  if (isRateLimited()) return;
  const now = Date.now();
  if (now - lastCallAt < CLICK_DEBOUNCE_MS) return;
  lastCallAt = now;

  const hasToolOutput =
    Boolean((o as { toolOutput?: unknown }).toolOutput) ||
    Boolean(getLastToolOutput() && Object.keys(getLastToolOutput()).length);
  const persistedStarted = String((widgetState().started || "")).toLowerCase() === "true";
  const messageText = String(message || "").trim();
  const isBootstrapPollCall =
    messageText === ACTION_BOOTSTRAP_POLL ||
    String((extraState as any)?.__bootstrap_poll || "").trim().toLowerCase() === "true";
  if (String(message || "").trim() === "") {
    if (hasToolOutput && !isBootstrapPollCall) return;
    if (!persistedStarted && !isBootstrapPollCall) return;
  }
  if (!isBootstrapPollCall) {
    clearLocaleWaitRetry();
  }

  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const state = latest.state || { current_step: "step_0" };

  const stateLanguage = uiLang(state);
  const ws = widgetState();
  const widgetLanguage = String((ws.language || ws.locale_hint || "") as string).trim().toLowerCase();
  const locationLanguage = localeHintFromLocation();
  const localeHint = stateLanguage || widgetLanguage || locationLanguage;
  let nextState = Object.assign({}, state);
  if (extraState && typeof extraState === "object") {
    nextState = Object.assign({}, nextState, extraState);
  }
  if (!String((nextState as Record<string, unknown>).language || "").trim() && localeHint) {
    (nextState as Record<string, unknown>).language = localeHint;
  }

  const isActionMessage = messageText.startsWith("ACTION_");
  const shouldSetStarted =
    messageText === "ACTION_START" ||
    (Boolean(messageText) &&
      !isBootstrapPollCall &&
      !isActionMessage &&
      !messageText.startsWith("__ROUTE__") &&
      !messageText.startsWith("choice:"));
  const widgetPatch: Record<string, unknown> = {};
  if (shouldSetStarted) widgetPatch.started = "true";
  if (stateLanguage) widgetPatch.language = stateLanguage;
  if (Object.keys(widgetPatch).length > 0) {
    setWidgetStateSafe(widgetPatch);
  }

  const payload = {
    current_step_id: nextState.current_step || "step_0",
    user_message: String(message || ""),
    input_mode: "widget",
    locale_hint: localeHint,
    locale_hint_source: localeHint ? "webplus_i18n" : "none",
    state: nextState,
  };

  const requestId = String((nextState as any).__request_id || "");
  const clientActionId = String((nextState as any).__client_action_id || "");
  const startedAt = Date.now();
  const debugCalls = isDevEnv();
    if (debugCalls) {
      console.log("[ui_run_step_request]", {
        request_id: requestId,
        client_action_id: clientActionId,
        current_step: String(nextState.current_step || ""),
        user_message: messageText,
      });
    }

  setLoading(true);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let didTimeout = false;
  const timeoutMs = RUN_STEP_TIMEOUT_MS;
  timeoutId = setTimeout(() => {
    didTimeout = true;
    if (debugCalls) {
      console.log("[ui_run_step_timeout]", {
        request_id: requestId,
        client_action_id: clientActionId,
        current_step: String(nextState.current_step || ""),
        elapsed_ms: Date.now() - startedAt,
        timeout_ms: timeoutMs,
      });
    }
    setInlineNotice(uiText(nextState, "transient.timeout", "This is taking longer than usual. Please try again."));
    setLoading(false);
  }, timeoutMs);

  try {
    const transportPrimary = hasCallTool ? "callTool" : "bridge";
    if (isDevEnv()) {
      console.log("[ui_action_dispatched]", {
        action_code: messageText,
        transport_used: transportPrimary,
      });
    }
    let resp: unknown;
    let transportUsed: "callTool" | "bridge" | "bridge_fallback_callTool" = transportPrimary;
    try {
      resp = transportPrimary === "callTool"
        ? await (o as { callTool: (name: string, args: unknown) => Promise<unknown> }).callTool("run_step", payload)
        : await callToolViaBridge("run_step", payload);
    } catch (primaryError) {
      if (transportPrimary === "bridge" && hasCallTool) {
        transportUsed = "bridge_fallback_callTool";
        resp = await (o as { callTool: (name: string, args: unknown) => Promise<unknown> }).callTool("run_step", payload);
      } else {
        throw primaryError;
      }
    }
    if (didTimeout) return;
    if (debugCalls) {
      console.log("[ui_run_step_response]", {
        request_id: requestId,
        client_action_id: clientActionId,
        current_step: String(nextState.current_step || ""),
        transport_used: transportUsed,
        elapsed_ms: Date.now() - startedAt,
      });
    }
    const normalizedRaw = normalizeToolOutput(resp);
    const result = resolveWidgetPayload(normalizedRaw).result;
    const errorObj = result?.error as
      | { type?: string; user_message?: string; retry_after_ms?: number; retry_action?: string }
      | null;
    const transientRetryError =
      result?.ok === false &&
      errorObj &&
      (errorObj.type === "timeout" || errorObj.type === "rate_limited") &&
      (errorObj.retry_action === "retry_same_action" || errorObj.type === "rate_limited");
    if (transientRetryError) {
      clearLocaleWaitRetry();
      if (errorObj.type === "rate_limited") {
        setInlineNotice(
          errorObj.user_message ||
            uiText(nextState, "transient.rate_limited", "Please wait a moment and try again.")
        );
        lockRateLimit(errorObj.retry_after_ms ?? 1500);
      } else {
        setInlineNotice(
          errorObj.user_message ||
            uiText(nextState, "transient.timeout", "This is taking longer than usual. Please try again.")
        );
      }
      return;
    }

    handleToolResultAndMaybeScheduleBootstrapRetry(resp, {
      source: "call_run_step",
      is_poll_response: isBootstrapPollCall,
    });
  } catch (e) {
    clearLocaleWaitRetry();
    if (didTimeout) return;
    const msg = (e && (e as Error).message) ? String((e as Error).message) : "";
    const isTimeout =
      msg.toLowerCase().includes("timeout") ||
      (e && (e as Error).name === "AbortError") ||
      (e && (e as { type?: string }).type === "timeout");
    if (isTimeout || didTimeout) {
      if (debugCalls) {
        console.log("[ui_run_step_timeout_error]", {
          request_id: requestId,
          client_action_id: clientActionId,
          current_step: String(nextState.current_step || ""),
          elapsed_ms: Date.now() - startedAt,
        });
      }
      setInlineNotice(uiText(nextState, "transient.timeout", "This is taking longer than usual. Please try again."));
      return;
    }
    console.error("run_step failed", e);
    const errState =
      ((globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {}).state || {};
    const errMsg =
      (e && (e as Error).message) ? String((e as Error).message) : _t(uiLang(errState), "errorMessage");
    const errEl = document.getElementById("cardDesc");
    if (errEl) errEl.textContent = errMsg;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (!didTimeout) setLoading(false);
  }
}
