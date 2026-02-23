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

type PayloadSource =
  | "meta.widget_result"
  | "toolResponseMetadata.widget_result"
  | "toolResponseMetadata._meta.widget_result"
  | "structured.result"
  | "structured.ui.result"
  | "structured.ui"
  | "raw.result"
  | "raw.ui.result"
  | "raw.ui"
  | "raw"
  | "none";

export type WaitingReason = "missing_state" | "i18n_pending" | "both" | "none";

export type ResolvedWidgetPayload = {
  result: Record<string, unknown>;
  source: PayloadSource;
  has_state: boolean;
  resolved_language: string;
  resolved_language_source: "state.language" | "state.ui_strings_lang" | "result.ui_strings_lang" | "result.language" | "locale_hint" | "none";
  ui_strings_status: "ready" | "pending" | "error" | "unknown";
  shape_version: string;
  needs_hydration: boolean;
  waiting_reason: WaitingReason;
};

export type HydrationStatus = {
  needs_hydration: boolean;
  retry_count: number;
  retry_exhausted: boolean;
  waiting_reason: WaitingReason;
};

type PayloadCandidate = {
  source: PayloadSource;
  value: Record<string, unknown>;
  richness: number;
  freshness: number | null;
  order: number;
};

const WIDGET_RESULT_KEYS = new Set([
  "state",
  "ui",
  "prompt",
  "text",
  "specialist",
  "current_step_id",
  "model_result_shape_version",
  "ui_strings",
  "ui_strings_lang",
  "language",
]);

const HYDRATION_MAX_RETRIES = 8;

let localeWaitRetryCount = 0;
let localeWaitRetryExhausted = false;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function isWidgetResultLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return false;
  if (typeof (rec as { html?: unknown }).html === "string" && keys.length <= 2) return false;
  const state = rec.state;
  if (state !== undefined && (typeof state !== "object" || state === null || Array.isArray(state))) {
    return false;
  }
  for (const key of keys) {
    if (WIDGET_RESULT_KEYS.has(key)) return true;
  }
  return false;
}

function parseFreshness(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function freshnessForResult(result: Record<string, unknown>): number | null {
  const direct = parseFreshness(result.updated_at_ms ?? result.result_version ?? result.turn_index);
  if (direct !== null) return direct;
  const state = toRecord(result.state);
  return parseFreshness(state.updated_at_ms ?? state.result_version ?? state.turn_index);
}

function computePayloadRichness(result: Record<string, unknown>): number {
  const state = toRecord(result.state);
  const ui = toRecord(result.ui);
  let score = 0;
  if (Object.keys(state).length) score += 40;
  if (String(state.current_step || "").trim()) score += 40;
  if (Object.keys(ui).length) score += 30;
  if (String(result.prompt || "").trim()) score += 20;
  if (String(result.text || "").trim()) score += 20;
  if (toRecord(result.specialist) && Object.keys(toRecord(result.specialist)).length) score += 15;
  if (String(result.current_step_id || "").trim()) score += 10;
  if (String(result.model_result_shape_version || "").trim()) score += 5;
  return score;
}

function candidateValue(root: Record<string, unknown>, path: string): unknown {
  const segs = path.split(".");
  let cur: unknown = root;
  for (const seg of segs) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function mergeToolOutputWithResponseMetadata(
  toolOutputRaw: unknown,
  toolResponseMetadataRaw: unknown
): Record<string, unknown> {
  const toolOutput = toRecord(toolOutputRaw);
  const metadata = toRecord(toolResponseMetadataRaw);
  const merged: Record<string, unknown> = Object.keys(toolOutput).length ? { ...toolOutput } : {};
  if (!Object.keys(metadata).length) return merged;

  const mergedMeta = toRecord(merged._meta);
  const metadataMeta = toRecord(metadata._meta);
  const mergedMetaNext: Record<string, unknown> = { ...mergedMeta, ...metadataMeta };
  if (metadata.widget_result !== undefined) {
    mergedMetaNext.widget_result = metadata.widget_result;
  } else if (metadataMeta.widget_result !== undefined && mergedMetaNext.widget_result === undefined) {
    mergedMetaNext.widget_result = metadataMeta.widget_result;
  }
  merged._meta = mergedMetaNext;
  merged.toolResponseMetadata = metadata;
  return merged;
}

function collectPayloadCandidates(raw: unknown): PayloadCandidate[] {
  const root = toRecord(raw);
  const structured = toRecord(root.structuredContent);
  const meta = toRecord(root._meta);
  const toolResponseMetadata = toRecord(root.toolResponseMetadata);
  const toolResponseMetadataMeta = toRecord(toolResponseMetadata._meta);
  const candidates: PayloadCandidate[] = [];
  const add = (source: PayloadSource, value: unknown, order: number): void => {
    if (!isWidgetResultLike(value)) return;
    const rec = value as Record<string, unknown>;
    candidates.push({
      source,
      value: rec,
      richness: computePayloadRichness(rec),
      freshness: freshnessForResult(rec),
      order,
    });
  };
  add("meta.widget_result", meta.widget_result, 0);
  add("toolResponseMetadata.widget_result", toolResponseMetadata.widget_result, 1);
  add("toolResponseMetadata._meta.widget_result", toolResponseMetadataMeta.widget_result, 2);
  add("structured.result", structured.result, 3);
  add("structured.ui.result", candidateValue(structured, "ui.result"), 4);
  add("structured.ui", structured.ui, 5);
  add("raw.result", root.result, 6);
  add("raw.ui.result", candidateValue(root, "ui.result"), 7);
  add("raw.ui", root.ui, 8);
  add("raw", root, 9);
  return candidates;
}

function pickBestCandidate(candidates: PayloadCandidate[]): PayloadCandidate | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const cur = candidates[i];
    const bestHasFreshness = best.freshness !== null;
    const curHasFreshness = cur.freshness !== null;
    if (bestHasFreshness && curHasFreshness && cur.freshness !== best.freshness) {
      if ((cur.freshness as number) > (best.freshness as number)) best = cur;
      continue;
    }
    if (cur.richness !== best.richness) {
      if (cur.richness > best.richness) best = cur;
      continue;
    }
    if (cur.order < best.order) best = cur;
  }
  return best;
}

