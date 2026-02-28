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
  canonicalizeWidgetPayload,
  computeBootstrapRenderState as computeBootstrapRenderStateCore,
  computeHydrationState as computeHydrationStateCore,
  extractBootstrapOrdering as extractBootstrapOrderingCore,
  mergeToolOutputWithResponseMetadata,
  resolveWidgetPayload as resolveWidgetPayloadCore,
} from "./locale_bootstrap_runtime.js";
export type {
  BootstrapOrdering,
  BootstrapRenderState,
  HydrationStatus,
  PayloadReasonCode,
  PayloadSource,
  ResolvedWidgetPayload,
  WaitingReason,
} from "./locale_bootstrap_runtime.js";
import type { HydrationStatus, ResolvedWidgetPayload } from "./locale_bootstrap_runtime.js";
import type { PayloadReasonCode, PayloadSource } from "./locale_bootstrap_runtime.js";
export { mergeToolOutputWithResponseMetadata };

// Injected by main during init
let _render: (overrideRaw?: unknown) => void;
let _t: (lang: string, key: string) => string;

let bridgeEnabled = false;
let bridgeSeq = 0;
const pendingBridgeCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let bridgeTargetOriginCache: string | null = null;
let bridgeTargetOriginSource = "";
type TransportStatus = "unknown" | "ready_callTool" | "ready_bridge" | "unavailable";

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

function hasBridgeParent(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.parent && window.parent !== window);
}

function normalizeOrigin(raw: unknown): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const origin = String(parsed.origin || "").trim();
    if (!origin || origin === "null") return "";
    return origin;
  } catch {
    return "";
  }
}

function originFromMetaValue(raw: unknown): string {
  if (typeof raw === "string") return normalizeOrigin(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const fromOrigin = normalizeOrigin(rec.origin);
    if (fromOrigin) return fromOrigin;
    const fromHref = normalizeOrigin(rec.href);
    if (fromHref) return fromHref;
    const fromUrl = normalizeOrigin(rec.url);
    if (fromUrl) return fromUrl;
  }
  return "";
}

function resolveAllowedHostOriginUncached(): { origin: string; source: string } {
  const rawGlobal = (globalThis as Record<string, unknown>).__BSC_HOST_ORIGIN;
  const fromGlobal = originFromMetaValue(rawGlobal);
  if (fromGlobal) return { origin: fromGlobal, source: "__BSC_HOST_ORIGIN" };

  const host = oa() as { hostOrigin?: unknown; parentOrigin?: unknown } | null | undefined;
  const fromOpenAiHost = originFromMetaValue(host?.hostOrigin);
  if (fromOpenAiHost) return { origin: fromOpenAiHost, source: "openai.hostOrigin" };
  const fromOpenAiParent = originFromMetaValue(host?.parentOrigin);
  if (fromOpenAiParent) return { origin: fromOpenAiParent, source: "openai.parentOrigin" };

  if (typeof document !== "undefined") {
    const fromReferrer = normalizeOrigin(document.referrer);
    if (fromReferrer) return { origin: fromReferrer, source: "document.referrer" };
  }
  if (typeof window !== "undefined") {
    const ancestorOrigins = (window.location as Location & { ancestorOrigins?: { length: number; [index: number]: string } }).ancestorOrigins;
    if (ancestorOrigins && ancestorOrigins.length > 0) {
      const fromAncestor = normalizeOrigin(ancestorOrigins[0]);
      if (fromAncestor) return { origin: fromAncestor, source: "window.location.ancestorOrigins[0]" };
    }
  }
  return { origin: "", source: "none" };
}

export function resolveAllowedHostOrigin(): string {
  if (bridgeTargetOriginCache !== null) return bridgeTargetOriginCache;
  const resolved = resolveAllowedHostOriginUncached();
  if (resolved.origin) {
    bridgeTargetOriginCache = resolved.origin;
    bridgeTargetOriginSource = resolved.source;
    console.log("[bridge_target_origin_resolved]", {
      target_origin: bridgeTargetOriginCache,
      source: bridgeTargetOriginSource,
      fallback_used: false,
    });
    return bridgeTargetOriginCache;
  }
  const fallbackEnabled = uiFlagEnabled("UI_BRIDGE_ORIGIN_FALLBACK_V1", false);
  bridgeTargetOriginCache = fallbackEnabled ? "*" : "";
  bridgeTargetOriginSource = fallbackEnabled ? "fallback_wildcard" : "unresolved";
  console.log("[bridge_target_origin_resolved]", {
    target_origin: bridgeTargetOriginCache,
    source: bridgeTargetOriginSource,
    fallback_used: fallbackEnabled,
  });
  return bridgeTargetOriginCache;
}

export function resetBridgeOriginCacheForTests(): void {
  bridgeTargetOriginCache = null;
  bridgeTargetOriginSource = "";
}

export function isTrustedBridgeMessageEvent(event: MessageEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!hasBridgeParent()) return false;
  if (event.source !== window.parent) {
    console.warn("[bridge_event_rejected_source]", {
      event_origin: String(event.origin || ""),
      expected_parent: true,
    });
    return false;
  }
  const allowedOrigin = resolveAllowedHostOrigin();
  if (!allowedOrigin) {
    console.warn("[bridge_event_rejected_origin]", {
      event_origin: String(event.origin || ""),
      allowed_origin: "",
      reason: "allowed_origin_unresolved",
    });
    return false;
  }
  if (allowedOrigin !== "*" && String(event.origin || "") !== allowedOrigin) {
    console.warn("[bridge_event_rejected_origin]", {
      event_origin: String(event.origin || ""),
      allowed_origin: allowedOrigin,
      reason: "origin_mismatch",
    });
    return false;
  }
  return true;
}