function resolveLanguageForPayload(result: Record<string, unknown>): {
  language: string;
  source: ResolvedWidgetPayload["resolved_language_source"];
} {
  const state = toRecord(result.state);
  const fromStateLanguage = toLower(state.language);
  if (fromStateLanguage) return { language: fromStateLanguage, source: "state.language" };
  const fromStateUiLang = toLower(state.ui_strings_lang);
  if (fromStateUiLang) return { language: fromStateUiLang, source: "state.ui_strings_lang" };
  const fromResultUiLang = toLower(result.ui_strings_lang);
  if (fromResultUiLang) return { language: fromResultUiLang, source: "result.ui_strings_lang" };
  const fromResultLanguage = toLower(result.language);
  if (fromResultLanguage) return { language: fromResultLanguage, source: "result.language" };
  const fromLocaleHint = toLower(result.locale_hint);
  if (fromLocaleHint) return { language: fromLocaleHint, source: "locale_hint" };
  return { language: "", source: "none" };
}

function normalizeUiStringsStatus(result: Record<string, unknown>): ResolvedWidgetPayload["ui_strings_status"] {
  const state = toRecord(result.state);
  const raw = toLower(state.ui_strings_status || result.ui_strings_status);
  if (raw === "ready" || raw === "pending" || raw === "error") return raw;
  return "unknown";
}

export function computeHydrationState(resolved: ResolvedWidgetPayload): HydrationStatus {
  const state = toRecord(resolved.result.state);
  const hasState = Object.keys(state).length > 0;
  const currentStep = hasState ? String(state.current_step || "").trim() : "";
  const needsHydration =
    !hasState ||
    !currentStep ||
    (resolved.shape_version === "v2_minimal" && !hasState);
  const i18nPending = resolved.ui_strings_status === "pending";
  let waitingReason: WaitingReason = "none";
  if (needsHydration && i18nPending) waitingReason = "both";
  else if (needsHydration) waitingReason = "missing_state";
  else if (i18nPending) waitingReason = "i18n_pending";
  return {
    needs_hydration: needsHydration,
    retry_count: localeWaitRetryCount,
    retry_exhausted: localeWaitRetryExhausted,
    waiting_reason: waitingReason,
  };
}