function canUseBridge(): boolean {
  if (!hasBridgeParent()) return false;
  return bridgeEnabled;
}

function resolveTransportStatus(): TransportStatus {
  const o = oa();
  const hasCallTool = Boolean(
    o && typeof (o as { callTool?: (name: string, args: unknown) => Promise<unknown> }).callTool === "function"
  );
  if (hasCallTool) return "ready_callTool";
  if (canUseBridge()) return "ready_bridge";
  if (hasBridgeParent()) return "unknown";
  return "unavailable";
}

export function notifyHostTransportSignal(source: "set_globals" | "host_notification" | "bridge_message" | "manual"): void {
  if (source === "bridge_message") {
    bridgeEnabled = true;
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parsePositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

type BootstrapOrderingState = {
  sessionId: string;
  epoch: number;
  responseSeq: number;
  hostWidgetSessionId: string;
};

function readBootstrapOrderingState(raw: unknown): BootstrapOrderingState {
  const state = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sessionId: String(state.bootstrap_session_id || "").trim(),
    epoch: parsePositiveInt(state.bootstrap_epoch),
    responseSeq: parsePositiveInt(state.response_seq),
    hostWidgetSessionId: String(state.host_widget_session_id || "").trim(),
  };
}

function hasValidBootstrapOrdering(ordering: BootstrapOrderingState): boolean {
  return Boolean(ordering.sessionId) && ordering.epoch > 0 && ordering.responseSeq > 0;
}

function describeBootstrapOrdering(ordering: BootstrapOrderingState): {
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

function decideOrderingPatch(
  current: BootstrapOrderingState,
  incoming: BootstrapOrderingState
): { apply: boolean; reason: string } {
  if (!hasValidBootstrapOrdering(incoming)) return { apply: false, reason: "incoming_invalid" };
  if (!hasValidBootstrapOrdering(current)) return { apply: true, reason: "current_missing" };
  if (
    current.sessionId &&
    incoming.sessionId &&
    current.sessionId === incoming.sessionId &&
    current.hostWidgetSessionId &&
    incoming.hostWidgetSessionId &&
    current.hostWidgetSessionId !== incoming.hostWidgetSessionId
  ) {
    return { apply: false, reason: "host_session_mismatch" };
  }
  if (current.sessionId && incoming.sessionId && current.sessionId !== incoming.sessionId) {
    return { apply: true, reason: "new_session" };
  }
  if (incoming.epoch > current.epoch) return { apply: true, reason: "new_epoch" };
  if (incoming.epoch < current.epoch) return { apply: false, reason: "older_epoch" };
  if (incoming.responseSeq > current.responseSeq) return { apply: true, reason: "new_response_seq" };
  if (incoming.responseSeq === current.responseSeq) return { apply: false, reason: "same_response_seq" };
  return { apply: false, reason: "older_response_seq" };
}

function mergeOutboundOrdering(params: {
  nextState: Record<string, unknown>;
  widgetState: Record<string, unknown>;
}): BootstrapOrderingState {
  const fromNext = readBootstrapOrderingState(params.nextState);
  const fromWidget = readBootstrapOrderingState(params.widgetState);
  if (!hasValidBootstrapOrdering(fromNext)) {
    return hasValidBootstrapOrdering(fromWidget) ? fromWidget : fromNext;
  }
  if (!hasValidBootstrapOrdering(fromWidget)) return fromNext;
  if (fromNext.sessionId !== fromWidget.sessionId) return fromNext;
  if (
    fromNext.hostWidgetSessionId &&
    fromWidget.hostWidgetSessionId &&
    fromNext.hostWidgetSessionId !== fromWidget.hostWidgetSessionId
  ) {
    return fromNext;
  }
  if (fromWidget.epoch > fromNext.epoch) return fromWidget;
  if (fromWidget.epoch < fromNext.epoch) return fromNext;
  if (fromWidget.responseSeq > fromNext.responseSeq) return fromWidget;
  return fromNext;
}

type PayloadQuality = {
  viewMode: string;
  hasUiStrings: boolean;
  hasInteractiveContent: boolean;
  renderable: boolean;
  score: number;
};

function evaluatePayloadQuality(result: Record<string, unknown>): PayloadQuality {
  const state = toRecord(result.state);
  const uiPayload = toRecord(result.ui);
  const uiView = toRecord(uiPayload.view);
  const promptObj = toRecord(uiPayload.prompt);
  const specialist = toRecord(result.specialist);
  const viewMode = String(uiView.mode || "").trim().toLowerCase();
  const uiStrings = toRecord(state.ui_strings);
  const hasUiStrings = Object.keys(uiStrings).length > 0;
  const hasInteractiveContent =
    String(result.text || "").trim().length > 0 ||
    String(result.prompt || "").trim().length > 0 ||
    String(promptObj.body || "").trim().length > 0 ||
    String(uiPayload.questionText || "").trim().length > 0 ||
    String(specialist.message || "").trim().length > 0 ||
    String(specialist.question || "").trim().length > 0 ||
    String(specialist.refined_formulation || "").trim().length > 0 ||
    (Array.isArray(uiPayload.actions) && uiPayload.actions.length > 0);
  const hasState = Object.keys(state).length > 0;
  const hasCurrentStep =
    String(state.current_step || "").trim().length > 0 ||
    String(result.current_step_id || "").trim().length > 0;

  const renderable =
    (viewMode === "prestart" && hasUiStrings) ||
    (viewMode === "interactive" && hasInteractiveContent) ||
    viewMode === "blocked";

  let score = 0;
  if (viewMode) score += 40;
  if (hasState) score += 10;
  if (hasCurrentStep) score += 10;
  if (hasUiStrings) score += 30;
  if (hasInteractiveContent) score += 20;
  if (renderable) score += 50;

  return {
    viewMode,
    hasUiStrings,
    hasInteractiveContent,
    renderable,
    score,
  };
}

function shouldAcceptSameTupleUpgrade(params: {
  incoming: PayloadQuality;
  current: PayloadQuality;
}): boolean {
  if (params.incoming.renderable && !params.current.renderable) return true;
  if (params.incoming.hasUiStrings && !params.current.hasUiStrings) return true;
  if (params.incoming.hasInteractiveContent && !params.current.hasInteractiveContent) return true;
  return params.incoming.score > params.current.score;
}

function buildTupleFailClosedEnvelope(params: {
  currentResult: Record<string, unknown>;
  incomingResult: Record<string, unknown>;
}): Record<string, unknown> {
  const currentState = toRecord(params.currentResult.state);
  const incomingState = toRecord(params.incomingResult.state);
  const stateSource = Object.keys(currentState).length > 0 ? currentState : incomingState;
  const currentStep = String(stateSource.current_step || "step_0").trim() || "step_0";
  const language = String(
    stateSource.language || stateSource.ui_strings_lang || stateSource.ui_strings_requested_lang || "en"
  )
    .trim()
    .toLowerCase() || "en";
  const uiStringsRequestedLang = String(
    stateSource.ui_strings_requested_lang || stateSource.ui_strings_lang || language
  ).trim() || language;
  return {
    _meta: {
      widget_result: {
        current_step_id: currentStep,
        ok: false,
        error: {
          type: "contract_violation",
          message: "Tuple metadata is missing in widget payload.",
          reason: "incoming_missing_tuple",
        },
        state: {
          current_step: currentStep,
          started: String(stateSource.started || "false").trim().toLowerCase() === "true" ? "true" : "false",
          language,
          ui_strings_status: String(stateSource.ui_strings_status || "pending").trim().toLowerCase() || "pending",
          ui_strings_lang: String(stateSource.ui_strings_lang || language).trim().toLowerCase() || language,
          ui_strings_requested_lang: uiStringsRequestedLang,
          ui_gate_status: "blocked",
          ui_gate_reason: "contract_violation",
          bootstrap_phase: "failed",
          reason_code: "incoming_missing_tuple",
        },
        ui: {
          flags: {
            bootstrap_waiting_locale: true,
            bootstrap_interactive_ready: false,
            tuple_incomplete_fail_closed: true,
            tuple_fail_closed_reason: "incoming_missing_tuple",
          },
          view: {
            mode: "blocked",
            waiting_locale: false,
          },
        },
      },
    },
  };
}

function shouldUpdateRenderCache(params: {
  currentHasPayload: boolean;
  incoming: PayloadQuality;
  current: PayloadQuality;
  sameTupleUpgradeAccepted: boolean;
  orderingReason: string;
}): boolean {
  if (params.sameTupleUpgradeAccepted) return true;
  if (!params.currentHasPayload) return true;
  if (params.orderingReason === "new_session" || params.orderingReason === "new_epoch") return true;
  if (params.current.renderable && !params.incoming.renderable) return false;
  if (params.incoming.renderable && !params.current.renderable) return true;
  if (params.incoming.renderable && params.current.renderable) {
    return params.incoming.score >= params.current.score;
  }
  return params.incoming.score >= params.current.score;
}

function bootstrapPollSignatureFromState(state: Record<string, unknown> | null | undefined): string {
  const s = state && typeof state === "object" ? state : {};
  return [
    String(s.bootstrap_session_id || "").trim(),
    String(parsePositiveInt(s.bootstrap_epoch)),
    String(parsePositiveInt(s.response_seq)),
    String(s.host_widget_session_id || "").trim(),
    String(s.current_step || "").trim(),
  ].join("|");
}

export function computeHydrationState(resolved: import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload): import("./locale_bootstrap_runtime.js").HydrationStatus {
  return computeHydrationStateCore(resolved);
}

export function resolveWidgetPayload(
  raw: unknown
): import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload {
  return resolveWidgetPayloadCore(raw);
}

export function extractBootstrapOrdering(
  raw: unknown
): import("./locale_bootstrap_runtime.js").BootstrapOrdering {
  return extractBootstrapOrderingCore(raw);
}

export function computeBootstrapRenderState(params: {
  hydration: import("./locale_bootstrap_runtime.js").HydrationStatus;
  uiStringsStatus: import("./locale_bootstrap_runtime.js").ResolvedWidgetPayload["ui_strings_status"];
  uiFlags: Record<string, unknown>;
  uiView: Record<string, unknown>;
  localeKnownNonEn: boolean;
  hasState?: boolean;
  hasCurrentStep?: boolean;
}): import("./locale_bootstrap_runtime.js").BootstrapRenderState {
  return computeBootstrapRenderStateCore(params);
}

function hydrateWidgetResultEnvelope(raw: unknown): Record<string, unknown> {
  return canonicalizeWidgetPayload(raw).envelope;
}

type ToolResultNormalization = {
  normalized: Record<string, unknown>;
  source: PayloadSource;
  reasonCode: PayloadReasonCode;
};

function normalizeToolResult(raw: unknown): ToolResultNormalization {
  const canonical = canonicalizeWidgetPayload(raw);
  if (Object.keys(canonical.envelope).length > 0) {
    return {
      normalized: canonical.envelope,
      source: canonical.source,
      reasonCode: canonical.reason_code,
    };
  }
  return {
    normalized: canonical.envelope,
    source: canonical.source,
    reasonCode: canonical.reason_code,
  };
}

export function applyToolResult(raw: unknown): Record<string, unknown> {
  return normalizeToolResult(raw).normalized;
}

export function setLastToolOutput(raw: unknown): void {
  const normalized = hydrateWidgetResultEnvelope(raw);
  if (!Object.keys(normalized).length) return;
  try {
    (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = normalized;
  } catch {}
}

function getLastToolOutput(): Record<string, unknown> {
  const cached = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  return cached && typeof cached === "object" ? (cached as Record<string, unknown>) : {};
}

export function hasToolOutput(): boolean {
  return Boolean(getLastToolOutput() && Object.keys(getLastToolOutput()).length);
}

/** Render state reads only canonical hydrated payload cached from host ingest. */
export function toolData(overrideRaw?: unknown): Record<string, unknown> {
  if (overrideRaw !== undefined) return hydrateWidgetResultEnvelope(overrideRaw);
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
  const orderingKeys = ["bootstrap_session_id", "bootstrap_epoch", "response_seq", "host_widget_session_id"];
  const includesOrderingPatch = orderingKeys.some((key) => Object.prototype.hasOwnProperty.call(patch || {}, key));
  if (includesOrderingPatch) {
    const currentOrdering = readBootstrapOrderingState(ws);
    const incomingOrdering = readBootstrapOrderingState(next);
    const orderingDecision = decideOrderingPatch(currentOrdering, incomingOrdering);
    if (!orderingDecision.apply && hasValidBootstrapOrdering(incomingOrdering)) {
      for (const key of orderingKeys) {
        next[key] = ws[key];
      }
      console.warn("[ui_ordering_patch_dropped]", {
        reason: orderingDecision.reason,
        incoming_tuple: describeBootstrapOrdering(incomingOrdering),
        current_tuple: describeBootstrapOrdering(currentOrdering),
      });
    }
  }
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
  const fromRequested =
    resultState?.ui_strings_requested_lang ? String(resultState.ui_strings_requested_lang).toLowerCase().trim() : "";
  const fromUiLang =
    resultState?.ui_strings_lang ? String(resultState.ui_strings_lang).toLowerCase().trim() : "";
  return fromResult || fromRequested || fromUiLang || "";
}

export function uiLang(resultState: Record<string, unknown> | null | undefined): string {
  return languageFromState(resultState);
}

function uiText(
  state: Record<string, unknown> | null | undefined,
  key: string,
  _fallback: string
): string {
  const map = state?.ui_strings && typeof state.ui_strings === "object"
    ? (state.ui_strings as Record<string, unknown>)
    : null;
  const fromState = map ? String(map[key] || "").trim() : "";
  if (fromState) return fromState;
  const lang = uiLang(state) || "en";
  const translated = _t ? String(_t(lang, key) || "").trim() : "";
  return translated || "";
}

let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
let lastCallAt = 0;
const CLICK_DEBOUNCE_MS = 250;
const RUN_STEP_TIMEOUT_MS = 25000;
const BRIDGE_RESPONSE_TIMEOUT_MS = 6000;
const ACTION_BOOTSTRAP_POLL = "ACTION_BOOTSTRAP_POLL";
let bootstrapPollInFlight = false;
let bootstrapPollInFlightSignature = "";

type ActionAckStatus = "accepted" | "rejected" | "timeout" | "dropped";

type ActionLiveness = {
  ack_status: ActionAckStatus;
  state_advanced: boolean;
  reason_code: string;
  action_code_echo: string;
  client_action_id_echo: string;
};

function uiFlagEnabled(name: string, defaultValue: boolean): boolean {
  const raw = (globalThis as Record<string, unknown>)[name];
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function maybeScheduleBootstrapRetry(
  resolved: ResolvedWidgetPayload
): HydrationStatus {
  return computeHydrationState(resolved);
}

export function resetHydrationRetryCycle(opts?: { trigger_poll?: boolean; source?: string }): void {
  if (opts?.trigger_poll !== true) return;
  const source = String(opts?.source || "manual");
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const latestState = toRecord(latest.state);
  if (isDevEnv()) console.log("[recovery_retry_clicked]", { source, has_state: Object.keys(latestState).length > 0 });
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
  void opts;
  const resolved = resolveWidgetPayload(rawOrResult || {});
  const hydration = maybeScheduleBootstrapRetry(resolved);
  return hydration.waiting_reason !== "none";
}

export function handleToolResultAndMaybeScheduleBootstrapRetry(
  raw: unknown,
  opts?: {
    source?: "call_run_step" | "host_notification" | "set_globals" | "unknown";
    is_poll_response?: boolean;
  }
): Record<string, unknown> {
  const source = String(opts?.source || "unknown");
  const normalizedResult = normalizeToolResult(raw);
  const normalized = normalizedResult.normalized;
  if (!Object.keys(normalized).length) {
    console.warn("[ui_ingest_dropped_no_widget_result]", {
      source,
      payload_source: normalizedResult.source,
      payload_reason_code: normalizedResult.reasonCode,
    });
    return {};
  }
  const resolved = resolveWidgetPayload(normalized);
  const result = resolved.result;
  const currentCachedResolved = resolveWidgetPayload(getLastToolOutput());
  const currentCachedResult = currentCachedResolved.result;
  const currentQuality = evaluatePayloadQuality(currentCachedResult);
  const incomingQuality = evaluatePayloadQuality(result);
  const currentOrdering = readBootstrapOrderingState(widgetState());
  const incomingOrdering: BootstrapOrderingState = {
    sessionId: resolved.bootstrap_session_id,
    epoch: resolved.bootstrap_epoch,
    responseSeq: resolved.response_seq,
    hostWidgetSessionId: resolved.host_widget_session_id,
  };
  const incomingHasOrdering = hasValidBootstrapOrdering(incomingOrdering);
  const currentHasOrdering = hasValidBootstrapOrdering(currentOrdering);
  const orderingDecision = decideOrderingPatch(currentOrdering, incomingOrdering);
  let sameTupleUpgradeAccepted = false;
  if (incomingHasOrdering && !orderingDecision.apply) {
    if (
      orderingDecision.reason === "same_response_seq" &&
      shouldAcceptSameTupleUpgrade({
        incoming: incomingQuality,
        current: currentQuality,
      })
    ) {
      sameTupleUpgradeAccepted = true;
      console.log("[ui_ordering_same_seq_upgrade_accepted]", {
        source,
        payload_source: resolved.source,
        payload_reason_code: resolved.source_reason_code,
        incoming_quality_score: incomingQuality.score,
        current_quality_score: currentQuality.score,
        incoming_renderable: incomingQuality.renderable,
        current_renderable: currentQuality.renderable,
        incoming_tuple: describeBootstrapOrdering(incomingOrdering),
        current_tuple: describeBootstrapOrdering(currentOrdering),
      });
    } else {
      console.warn("[ui_ordering_dropped_stale]", {
        source,
        reason: orderingDecision.reason,
        payload_source: resolved.source,
        payload_reason_code: resolved.source_reason_code,
        incoming_tuple: describeBootstrapOrdering(incomingOrdering),
        current_tuple: describeBootstrapOrdering(currentOrdering),
      });
      return {};
    }
  }
  if (!incomingHasOrdering) {
    console.warn("[ui_ingest_tuple_incomplete_fail_closed]", {
      source,
      reason: "incoming_missing_tuple",
      payload_source: resolved.source,
      payload_reason_code: resolved.source_reason_code,
      incoming_tuple: describeBootstrapOrdering(incomingOrdering),
      current_tuple: describeBootstrapOrdering(currentOrdering),
      current_tuple_present: currentHasOrdering,
    });
    if (currentHasOrdering) {
      return {};
    }
    const failClosedEnvelope = buildTupleFailClosedEnvelope({
      currentResult: currentCachedResult,
      incomingResult: result,
    });
    setLastToolOutput(failClosedEnvelope);
    if (_render) _render(failClosedEnvelope);
    return {};
  }
  if (incomingHasOrdering && orderingDecision.apply) {
    setWidgetStateSafe({
      bootstrap_session_id: incomingOrdering.sessionId,
      bootstrap_epoch: incomingOrdering.epoch,
      response_seq: incomingOrdering.responseSeq,
      host_widget_session_id: incomingOrdering.hostWidgetSessionId,
    });
    console.log("[ui_ordering_applied]", {
      source,
      reason: orderingDecision.reason,
      payload_source: resolved.source,
      payload_reason_code: resolved.source_reason_code,
      incoming_tuple: describeBootstrapOrdering(incomingOrdering),
      current_tuple: describeBootstrapOrdering(currentOrdering),
    });
  }
  const shouldPersistToRenderCache = shouldUpdateRenderCache({
    currentHasPayload: Object.keys(currentCachedResult).length > 0,
    incoming: incomingQuality,
    current: currentQuality,
    sameTupleUpgradeAccepted,
    orderingReason: orderingDecision.reason,
  });
  if (shouldPersistToRenderCache) {
    setLastToolOutput(normalized);
    if (_render) _render(normalized);
  } else {
    console.warn("[ui_ingest_ack_cache_preserved]", {
      source,
      payload_source: resolved.source,
      payload_reason_code: resolved.source_reason_code,
      incoming_quality_score: incomingQuality.score,
      current_quality_score: currentQuality.score,
      incoming_renderable: incomingQuality.renderable,
      current_renderable: currentQuality.renderable,
    });
  }
  const hydration = maybeScheduleBootstrapRetry(resolved);
  if (isDevEnv()) {
    console.log("[ui_bootstrap_state]", {
      source,
      payload_source: resolved.source,
      payload_reason_code: resolved.source_reason_code,
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
  const targetOrigin = resolveAllowedHostOrigin();
  if (!targetOrigin) {
    throw new Error("bridge target origin unavailable");
  }
  window.parent.postMessage(message, targetOrigin);
}

async function callToolViaBridge(
  name: string,
  args: unknown,
  opts?: { allowUnconfirmedBridge?: boolean }
): Promise<unknown> {
  if (typeof window === "undefined" || !hasBridgeParent()) {
    throw new Error("bridge unavailable");
  }
  const allowProbe = opts?.allowUnconfirmedBridge === true;
  if (!canUseBridge() && !allowProbe) throw new Error("bridge unavailable");
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

function normalizeLocaleHintCandidate(raw: unknown): string {
  const normalizedRaw = String(raw || "")
    .trim()
    .replace(/_/g, "-")
    .replace(/-{2,}/g, "-");
  if (!normalizedRaw) return "";
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

function languageFromLocale(locale: string): string {
  const candidate = String(locale || "").trim();
  if (!candidate) return "";
  const language = candidate.split("-")[0] || "";
  return language.toLowerCase();
}

function resolveLocaleHintForPayload(state: Record<string, unknown>): {
  localeHint: string;
  localeHintSource: "message_detect" | "webplus_i18n" | "none";
} {
  const explicitLocale =
    normalizeLocaleHintCandidate(state.locale) ||
    normalizeLocaleHintCandidate(state.ui_strings_requested_lang) ||
    normalizeLocaleHintCandidate(state.ui_strings_lang);
  const normalizedLanguage = normalizeLocaleHintCandidate(state.language);
  const languageSource = String(state.language_source || "").trim().toLowerCase();
  if (languageSource === "message_detect") {
    const detectedLocale = normalizedLanguage || explicitLocale;
    if (detectedLocale) {
      return { localeHint: detectedLocale, localeHintSource: "message_detect" };
    }
  }
  const explicitLanguage = languageFromLocale(explicitLocale);
  const resolvedLanguage = languageFromLocale(normalizedLanguage);
  const nonEnglishKnown =
    (explicitLanguage && explicitLanguage !== "en") ||
    (resolvedLanguage && resolvedLanguage !== "en");
  if (nonEnglishKnown) {
    const localeToSend = explicitLocale || normalizedLanguage;
    if (localeToSend) {
      return { localeHint: localeToSend, localeHintSource: "webplus_i18n" };
    }
  }
  // Avoid sending a synthetic/default locale hint (especially EN) from startup fallback state.
  return { localeHint: "", localeHintSource: "none" };
}

function normalizeActionAckStatus(raw: unknown): ActionAckStatus {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "accepted") return "accepted";
  if (normalized === "rejected") return "rejected";
  if (normalized === "timeout") return "timeout";
  if (normalized === "dropped") return "dropped";
  return "rejected";
}

function parseBool(value: unknown): boolean {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function generateClientActionId(actionCode: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `ca_${Date.now()}_${String(actionCode || "ACTION").trim().toLowerCase()}_${suffix}`;
}

function ensureClientActionIdOnState(state: Record<string, unknown>, actionCode: string): string {
  const existing = String((state as { __client_action_id?: unknown }).__client_action_id || "").trim();
  if (existing) return existing;
  const generated = generateClientActionId(actionCode);
  (state as { __client_action_id?: string }).__client_action_id = generated;
  return generated;
}

function extractActionLiveness(result: Record<string, unknown>, fallback: {
  action_code: string;
  client_action_id: string;
}): ActionLiveness {
  const state = toRecord(result.state);
  const stateLiveness = toRecord(state.ui_action_liveness);
  const ackStatus = normalizeActionAckStatus(
    result.ack_status || state.ack_status || stateLiveness.ack_status || "rejected"
  );
  const stateAdvanced = parseBool(
    result.state_advanced ?? state.state_advanced ?? stateLiveness.state_advanced ?? false
  );
  const reasonCode = String(
    result.reason_code || state.reason_code || stateLiveness.reason_code || ""
  )
    .trim()
    .toLowerCase();
  const actionCodeEcho = String(
    result.action_code_echo || state.action_code_echo || stateLiveness.action_code_echo || fallback.action_code
  )
    .trim()
    .toUpperCase();
  const clientActionIdEcho = String(
    result.client_action_id_echo ||
      state.client_action_id_echo ||
      stateLiveness.client_action_id_echo ||
      fallback.client_action_id
  ).trim();
  return {
    ack_status: ackStatus,
    state_advanced: stateAdvanced,
    reason_code: stateAdvanced ? "" : (reasonCode || "state_not_advanced"),
    action_code_echo: actionCodeEcho,
    client_action_id_echo: clientActionIdEcho,
  };
}

function livenessMessageForReason(
  state: Record<string, unknown>,
  liveness: ActionLiveness
): string {
  if (liveness.ack_status === "timeout") {
    return uiText(state, "transient.timeout", "") || "The action timed out. Please retry.";
  }
  if (liveness.ack_status === "dropped") {
    return uiText(state, "error.contract.body", "") || `Action was dropped (${liveness.reason_code}).`;
  }
  if (liveness.ack_status === "rejected") {
    return uiText(state, "error.contract.body", "") || `Action was rejected (${liveness.reason_code}).`;
  }
  if (!liveness.state_advanced) {
    return uiText(state, "error.contract.body", "") || `No state update received (${liveness.reason_code}).`;
  }
  return "";
}

export async function callRunStep(
  message: string | number,
  extraState?: Record<string, unknown>
): Promise<void> {
  const o = oa();
  const messageText = String(message || "").trim();
  const isStartAction = messageText === "ACTION_START";
  const cleanExtraState =
    extraState && typeof extraState === "object"
      ? { ...extraState }
      : undefined;
  const transportStatus = resolveTransportStatus();
  const hasCallTool = transportStatus === "ready_callTool";
  const hasBridgePath =
    transportStatus === "ready_bridge" || transportStatus === "unknown";
  if (!hasCallTool && !hasBridgePath) {
    const fallbackActionCode = String(messageText || "").trim().toUpperCase();
    setWidgetStateSafe({
      ui_action_liveness_ack_status: "rejected",
      ui_action_liveness_state_advanced: "false",
      ui_action_liveness_reason_code: "transport_unavailable",
      ui_action_liveness_action_code: fallbackActionCode,
      ui_action_liveness_client_action_id: "",
    });
    if (isStartAction) {
      setWidgetStateSafe({
        start_dispatch_state: "failed",
        transport_ready: "false",
      });
    }
    console.warn("[ui_transport_unavailable]", {
      action_code: messageText,
      transport_status: transportStatus,
    });
    setInlineNotice(
      uiText((cleanExtraState as Record<string, unknown>) || {}, "transient.connection_failed", "") ||
        "Connection to the app host failed. Please try again."
    );
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
  const isBootstrapPollCall =
    messageText === ACTION_BOOTSTRAP_POLL ||
    String((cleanExtraState as any)?.__bootstrap_poll || "").trim().toLowerCase() === "true";
  if (String(message || "").trim() === "") {
    if (hasToolOutput && !isBootstrapPollCall) return;
    if (!persistedStarted && !isBootstrapPollCall) return;
  }

  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const state = latest.state || { current_step: "step_0" };

  const baseState = state;
  const ws = widgetState();
  let nextState = Object.assign({}, baseState);
  if (cleanExtraState && typeof cleanExtraState === "object") {
    nextState = Object.assign({}, nextState, cleanExtraState);
  }
  const outboundOrdering = mergeOutboundOrdering({ nextState, widgetState: ws });
  if (hasValidBootstrapOrdering(outboundOrdering)) {
    (nextState as Record<string, unknown>).bootstrap_session_id = outboundOrdering.sessionId;
    (nextState as Record<string, unknown>).bootstrap_epoch = outboundOrdering.epoch;
    (nextState as Record<string, unknown>).response_seq = outboundOrdering.responseSeq;
    (nextState as Record<string, unknown>).host_widget_session_id = outboundOrdering.hostWidgetSessionId;
  }
  const localeHint = resolveLocaleHintForPayload(nextState as Record<string, unknown>);
  const payload = {
    current_step_id: nextState.current_step || "step_0",
    user_message: String(message || ""),
    input_mode: "widget",
    locale_hint: localeHint.localeHint,
    locale_hint_source: localeHint.localeHintSource,
    state: nextState,
  };
  const bootstrapPollSignature = isBootstrapPollCall
    ? bootstrapPollSignatureFromState(nextState as Record<string, unknown>)
    : "";
  if (isBootstrapPollCall) {
    if (bootstrapPollInFlight) {
      if (isDevEnv()) {
        console.log("[ui_bootstrap_poll_deduped]", {
          poll_signature: bootstrapPollSignature,
          in_flight_signature: bootstrapPollInFlightSignature,
          reason: "single_flight_in_flight",
        });
      }
      return;
    }
    bootstrapPollInFlight = true;
    bootstrapPollInFlightSignature = bootstrapPollSignature;
  }

  const ensuredClientActionId = ensureClientActionIdOnState(
    nextState as Record<string, unknown>,
    messageText || "TEXT_INPUT"
  );
  const requestId = String((nextState as any).__request_id || "");
  const clientActionId = ensuredClientActionId;
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
    setInlineNotice(uiText(nextState, "transient.timeout", ""));
    setLoading(false);
  }, timeoutMs);

  try {
    const transportPrimary: "callTool" | "bridge" = hasCallTool ? "callTool" : "bridge";
    if (isStartAction) clearInlineNotice();
    if (isStartAction) {
      setWidgetStateSafe({
        start_dispatch_state: "dispatching",
        transport_ready: transportPrimary === "callTool" || canUseBridge() ? "true" : "probing",
      });
    }
    console.log("[ui_action_dispatched]", {
      action_code: messageText,
      transport_used: transportPrimary,
      ordering_tuple: describeBootstrapOrdering(readBootstrapOrderingState(nextState)),
    });
    let resp: unknown;
    const transportUsed: "callTool" | "bridge" = transportPrimary;
    if (transportPrimary === "callTool") {
      resp = await (o as { callTool: (name: string, args: unknown) => Promise<unknown> }).callTool("run_step", payload);
    } else {
      resp = await callToolViaBridge("run_step", payload, { allowUnconfirmedBridge: true });
      if (!bridgeEnabled) {
        bridgeEnabled = true;
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
    const orderingBeforeIngest = readBootstrapOrderingState(widgetState());
    const normalizedRaw = toRecord(resp);
    const resolvedResponse = resolveWidgetPayload(normalizedRaw);
    const directResult = resolvedResponse.result;
    const ingestedResult = handleToolResultAndMaybeScheduleBootstrapRetry(normalizedRaw, {
      source: "call_run_step",
    });
    const hasIngestedResult = Object.keys(ingestedResult).length > 0;
    const orderingAfterIngest = readBootstrapOrderingState(widgetState());
    const orderingAdvanceDecision = decideOrderingPatch(orderingBeforeIngest, orderingAfterIngest);
    const orderingAdvanced = hasValidBootstrapOrdering(orderingAfterIngest) && orderingAdvanceDecision.apply;
    const result = hasIngestedResult ? ingestedResult : directResult;
    const errorObj = result?.error as
      | { type?: string; user_message?: string; retry_after_ms?: number; retry_action?: string }
      | null;
    const transientRetryError =
      result?.ok === false &&
      errorObj &&
      (errorObj.type === "timeout" || errorObj.type === "rate_limited") &&
      (errorObj.retry_action === "retry_same_action" || errorObj.type === "rate_limited");
    if (transientRetryError) {
      if (errorObj.type === "rate_limited") {
        setInlineNotice(
          errorObj.user_message ||
            uiText(nextState, "transient.rate_limited", "")
        );
        lockRateLimit(errorObj.retry_after_ms ?? 1500);
      } else {
        setInlineNotice(
          errorObj.user_message ||
            uiText(nextState, "transient.timeout", "")
        );
      }
      return;
    }
    if (debugCalls) {
      console.log("[ui_dispatch_ack_only]", {
        request_id: requestId,
        client_action_id: clientActionId,
        current_step: String(nextState.current_step || ""),
        has_widget_result: resolvedResponse.source !== "none",
        payload_source: resolvedResponse.source,
        payload_reason_code: resolvedResponse.source_reason_code,
        ordering_advanced: orderingAdvanced,
        response_ingested: hasIngestedResult,
      });
    }
    const responseViewMode = String(
      (
        toRecord(
          toRecord(
            result?.ui
          ).view
        ).mode || ""
      )
    )
      .trim()
      .toLowerCase();
    const hasServerLiveness =
      String((result as any).ack_status || "").trim() !== "" ||
      String((toRecord(result?.state).ack_status || "")).trim() !== "" ||
      String((toRecord(toRecord(result?.state).ui_action_liveness).ack_status || "")).trim() !== "";
    const resultState = toRecord(result?.state);
    const responseCurrentStep = String(resultState.current_step || result?.current_step_id || "").trim();
    const requestCurrentStep = String((nextState as Record<string, unknown>).current_step || "").trim();
    const stepAdvanced = Boolean(responseCurrentStep) && responseCurrentStep !== requestCurrentStep;
    const fallbackStateAdvanced = hasIngestedResult && (orderingAdvanced || stepAdvanced);
    const fallbackAckStatus: ActionAckStatus =
      result?.ok !== false
        ? "accepted"
        : ((errorObj?.type || "").toLowerCase() === "timeout" ? "timeout" : "rejected");
    const liveness = hasServerLiveness
      ? extractActionLiveness(result, { action_code: messageText, client_action_id: clientActionId })
      : {
          ack_status: fallbackAckStatus,
          state_advanced: fallbackStateAdvanced,
          reason_code: fallbackStateAdvanced
            ? ""
            : (errorObj?.type || "state_not_advanced"),
          action_code_echo: String(messageText || "").trim().toUpperCase(),
          client_action_id_echo: clientActionId,
        };
    const hasExplicitError = liveness.ack_status !== "accepted" || liveness.state_advanced !== true;
    console.log("[ui_action_liveness_ack]", {
      action_code: liveness.action_code_echo,
      client_action_id: liveness.client_action_id_echo,
      ack_status: liveness.ack_status,
      state_advanced: liveness.state_advanced,
      reason_code: liveness.reason_code,
      payload_source: resolvedResponse.source,
      payload_reason_code: resolvedResponse.source_reason_code,
      ordering_before: describeBootstrapOrdering(orderingBeforeIngest),
      ordering_after: describeBootstrapOrdering(orderingAfterIngest),
    });
    setWidgetStateSafe({
      ui_action_liveness_ack_status: liveness.ack_status,
      ui_action_liveness_state_advanced: liveness.state_advanced ? "true" : "false",
      ui_action_liveness_reason_code: liveness.reason_code,
      ui_action_liveness_action_code: liveness.action_code_echo,
      ui_action_liveness_client_action_id: liveness.client_action_id_echo,
    });
    if (hasExplicitError) {
      console.warn("[ui_action_liveness_explicit_error]", {
        action_code: liveness.action_code_echo,
        client_action_id: liveness.client_action_id_echo,
        ack_status: liveness.ack_status,
        reason_code: liveness.reason_code,
      });
      setInlineNotice(livenessMessageForReason(nextState as Record<string, unknown>, liveness));
      if (liveness.ack_status === "accepted" && !liveness.state_advanced) {
        console.warn("[ui_action_dispatch_ack_without_state_advance]", {
          action_code: String(messageText || "").trim().toUpperCase(),
          response_ingested: hasIngestedResult,
          ordering_advanced: orderingAdvanced,
          payload_source: resolvedResponse.source,
          payload_reason_code: resolvedResponse.source_reason_code,
          response_view_mode: responseViewMode,
          ordering_before: describeBootstrapOrdering(orderingBeforeIngest),
          ordering_after: describeBootstrapOrdering(orderingAfterIngest),
        });
      }
      if (isStartAction) {
        setWidgetStateSafe({
          start_dispatch_state: "failed",
          transport_ready: "true",
        });
      }
    } else {
      if (isStartAction) {
        setWidgetStateSafe({
          start_dispatch_state: "ready",
          transport_ready: "true",
        });
      }
    }
  } catch (e) {
    if (didTimeout) return;
    const msg = (e && (e as Error).message) ? String((e as Error).message) : "";
    const lowerMsg = msg.toLowerCase();
    const transportError =
      lowerMsg.includes("bridge unavailable") ||
      lowerMsg.includes("bridge timeout") ||
      lowerMsg.includes("transport");
    if (isStartAction && transportError) {
      console.log("[ui_start_dispatch_failed]", {
        reason: "transport_error",
        message: msg,
      });
      setWidgetStateSafe({
        start_dispatch_state: "failed",
        transport_ready: "false",
        ui_action_liveness_ack_status: "rejected",
        ui_action_liveness_state_advanced: "false",
        ui_action_liveness_reason_code: "transport_error",
        ui_action_liveness_action_code: String(messageText || "").trim().toUpperCase(),
        ui_action_liveness_client_action_id: clientActionId,
      });
      setInlineNotice(uiText(nextState, "transient.connection_failed", ""));
      return;
    }
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
      setInlineNotice(uiText(nextState, "transient.timeout", ""));
      setWidgetStateSafe({
        ui_action_liveness_ack_status: "timeout",
        ui_action_liveness_state_advanced: "false",
        ui_action_liveness_reason_code: "timeout",
        ui_action_liveness_action_code: String(messageText || "").trim().toUpperCase(),
        ui_action_liveness_client_action_id: clientActionId,
      });
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
    if (isBootstrapPollCall) {
      bootstrapPollInFlight = false;
      bootstrapPollInFlightSignature = "";
    }
    if (timeoutId) clearTimeout(timeoutId);
    if (!didTimeout) setLoading(false);
  }
}