export function resolveWidgetPayload(raw: unknown): ResolvedWidgetPayload {
  const best = pickBestCandidate(collectPayloadCandidates(raw));
  const result = best ? best.value : {};
  const state = toRecord(result.state);
  const hasState = Object.keys(state).length > 0;
  const { language, source } = resolveLanguageForPayload(result);
  const shapeVersion = String(result.model_result_shape_version || "").trim();
  const temp: ResolvedWidgetPayload = {
    result,
    source: best ? best.source : "none",
    has_state: hasState,
    resolved_language: language,
    resolved_language_source: source,
    ui_strings_status: normalizeUiStringsStatus(result),
    shape_version: shapeVersion,
    needs_hydration: false,
    waiting_reason: "none",
  };
  const hydration = computeHydrationState(temp);
  temp.needs_hydration = hydration.needs_hydration;
  temp.waiting_reason = hydration.waiting_reason;
  return temp;
}

function normalizeToolOutput(raw: unknown): Record<string, unknown> {
  const root = toRecord(raw);
  const structured = toRecord(root.structuredContent);
  const resolved = resolveWidgetPayload(raw);
  if (Object.keys(resolved.result).length) {
    structured.result = resolved.result;
    const uiFromResult = toRecord(resolved.result.ui);
    if (Object.keys(uiFromResult).length && Object.keys(toRecord(structured.ui)).length === 0) {
      structured.ui = uiFromResult;
    }
  }
  if (Object.keys(structured).length) return structured;
  if (Object.keys(resolved.result).length) return { result: resolved.result };
  return {};
}

export function applyToolResult(raw: unknown): Record<string, unknown> {
  const normalized = normalizeToolOutput(raw);
  setLastToolOutput(normalized);
  return normalized;
}

export function setLastToolOutput(raw: unknown): void {
  try {
    (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = normalizeToolOutput(raw);
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
  if (overrideRaw) return normalizeToolOutput(overrideRaw);
  const o = oa();
  const oo = o as { toolOutput?: unknown; toolResponseMetadata?: unknown };
  if (o && (oo.toolOutput || oo.toolResponseMetadata)) {
    return normalizeToolOutput(
      mergeToolOutputWithResponseMetadata(oo.toolOutput, oo.toolResponseMetadata)
    );
  }
  const cached = getLastToolOutput();
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
const LOCALE_WAIT_RETRY_MAX_MS = 5000;
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
    started: "true",
  };
}

function maybeScheduleBootstrapRetry(resolved: ResolvedWidgetPayload, source: string): HydrationStatus {
  const hydration = computeHydrationState(resolved);
  const waiting = hydration.waiting_reason !== "none";
  if (!waiting || !isUiBootstrapWaitRetryEnabled(resolved.result)) {
    clearLocaleWaitRetry();
    return computeHydrationState(resolved);
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
  const hydration = maybeScheduleBootstrapRetry(resolved, source);
  return hydration.waiting_reason !== "none";
}

export function handleToolResultAndMaybeScheduleBootstrapRetry(
  raw: unknown,
  opts?: { source?: "call_run_step" | "host_notification" | "set_globals" | "unknown" }
): Record<string, unknown> {
  const normalized = applyToolResult(raw);
  if (_render) _render(normalized);
  const resolved = resolveWidgetPayload(normalized);
  const result = resolved.result;
  const source = String(opts?.source || "unknown");
  const hydration = maybeScheduleBootstrapRetry(resolved, source);
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
  let nextState = Object.assign({}, state);
  if (extraState && typeof extraState === "object") {
    nextState = Object.assign({}, nextState, extraState);
  }

  const widgetPatch: Record<string, unknown> = { started: "true" };
  if (stateLanguage) widgetPatch.language = stateLanguage;
  setWidgetStateSafe(widgetPatch);

  const payload = {
    current_step_id: nextState.current_step || "step_0",
    user_message: String(message || ""),
    input_mode: "widget",
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

    handleToolResultAndMaybeScheduleBootstrapRetry(resp, { source: "call_run_step" });
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
