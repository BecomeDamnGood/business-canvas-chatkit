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
  // Reset per-instance dispatch debounce so a fresh widget session cannot inherit a stale click lockout.
  lastCallAt = 0;
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

type IngestSource = "call_run_step" | "host_notification" | "set_globals" | "unknown";

type ClientIngestClock = {
  client_ingest_ts_ms: number;
  client_ingest_seq: number;
  client_ingest_delta_ms: number;
};

type ClientCorrelation = {
  correlation_id: string;
  client_action_id: string;
  request_id: string;
};

type ClientIngestContext = ClientIngestClock &
  ClientCorrelation & {
    payload_shape_fingerprint: string;
    payload_source: PayloadSource;
    payload_reason_code: PayloadReasonCode;
  };

let clientIngestSeq = 0;
let clientIngestLastTsMs = 0;

function nextClientIngestClock(): ClientIngestClock {
  const nowMs = Date.now();
  const tsMs = nowMs > clientIngestLastTsMs ? nowMs : clientIngestLastTsMs + 1;
  const deltaMs = clientIngestLastTsMs > 0 ? tsMs - clientIngestLastTsMs : 0;
  clientIngestLastTsMs = tsMs;
  clientIngestSeq += 1;
  return {
    client_ingest_ts_ms: tsMs,
    client_ingest_seq: clientIngestSeq,
    client_ingest_delta_ms: deltaMs,
  };
}

function stableKeyFingerprint(record: Record<string, unknown>, maxKeys = 8): string {
  const keys = Object.keys(record).sort();
  if (keys.length === 0) return "-";
  const clipped = keys.slice(0, maxKeys).join(",");
  if (keys.length <= maxKeys) return clipped;
  return `${clipped},+${keys.length - maxKeys}`;
}

function boolFlag(value: boolean): "1" | "0" {
  return value ? "1" : "0";
}

function isNonEmptyRecord(value: unknown): boolean {
  return Object.keys(toRecord(value)).length > 0;
}

function shapeFingerprint(raw: unknown): string {
  const root = toRecord(raw);
  const rootToolOutput = toRecord(root.toolOutput);
  const rootStructured = toRecord(root.structuredContent);
  const toolStructured = toRecord(rootToolOutput.structuredContent);
  const rootMeta = toRecord(root._meta);
  const toolMeta = toRecord(rootToolOutput._meta);
  return [
    `rk:${stableKeyFingerprint(root)}`,
    `tk:${stableKeyFingerprint(rootToolOutput)}`,
    `sk:${stableKeyFingerprint(rootStructured)}`,
    `tsk:${stableKeyFingerprint(toolStructured)}`,
    `rwr:${boolFlag(isNonEmptyRecord(root._widget_result))}`,
    `twr:${boolFlag(isNonEmptyRecord(rootToolOutput._widget_result))}`,
    `swr:${boolFlag(isNonEmptyRecord(rootStructured._widget_result))}`,
    `tswr:${boolFlag(isNonEmptyRecord(toolStructured._widget_result))}`,
    `rmwr:${boolFlag(isNonEmptyRecord(rootMeta.widget_result))}`,
    `tmwr:${boolFlag(isNonEmptyRecord(toolMeta.widget_result))}`,
  ].join("|");
}

function coalesceString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function readCorrelationFromRaw(raw: unknown): string {
  const root = toRecord(raw);
  const meta = toRecord(root._meta);
  const requestInfo = toRecord((root as { requestInfo?: unknown }).requestInfo);
  const headers = toRecord(requestInfo.headers);
  const state = toRecord(resolveWidgetPayload(raw).result.state);
  return coalesceString(
    root.correlation_id,
    meta.correlation_id,
    meta["x-correlation-id"],
    meta["x-request-id"],
    headers["x-correlation-id"],
    headers["x-request-id"],
    state.correlation_id,
    state["x-correlation-id"]
  );
}

function readRequestIdFromRaw(raw: unknown): string {
  const root = toRecord(raw);
  const meta = toRecord(root._meta);
  const state = toRecord(resolveWidgetPayload(raw).result.state);
  return coalesceString(
    root.request_id,
    root.__request_id,
    meta.request_id,
    meta["x-request-id"],
    state.request_id,
    state.__request_id
  );
}

function readClientActionIdFromResult(result: Record<string, unknown>): string {
  const state = toRecord(result.state);
  const stateLiveness = toRecord(state.ui_action_liveness);
  return coalesceString(
    result.client_action_id_echo,
    state.client_action_id_echo,
    stateLiveness.client_action_id_echo,
    state.__client_action_id
  );
}

function resolveClientCorrelation(params: {
  raw: unknown;
  result: Record<string, unknown>;
  fallbackClientActionId?: string;
  fallbackRequestId?: string;
}): ClientCorrelation {
  const correlationFromResult = coalesceString(
    params.result.correlation_id,
    toRecord(params.result.state).correlation_id
  );
  return {
    correlation_id: coalesceString(correlationFromResult, readCorrelationFromRaw(params.raw)),
    client_action_id: coalesceString(
      readClientActionIdFromResult(params.result),
      params.fallbackClientActionId
    ),
    request_id: coalesceString(
      params.fallbackRequestId,
      readRequestIdFromRaw(params.raw),
      toRecord(params.result.state).request_id
    ),
  };
}

function buildClientIngestContext(params: {
  raw: unknown;
  resolved: ResolvedWidgetPayload;
  fallbackClientActionId?: string;
  fallbackRequestId?: string;
}): ClientIngestContext {
  const clock = nextClientIngestClock();
  const correlation = resolveClientCorrelation({
    raw: params.raw,
    result: params.resolved.result,
    fallbackClientActionId: params.fallbackClientActionId,
    fallbackRequestId: params.fallbackRequestId,
  });
  return {
    ...clock,
    ...correlation,
    payload_shape_fingerprint: shapeFingerprint(params.raw),
    payload_source: params.resolved.source,
    payload_reason_code: params.resolved.source_reason_code,
  };
}

function logClientIngestObservation(params: {
  source: IngestSource;
  phase: "received" | "dropped_no_widget_result" | "set_globals_empty_payload";
  context: ClientIngestContext;
}): void {
  console.log("[ui_ingest_event]", {
    source: params.source,
    phase: params.phase,
    ...params.context,
  });
}

export function logClientIngestProbe(params: {
  source: IngestSource;
  phase: "set_globals_empty_payload";
  raw: unknown;
  client_action_id?: string;
  request_id?: string;
}): ClientIngestContext {
  const resolved = resolveWidgetPayload(params.raw);
  const context = buildClientIngestContext({
    raw: params.raw,
    resolved,
    fallbackClientActionId: params.client_action_id,
    fallbackRequestId: params.request_id,
  });
  logClientIngestObservation({
    source: params.source,
    phase: params.phase,
    context,
  });
  return context;
}

type BootstrapOrderingState = {
  sessionId: string;
  epoch: number;
  responseSeq: number;
  hostWidgetSessionId: string;
};

type Step0ContinuityField = "business_name" | "step_0_final" | "step0_bootstrap";

const STEP0_CONTINUITY_FIELDS: Step0ContinuityField[] = [
  "business_name",
  "step_0_final",
  "step0_bootstrap",
];

type CanonicalContinuityStep =
  | "dream"
  | "purpose"
  | "bigwhy"
  | "role"
  | "entity"
  | "strategy"
  | "targetgroup"
  | "productsservices"
  | "rulesofthegame"
  | "presentation";

const CANONICAL_CONTINUITY_STEP_IDS: CanonicalContinuityStep[] = [
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
  "presentation",
];

const CANONICAL_FINAL_FIELD_BY_STEP_ID: Record<CanonicalContinuityStep, string> = {
  dream: "dream_final",
  purpose: "purpose_final",
  bigwhy: "bigwhy_final",
  role: "role_final",
  entity: "entity_final",
  strategy: "strategy_final",
  targetgroup: "targetgroup_final",
  productsservices: "productsservices_final",
  rulesofthegame: "rulesofthegame_final",
  presentation: "presentation_brief_final",
};

const ACCEPTED_CANONICAL_PROVISIONAL_SOURCES = new Set([
  "user_input",
  "wording_pick",
  "action_route",
]);

export type WidgetStateOrderingSnapshot = {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  host_widget_session_id: string;
  tuple_complete: boolean;
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
  return Boolean(ordering.sessionId) &&
    ordering.epoch > 0 &&
    ordering.responseSeq > 0 &&
    Boolean(ordering.hostWidgetSessionId);
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
    return fromWidget;
  }
  if (fromWidget.epoch > fromNext.epoch) return fromWidget;
  if (fromWidget.epoch < fromNext.epoch) return fromNext;
  if (fromWidget.responseSeq > fromNext.responseSeq) return fromWidget;
  return fromNext;
}

function normalizeStep0Bootstrap(raw: unknown): Record<string, unknown> {
  const bootstrap = toRecord(raw);
  const venture = String(bootstrap.venture || "").replace(/\s+/g, " ").trim();
  const name = String(bootstrap.name || "").replace(/\s+/g, " ").trim();
  const status = String(bootstrap.status || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
  const source = String(bootstrap.source || "").trim();
  if (!venture && !name && !source) return {};
  return {
    ...(venture ? { venture } : {}),
    ...(name ? { name } : {}),
    ...(venture && name ? { status } : {}),
    ...(source ? { source } : {}),
  };
}

function isKnownBusinessName(raw: unknown): boolean {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  return Boolean(name) && name.toLowerCase() !== "tbd";
}

function composeStep0FinalFromBootstrap(bootstrap: Record<string, unknown>): string {
  const venture = String(bootstrap.venture || "").replace(/\s+/g, " ").trim();
  const name = String(bootstrap.name || "").replace(/\s+/g, " ").trim();
  if (!venture || !name) return "";
  const status = String(bootstrap.status || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
  return `Venture: ${venture} | Name: ${name} | Status: ${status}`;
}

function hasOwnKey(source: Record<string, unknown> | null | undefined, key: string): boolean {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeAcceptedCanonicalSource(raw: unknown): string {
  const source = String(raw || "").trim();
  return ACCEPTED_CANONICAL_PROVISIONAL_SOURCES.has(source) ? source : "";
}

function extractCanonicalContinuityContext(
  state: Record<string, unknown> | null | undefined
): {
  finals: Record<string, string>;
  provisional_by_step: Record<string, string>;
  provisional_source_by_step: Record<string, string>;
} {
  const source = state && typeof state === "object" ? state : {};
  const finals: Record<string, string> = {};
  for (const stepId of CANONICAL_CONTINUITY_STEP_IDS) {
    const finalField = CANONICAL_FINAL_FIELD_BY_STEP_ID[stepId];
    const finalValue = String(source[finalField] || "").trim();
    if (finalValue) finals[finalField] = finalValue;
  }
  const provisionalByStep = toRecord(source.provisional_by_step);
  const provisionalSourceByStep = toRecord(source.provisional_source_by_step);
  const acceptedProvisionalByStep: Record<string, string> = {};
  const acceptedProvisionalSources: Record<string, string> = {};
  for (const stepId of CANONICAL_CONTINUITY_STEP_IDS) {
    const value = String(provisionalByStep[stepId] || "").trim();
    const sourceValue = normalizeAcceptedCanonicalSource(provisionalSourceByStep[stepId]);
    if (!value || !sourceValue) continue;
    acceptedProvisionalByStep[stepId] = value;
    acceptedProvisionalSources[stepId] = sourceValue;
  }
  return {
    finals,
    provisional_by_step: acceptedProvisionalByStep,
    provisional_source_by_step: acceptedProvisionalSources,
  };
}

function hasExplicitCanonicalProvisionalClear(
  state: Record<string, unknown> | null | undefined,
  stepId: CanonicalContinuityStep
): boolean {
  const source = state && typeof state === "object" ? state : {};
  const provisionalByStep = toRecord(source.provisional_by_step);
  const provisionalSourceByStep = toRecord(source.provisional_source_by_step);
  return (
    (hasOwnKey(provisionalByStep, stepId) && String(provisionalByStep[stepId] || "").trim() === "") ||
    (hasOwnKey(provisionalSourceByStep, stepId) && String(provisionalSourceByStep[stepId] || "").trim() === "")
  );
}

function continuityScopeCompatible(
  preferred: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined
): boolean {
  const preferredOrdering = readBootstrapOrderingState(preferred);
  const fallbackOrdering = readBootstrapOrderingState(fallback);
  if (!hasValidBootstrapOrdering(preferredOrdering) || !hasValidBootstrapOrdering(fallbackOrdering)) return true;
  if (preferredOrdering.sessionId !== fallbackOrdering.sessionId) return false;
  if (
    preferredOrdering.hostWidgetSessionId &&
    fallbackOrdering.hostWidgetSessionId &&
    preferredOrdering.hostWidgetSessionId !== fallbackOrdering.hostWidgetSessionId
  ) {
    return false;
  }
  return true;
}

function continuityScopeResetRequired(
  currentState: Record<string, unknown> | null | undefined,
  incomingState: Record<string, unknown> | null | undefined
): boolean {
  const currentOrdering = readBootstrapOrderingState(currentState);
  const incomingOrdering = readBootstrapOrderingState(incomingState);
  if (!hasValidBootstrapOrdering(currentOrdering) || !hasValidBootstrapOrdering(incomingOrdering)) return false;
  return !continuityScopeCompatible(incomingState, currentState);
}

function extractStep0ContinuityContext(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = state && typeof state === "object" ? state : {};
  const bootstrap = normalizeStep0Bootstrap(source.step0_bootstrap);
  const businessNameFromState = isKnownBusinessName(source.business_name)
    ? String(source.business_name).replace(/\s+/g, " ").trim()
    : "";
  const businessNameFromBootstrap = isKnownBusinessName(bootstrap.name)
    ? String(bootstrap.name).replace(/\s+/g, " ").trim()
    : "";
  const step0FinalFromState = String(source.step_0_final || "").replace(/\s+/g, " ").trim();
  const step0FinalFromBootstrap = composeStep0FinalFromBootstrap(bootstrap);
  return {
    ...(Object.keys(bootstrap).length > 0 ? { step0_bootstrap: bootstrap } : {}),
    ...((businessNameFromState || businessNameFromBootstrap)
      ? { business_name: businessNameFromState || businessNameFromBootstrap }
      : {}),
    ...(step0FinalFromState || step0FinalFromBootstrap
      ? { step_0_final: step0FinalFromState || step0FinalFromBootstrap }
      : {}),
  };
}

export function retainStep0Continuity(
  preferred: Record<string, unknown> | null | undefined,
  ...fallbacks: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  let next = preferred && typeof preferred === "object" ? { ...preferred } : {};
  for (const fallback of fallbacks) {
    if (!continuityScopeCompatible(next, fallback || {})) continue;
    const nextContext = extractStep0ContinuityContext(next);
    const fallbackContext = extractStep0ContinuityContext(fallback || {});
    for (const field of STEP0_CONTINUITY_FIELDS) {
      if (field === "step0_bootstrap") {
        if (!Object.keys(toRecord(nextContext.step0_bootstrap)).length && Object.keys(toRecord(fallbackContext.step0_bootstrap)).length) {
          next.step0_bootstrap = fallbackContext.step0_bootstrap;
        }
        continue;
      }
      if (String(nextContext[field] || "").trim()) continue;
      const fallbackValue = fallbackContext[field];
      if (String(fallbackValue || "").trim()) {
        next[field] = fallbackValue;
      }
    }
  }
  const normalizedContext = extractStep0ContinuityContext(next);
  return {
    ...next,
    ...(Object.keys(toRecord(normalizedContext.step0_bootstrap)).length
      ? { step0_bootstrap: normalizedContext.step0_bootstrap }
      : {}),
    ...(String(normalizedContext.business_name || "").trim()
      ? { business_name: normalizedContext.business_name }
      : {}),
    ...(String(normalizedContext.step_0_final || "").trim()
      ? { step_0_final: normalizedContext.step_0_final }
      : {}),
  };
}

export function retainCanonicalStepContinuity(
  preferred: Record<string, unknown> | null | undefined,
  ...fallbacks: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  let next = retainStep0Continuity(preferred, ...fallbacks);
  for (const fallback of fallbacks) {
    if (!continuityScopeCompatible(next, fallback || {})) continue;
    const fallbackState = fallback && typeof fallback === "object" ? fallback : {};
    const nextProvisionalRaw = toRecord(next.provisional_by_step);
    const nextSourceRaw = toRecord(next.provisional_source_by_step);
    const fallbackProvisionalRaw = toRecord(fallbackState.provisional_by_step);
    const fallbackSourceRaw = toRecord(fallbackState.provisional_source_by_step);
    const nextProvisional = { ...nextProvisionalRaw };
    const nextSources = { ...nextSourceRaw };
    let mapsChanged = false;

    for (const stepId of CANONICAL_CONTINUITY_STEP_IDS) {
      const finalField = CANONICAL_FINAL_FIELD_BY_STEP_ID[stepId];
      const nextHasExplicitFinal = hasOwnKey(next, finalField);
      const nextFinalValue = String(next[finalField] || "").trim();
      const fallbackFinalValue = String(fallbackState[finalField] || "").trim();
      if (!nextHasExplicitFinal && !nextFinalValue && fallbackFinalValue) {
        next[finalField] = fallbackFinalValue;
      }

      const nextValue = String(nextProvisional[stepId] || "").trim();
      const nextSource = normalizeAcceptedCanonicalSource(nextSources[stepId]);
      if (nextValue && nextSource) continue;
      if (hasExplicitCanonicalProvisionalClear(next, stepId)) continue;

      const fallbackValue = String(fallbackProvisionalRaw[stepId] || "").trim();
      const fallbackSource = normalizeAcceptedCanonicalSource(fallbackSourceRaw[stepId]);
      if (!fallbackValue || !fallbackSource) continue;

      if (!nextValue && !hasOwnKey(nextProvisionalRaw, stepId)) {
        nextProvisional[stepId] = fallbackValue;
        mapsChanged = true;
      }
      if (!nextSource && !hasOwnKey(nextSourceRaw, stepId)) {
        nextSources[stepId] = fallbackSource;
        mapsChanged = true;
      }
      if (!String(nextProvisional[stepId] || "").trim() && normalizeAcceptedCanonicalSource(nextSources[stepId])) {
        nextProvisional[stepId] = fallbackValue;
        mapsChanged = true;
      }
      if (String(nextProvisional[stepId] || "").trim() && !normalizeAcceptedCanonicalSource(nextSources[stepId])) {
        nextSources[stepId] = fallbackSource;
        mapsChanged = true;
      }
    }

    if (mapsChanged) {
      next.provisional_by_step = nextProvisional;
      next.provisional_source_by_step = nextSources;
    }
  }

  const normalizedContext = extractCanonicalContinuityContext(next);
  return {
    ...next,
    ...normalizedContext.finals,
    ...(Object.keys(normalizedContext.provisional_by_step).length
      ? {
        provisional_by_step: {
          ...toRecord(next.provisional_by_step),
          ...normalizedContext.provisional_by_step,
        },
      }
      : {}),
    ...(Object.keys(normalizedContext.provisional_source_by_step).length
      ? {
        provisional_source_by_step: {
          ...toRecord(next.provisional_source_by_step),
          ...normalizedContext.provisional_source_by_step,
        },
      }
      : {}),
  };
}

function buildWidgetStateContinuityPatch(params: {
  currentWidgetState: Record<string, unknown>;
  incomingState: Record<string, unknown>;
}): Record<string, unknown> {
  const resetContinuity = continuityScopeResetRequired(params.currentWidgetState, params.incomingState);
  const retained = retainCanonicalStepContinuity(params.incomingState, params.currentWidgetState);
  const currentCanonicalContext = extractCanonicalContinuityContext(params.currentWidgetState);
  const retainedCanonicalContext = extractCanonicalContinuityContext(retained);
  const patch: Record<string, unknown> = resetContinuity
    ? {
      business_name: undefined,
      step_0_final: undefined,
      step0_bootstrap: undefined,
      provisional_by_step: undefined,
      provisional_source_by_step: undefined,
    }
    : {};
  if (resetContinuity) {
    for (const finalField of Object.values(CANONICAL_FINAL_FIELD_BY_STEP_ID)) patch[finalField] = undefined;
  }
  const retainedContext = extractStep0ContinuityContext(retained);
  if (String(retainedContext.business_name || "").trim()) patch.business_name = retainedContext.business_name;
  if (String(retainedContext.step_0_final || "").trim()) patch.step_0_final = retainedContext.step_0_final;
  if (Object.keys(toRecord(retainedContext.step0_bootstrap)).length) patch.step0_bootstrap = retainedContext.step0_bootstrap;

  for (const stepId of CANONICAL_CONTINUITY_STEP_IDS) {
    const finalField = CANONICAL_FINAL_FIELD_BY_STEP_ID[stepId];
    const retainedFinalValue = String(retainedCanonicalContext.finals[finalField] || "").trim();
    if (hasOwnKey(params.incomingState, finalField) && String(params.incomingState[finalField] || "").trim() === "") {
      patch[finalField] = undefined;
      continue;
    }
    if (retainedFinalValue) {
      patch[finalField] = retainedFinalValue;
      continue;
    }
    if (String(currentCanonicalContext.finals[finalField] || "").trim()) {
      patch[finalField] = undefined;
    }
  }

  const nextAcceptedProvisionalByStep = { ...currentCanonicalContext.provisional_by_step };
  const nextAcceptedProvisionalSources = { ...currentCanonicalContext.provisional_source_by_step };
  for (const stepId of CANONICAL_CONTINUITY_STEP_IDS) {
    if (hasExplicitCanonicalProvisionalClear(params.incomingState, stepId)) {
      delete nextAcceptedProvisionalByStep[stepId];
      delete nextAcceptedProvisionalSources[stepId];
      continue;
    }
    const retainedValue = String(retainedCanonicalContext.provisional_by_step[stepId] || "").trim();
    const retainedSource = String(retainedCanonicalContext.provisional_source_by_step[stepId] || "").trim();
    if (retainedValue && retainedSource) {
      nextAcceptedProvisionalByStep[stepId] = retainedValue;
      nextAcceptedProvisionalSources[stepId] = retainedSource;
      continue;
    }
    delete nextAcceptedProvisionalByStep[stepId];
    delete nextAcceptedProvisionalSources[stepId];
  }
  patch.provisional_by_step = Object.keys(nextAcceptedProvisionalByStep).length > 0
    ? nextAcceptedProvisionalByStep
    : undefined;
  patch.provisional_source_by_step = Object.keys(nextAcceptedProvisionalSources).length > 0
    ? nextAcceptedProvisionalSources
    : undefined;
  return patch;
}

type PayloadQuality = {
  viewMode: string;
  hasUiStrings: boolean;
  hasInteractiveContent: boolean;
  renderable: boolean;
  score: number;
};

type IncomingLivenessSignal = {
  has_liveness: boolean;
  ack_status: ActionAckStatus;
  state_advanced: boolean;
  reason_code: string;
  has_error_object: boolean;
  explicit_error: boolean;
};

type RenderCacheDecision = {
  should_persist: boolean;
  decision_reason: string;
  preserve_safety_reason: string;
};

function evaluatePayloadQuality(result: Record<string, unknown>): PayloadQuality {
  const state = toRecord(result.state);
  const uiPayload = toRecord(result.ui);
  const uiView = toRecord(uiPayload.view);
  const uiContent = toRecord(uiPayload.content);
  const promptObj = toRecord(uiPayload.prompt);
  const specialist = toRecord(result.specialist);
  const viewMode = String(uiView.mode || "").trim().toLowerCase();
  const viewVariant = String(uiView.variant || "").trim();
  const uiStrings = toRecord(state.ui_strings);
  const hasUiStrings = Object.keys(uiStrings).length > 0;
  const hasDreamBuilderStatements =
    (
      uiView.dream_builder_statements_visible === true ||
      (
        (viewVariant === "dream_builder_collect" || viewVariant === "dream_builder_refine") &&
        uiView.dream_builder_statements_visible !== false
      )
    ) &&
    (
      Array.isArray(specialist.statements) && specialist.statements.length > 0 ||
      Array.isArray(state.dream_builder_statements) && state.dream_builder_statements.length > 0
    );
  const hasInteractiveContent =
    String(result.text || "").trim().length > 0 ||
    String(result.prompt || "").trim().length > 0 ||
    String(promptObj.body || "").trim().length > 0 ||
    String(uiPayload.questionText || "").trim().length > 0 ||
    String(uiContent.heading || "").trim().length > 0 ||
    String(uiContent.canonical_text || "").trim().length > 0 ||
    String(uiContent.support_text || "").trim().length > 0 ||
    String(uiContent.feedback_reason_text || "").trim().length > 0 ||
    hasDreamBuilderStatements ||
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

function looksLikeDiagnosticResult(candidateRaw: unknown): boolean {
  const candidate = toRecord(candidateRaw);
  if (!Object.keys(candidate).length) return false;
  if (Object.keys(toRecord(candidate.state)).length > 0) return true;
  if (String(candidate.current_step_id || "").trim()) return true;
  if (String(candidate.ack_status || "").trim()) return true;
  if (String(toRecord(candidate.ui_action_liveness).ack_status || "").trim()) return true;
  if (String(toRecord(toRecord(candidate.state).ui_action_liveness).ack_status || "").trim()) return true;
  return false;
}

function resolveDiagnosticIncomingResult(raw: unknown): Record<string, unknown> {
  const root = toRecord(raw);
  const toolOutput = mergeToolOutputWithResponseMetadata(root.toolOutput, root.toolResponseMetadata);
  const candidates: unknown[] = [
    root,
    root.result,
    toRecord(root.structuredContent).result,
    toolOutput,
    toolOutput.result,
    toRecord(toolOutput.structuredContent).result,
  ];
  for (const candidate of candidates) {
    if (looksLikeDiagnosticResult(candidate)) return toRecord(candidate);
  }
  return {};
}

function buildTupleFailClosedEnvelope(params: {
  currentResult: Record<string, unknown>;
  incomingRaw?: unknown;
  incomingResult?: Record<string, unknown>;
}): Record<string, unknown> {
  const currentState = toRecord(params.currentResult.state);
  const incomingResult = Object.keys(toRecord(params.incomingResult)).length > 0
    ? toRecord(params.incomingResult)
    : resolveDiagnosticIncomingResult(params.incomingRaw);
  const incomingState = toRecord(incomingResult.state);
  const stateSource = Object.keys(incomingState).length > 0 ? incomingState : currentState;
  const currentStep = String(
    incomingState.current_step ||
    incomingResult.current_step_id ||
    currentState.current_step ||
    params.currentResult.current_step_id ||
    "step_0"
  ).trim() || "step_0";
  const language = String(
    stateSource.language || stateSource.ui_strings_lang || stateSource.ui_strings_requested_lang || "en"
  )
    .trim()
    .toLowerCase() || "en";
  const uiStringsRequestedLang = String(
    stateSource.ui_strings_requested_lang || stateSource.ui_strings_lang || language
  ).trim() || language;
  const liveness = readIncomingLivenessSignal(incomingResult);
  const incomingLiveness = toRecord(incomingState.ui_action_liveness);
  const actionCodeEcho = coalesceString(
    incomingResult.action_code_echo,
    incomingState.action_code_echo,
    incomingLiveness.action_code_echo
  ).trim().toUpperCase();
  const clientActionIdEcho = coalesceString(
    incomingResult.client_action_id_echo,
    incomingState.client_action_id_echo,
    incomingLiveness.client_action_id_echo
  );
  const requestId = coalesceString(
    incomingState.request_id,
    incomingState.__request_id,
    incomingResult.request_id,
    incomingResult.__request_id
  );
  const correlationId = coalesceString(
    incomingState.correlation_id,
    incomingState.__correlation_id,
    incomingResult.correlation_id,
    incomingResult.__correlation_id
  );
  const bootstrapSessionId = String(
    stateSource.bootstrap_session_id || currentState.bootstrap_session_id || ""
  ).trim();
  const bootstrapEpoch = parsePositiveInt(stateSource.bootstrap_epoch || currentState.bootstrap_epoch);
  const responseSeq = parsePositiveInt(stateSource.response_seq || currentState.response_seq);
  const hostWidgetSessionId = String(
    stateSource.host_widget_session_id || currentState.host_widget_session_id || ""
  ).trim();
  const failClosedState: Record<string, unknown> = {
    current_step: currentStep,
    started: String(stateSource.started || currentState.started || "false").trim().toLowerCase() === "true" ? "true" : "false",
    language,
    ui_strings_status: String(stateSource.ui_strings_status || currentState.ui_strings_status || "pending")
      .trim()
      .toLowerCase() || "pending",
    ui_strings_lang: String(stateSource.ui_strings_lang || currentState.ui_strings_lang || language)
      .trim()
      .toLowerCase() || language,
    ui_strings_requested_lang: uiStringsRequestedLang,
    ui_gate_status: "blocked",
    ui_gate_reason: "contract_violation",
    bootstrap_phase: "failed",
    reason_code: "incoming_missing_widget_result",
  };
  if (bootstrapSessionId) failClosedState.bootstrap_session_id = bootstrapSessionId;
  if (bootstrapEpoch > 0) failClosedState.bootstrap_epoch = bootstrapEpoch;
  if (responseSeq > 0) failClosedState.response_seq = responseSeq;
  if (hostWidgetSessionId) failClosedState.host_widget_session_id = hostWidgetSessionId;
  if (requestId) failClosedState.request_id = requestId;
  if (correlationId) failClosedState.correlation_id = correlationId;
  if (Object.keys(toRecord(stateSource.ui_strings)).length > 0) {
    failClosedState.ui_strings = toRecord(stateSource.ui_strings);
  } else if (Object.keys(toRecord(currentState.ui_strings)).length > 0) {
    failClosedState.ui_strings = toRecord(currentState.ui_strings);
  }
  if (liveness.has_liveness || actionCodeEcho || clientActionIdEcho) {
    failClosedState.ui_action_liveness = {
      ...(liveness.has_liveness ? {
        ack_status: liveness.ack_status,
        state_advanced: liveness.state_advanced,
        reason_code: liveness.reason_code,
      } : {}),
      ...(actionCodeEcho ? { action_code_echo: actionCodeEcho } : {}),
      ...(clientActionIdEcho ? { client_action_id_echo: clientActionIdEcho } : {}),
    };
  }
  return {
    _meta: {
      widget_result: {
        current_step_id: currentStep,
        ok: false,
        error: {
          type: "contract_violation",
          message: "Canonical widget payload is missing in tool response.",
          reason: "incoming_missing_widget_result",
        },
        ...(liveness.has_liveness ? {
          ack_status: liveness.ack_status,
          state_advanced: liveness.state_advanced,
          reason_code: liveness.reason_code,
        } : {}),
        ...(actionCodeEcho ? { action_code_echo: actionCodeEcho } : {}),
        ...(clientActionIdEcho ? { client_action_id_echo: clientActionIdEcho } : {}),
        state: failClosedState,
        ui: {
          flags: {
            bootstrap_waiting_locale: false,
            bootstrap_interactive_ready: false,
            tuple_incomplete_fail_closed: true,
            tuple_fail_closed_reason: "incoming_missing_widget_result",
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

function readIncomingLivenessSignal(result: Record<string, unknown>): IncomingLivenessSignal {
  const state = toRecord(result.state);
  const stateLiveness = toRecord(state.ui_action_liveness);
  const ackRaw = coalesceString(result.ack_status, state.ack_status, stateLiveness.ack_status);
  const hasLiveness = ackRaw.length > 0;
  const ackStatus = hasLiveness ? normalizeActionAckStatus(ackRaw) : "rejected";
  const stateAdvanced = parseBool(
    result.state_advanced ?? state.state_advanced ?? stateLiveness.state_advanced ?? false
  );
  const reasonCode = coalesceString(
    result.reason_code,
    state.reason_code,
    stateLiveness.reason_code
  )
    .trim()
    .toLowerCase();
  const hasErrorObject = Object.keys(toRecord(result.error)).length > 0;
  const explicitError =
    hasErrorObject ||
    (hasLiveness && (ackStatus !== "accepted" || !stateAdvanced));
  return {
    has_liveness: hasLiveness,
    ack_status: ackStatus,
    state_advanced: stateAdvanced,
    reason_code: hasLiveness ? (stateAdvanced ? "" : (reasonCode || "state_not_advanced")) : "",
    has_error_object: hasErrorObject,
    explicit_error: explicitError,
  };
}

function resolveCachePreserveSafety(params: {
  source: IngestSource;
  orderingReason: string;
  incoming: PayloadQuality;
  incomingSignal: IncomingLivenessSignal;
}): { allowPreserve: boolean; reason: string } {
  if (params.source === "call_run_step") {
    return { allowPreserve: false, reason: "unsafe_active_dispatch" };
  }
  if (params.orderingReason === "new_session" || params.orderingReason === "new_epoch") {
    return { allowPreserve: false, reason: "unsafe_new_scope" };
  }
  if (params.incomingSignal.explicit_error) {
    return { allowPreserve: false, reason: "unsafe_explicit_error" };
  }
  if (params.incoming.viewMode === "blocked" || params.incoming.viewMode === "failed") {
    return { allowPreserve: false, reason: "unsafe_terminal_view" };
  }
  return { allowPreserve: true, reason: "safe_passive_non_renderable" };
}

function shouldUpdateRenderCache(params: {
  source: IngestSource;
  currentHasPayload: boolean;
  incoming: PayloadQuality;
  current: PayloadQuality;
  incomingSignal: IncomingLivenessSignal;
  orderingReason: string;
}): RenderCacheDecision {
  if (!params.currentHasPayload) {
    return {
      should_persist: true,
      decision_reason: "no_current_cache",
      preserve_safety_reason: "not_applicable",
    };
  }
  if (params.orderingReason === "new_session" || params.orderingReason === "new_epoch") {
    return {
      should_persist: true,
      decision_reason: params.orderingReason,
      preserve_safety_reason: "not_applicable",
    };
  }
  if (params.current.renderable && !params.incoming.renderable) {
    const preserveSafety = resolveCachePreserveSafety({
      source: params.source,
      orderingReason: params.orderingReason,
      incoming: params.incoming,
      incomingSignal: params.incomingSignal,
    });
    return {
      should_persist: !preserveSafety.allowPreserve,
      decision_reason: preserveSafety.allowPreserve ? "preserve_cache" : "force_persist_non_renderable",
      preserve_safety_reason: preserveSafety.reason,
    };
  }
  if (params.incoming.renderable && !params.current.renderable) {
    return {
      should_persist: true,
      decision_reason: "incoming_renderable_upgrade",
      preserve_safety_reason: "not_applicable",
    };
  }
  if (params.incoming.renderable && params.current.renderable) {
    return {
      should_persist: params.incoming.score >= params.current.score,
      decision_reason:
        params.incoming.score >= params.current.score ? "incoming_score_not_lower" : "incoming_score_lower",
      preserve_safety_reason: "not_applicable",
    };
  }
  return {
    should_persist: params.incoming.score >= params.current.score,
    decision_reason:
      params.incoming.score >= params.current.score ? "incoming_score_not_lower" : "incoming_score_lower",
    preserve_safety_reason: "not_applicable",
  };
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
  dispatchActionContractReady();
}

function dispatchActionContractReady(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("bsc:action_contract_ready"));
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

export function readWidgetStateOrderingSnapshot(): WidgetStateOrderingSnapshot {
  const ordering = readBootstrapOrderingState(widgetState());
  return {
    bootstrap_session_id: ordering.sessionId,
    bootstrap_epoch: ordering.epoch,
    response_seq: ordering.responseSeq,
    host_widget_session_id: ordering.hostWidgetSessionId,
    tuple_complete: hasValidBootstrapOrdering(ordering),
  };
}

export function logWidgetStateRehydrateMarker(params: {
  phase: "before_reload_probe" | "after_reload_probe" | "before_host_ingest" | "after_host_ingest";
  source: "startup" | "set_globals" | "host_notification";
  event?: string;
}): WidgetStateOrderingSnapshot {
  const snapshot = readWidgetStateOrderingSnapshot();
  console.log("[ui_widgetstate_rehydrate]", {
    phase: params.phase,
    source: params.source,
    event: String(params.event || ""),
    ...snapshot,
  });
  return snapshot;
}

export function setWidgetStateSafe(patch: Record<string, unknown> | null): void {
  const o = oa();
  if (!o || typeof (o as { setWidgetState?: (s: Record<string, unknown>) => void }).setWidgetState !== "function")
    return;
  const ws = widgetState() || {};
  const next = { ...ws, ...(patch || {}) };
  const orderingKeys = ["bootstrap_session_id", "bootstrap_epoch", "response_seq", "host_widget_session_id"];
  const includesOrderingPatch = orderingKeys.some((key) => Object.prototype.hasOwnProperty.call(patch || {}, key));
  const orderingBefore = readBootstrapOrderingState(ws);
  const keys = Object.keys(next);
  const stableSerialize = (value: unknown, seen = new WeakSet<object>()): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    const type = typeof value;
    if (type !== "object") return `${type}:${String(value)}`;
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableSerialize(entry, seen)).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${stableSerialize(record[key], seen)}`).join(",")}}`;
  };
  let changed = false;
  for (const k of keys) {
    if (stableSerialize(ws[k]) !== stableSerialize(next[k])) {
      changed = true;
      break;
    }
  }
  if (!changed) {
    if (includesOrderingPatch) {
      console.log("[ui_widgetstate_persist_skipped_no_change]", {
        reason: "no_change",
        current_tuple: describeBootstrapOrdering(orderingBefore),
        incoming_tuple: describeBootstrapOrdering(readBootstrapOrderingState(next)),
      });
    }
    return;
  }
  try {
    (o as { setWidgetState: (s: Record<string, unknown>) => void }).setWidgetState(next);
    if (includesOrderingPatch) {
      const finalOrdering = readBootstrapOrderingState(next);
      console.log("[ui_widgetstate_persist_applied]", {
        reason: "applied",
        previous_tuple: describeBootstrapOrdering(orderingBefore),
        next_tuple: describeBootstrapOrdering(finalOrdering),
      });
    }
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

export type ActionLivenessFailureClass =
  | "none"
  | "timeout"
  | "rejected"
  | "dropped"
  | "accepted_no_advance";

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
    source?: IngestSource;
    is_poll_response?: boolean;
    client_action_id?: string;
    request_id?: string;
  }
): Record<string, unknown> {
  const source: IngestSource = opts?.source || "unknown";
  const normalizedResult = normalizeToolResult(raw);
  let normalized = normalizedResult.normalized;
  if (!Object.keys(normalized).length) {
    const resolvedForDrop = resolveWidgetPayload(raw);
    const ingestContext = buildClientIngestContext({
      raw,
      resolved: resolvedForDrop,
      fallbackClientActionId: opts?.client_action_id,
      fallbackRequestId: opts?.request_id,
    });
    logClientIngestObservation({
      source,
      phase: "dropped_no_widget_result",
      context: ingestContext,
    });
    console.warn("[ui_ingest_dropped_no_widget_result]", {
      source,
      payload_source: normalizedResult.source,
      payload_reason_code: normalizedResult.reasonCode,
      correlation_id: ingestContext.correlation_id,
      client_action_id: ingestContext.client_action_id,
      request_id: ingestContext.request_id,
      client_ingest_ts_ms: ingestContext.client_ingest_ts_ms,
      client_ingest_seq: ingestContext.client_ingest_seq,
      payload_shape_fingerprint: ingestContext.payload_shape_fingerprint,
    });
    if (source === "call_run_step") {
      const failClosedEnvelope = buildTupleFailClosedEnvelope({
        currentResult: resolveWidgetPayload(getLastToolOutput()).result,
        incomingRaw: raw,
      });
      const failClosedResolved = resolveWidgetPayload(failClosedEnvelope);
      console.warn("[ui_ingest_fail_closed_missing_widget_result]", {
        source,
        correlation_id: ingestContext.correlation_id,
        client_action_id: ingestContext.client_action_id,
        request_id: ingestContext.request_id,
        client_ingest_ts_ms: ingestContext.client_ingest_ts_ms,
        client_ingest_seq: ingestContext.client_ingest_seq,
        payload_shape_fingerprint: ingestContext.payload_shape_fingerprint,
        fail_closed_reason: "incoming_missing_widget_result",
        fail_closed_step: String(
          toRecord(failClosedResolved.result.state).current_step || failClosedResolved.result.current_step_id || ""
        ),
      });
      normalized = failClosedEnvelope;
    } else {
      const cached = getLastToolOutput();
      if (Object.keys(cached).length > 0) {
        normalized = cached;
      } else {
        if (_render) _render(raw);
        return resolvedForDrop.result;
      }
    }
  }
  const resolved = resolveWidgetPayload(normalized);
  const ingestContext = buildClientIngestContext({
    raw,
    resolved,
    fallbackClientActionId: opts?.client_action_id,
    fallbackRequestId: opts?.request_id,
  });
  logClientIngestObservation({
    source,
    phase: "received",
    context: ingestContext,
  });
  const result = resolved.result;
  const currentWidget = widgetState();
  const currentOrdering = readBootstrapOrderingState(currentWidget);
  const incomingOrderingRaw: BootstrapOrderingState = {
    sessionId: resolved.bootstrap_session_id,
    epoch: resolved.bootstrap_epoch,
    responseSeq: resolved.response_seq,
    hostWidgetSessionId: resolved.host_widget_session_id,
  };
  const incomingOrdering = incomingOrderingRaw;
  const incomingHasOrdering = hasValidBootstrapOrdering(incomingOrdering);
  const continuityPatch = buildWidgetStateContinuityPatch({
    currentWidgetState: currentWidget,
    incomingState: toRecord(result.state),
  });
  const widgetPatch: Record<string, unknown> = {
    ...continuityPatch,
  };
  if (incomingHasOrdering) {
    widgetPatch.bootstrap_session_id = incomingOrdering.sessionId;
    widgetPatch.bootstrap_epoch = incomingOrdering.epoch;
    widgetPatch.response_seq = incomingOrdering.responseSeq;
    widgetPatch.host_widget_session_id = incomingOrdering.hostWidgetSessionId;
  }
  if (Object.keys(widgetPatch).length > 0) {
    setWidgetStateSafe(widgetPatch);
  }
  setLastToolOutput(normalized);
  if (_render) _render(normalized);
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
      current_tuple: describeBootstrapOrdering(currentOrdering),
      incoming_tuple: describeBootstrapOrdering(incomingOrdering),
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

function actionLivenessFailureClass(liveness: {
  ack_status: string;
  state_advanced: boolean;
}): ActionLivenessFailureClass {
  const ackStatus = normalizeActionAckStatus(liveness.ack_status);
  if (ackStatus === "timeout") return "timeout";
  if (ackStatus === "dropped") return "dropped";
  if (ackStatus === "rejected") return "rejected";
  if (ackStatus === "accepted" && !liveness.state_advanced) return "accepted_no_advance";
  return "none";
}

export function resolveActionLivenessNotice(
  state: Record<string, unknown> | null | undefined,
  liveness: {
    ack_status: string;
    state_advanced: boolean;
    reason_code: string;
  }
): {
  failure_class: ActionLivenessFailureClass;
  reason_code: string;
  message: string;
} {
  const failureClass = actionLivenessFailureClass(liveness);
  const reasonCode = String(liveness.reason_code || "").trim().toLowerCase() || "state_not_advanced";
  if (failureClass === "timeout") {
    return {
      failure_class: failureClass,
      reason_code: reasonCode || "timeout",
      message: uiText(state || {}, "transient.timeout", ""),
    };
  }
  if (failureClass === "rejected" && reasonCode.includes("rate_limit")) {
    return {
      failure_class: failureClass,
      reason_code: reasonCode,
      message: uiText(state || {}, "transient.rate_limited", ""),
    };
  }
  if (failureClass === "dropped" || failureClass === "rejected" || failureClass === "accepted_no_advance") {
    const base = uiText(state || {}, "error.contract.body", "");
    const message = base ? `${base} (${reasonCode})` : reasonCode;
    return {
      failure_class: failureClass,
      reason_code: reasonCode,
      message,
    };
  }
  return { failure_class: "none", reason_code: "", message: "" };
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
  const latestSnapshot = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const latestState = toRecord(latestSnapshot.state);
  const persistedWidgetState = widgetState();
  const activeClientState = retainCanonicalStepContinuity(
    Object.keys(latestState).length > 0 ? latestState : persistedWidgetState,
    latestState,
    persistedWidgetState
  );
  const transportStatus = resolveTransportStatus();
  const hasCallTool = transportStatus === "ready_callTool";
  const hasBridgePath =
    transportStatus === "ready_bridge" || transportStatus === "unknown";
  if (!hasCallTool && !hasBridgePath) {
    const livenessState = Object.assign({}, activeClientState, persistedWidgetState);
    if (cleanExtraState && typeof cleanExtraState === "object") {
      Object.assign(livenessState, cleanExtraState);
    }
    const clientActionId = ensureClientActionIdOnState(
      livenessState as Record<string, unknown>,
      messageText || "TEXT_INPUT"
    );
    const actionCodeEcho = String(messageText || "TEXT_INPUT").trim().toUpperCase();
    const livenessNotice = resolveActionLivenessNotice(livenessState as Record<string, unknown>, {
      ack_status: "rejected",
      state_advanced: false,
      reason_code: "transport_unavailable",
    });
    const unavailablePatch: Record<string, unknown> = {
      __client_action_id: clientActionId,
      ui_action_liveness_ack_status: "rejected",
      ui_action_liveness_state_advanced: "false",
      ui_action_liveness_reason_code: "transport_unavailable",
      ui_action_liveness_failure_class: livenessNotice.failure_class,
      ui_action_liveness_action_code: actionCodeEcho,
      ui_action_liveness_client_action_id: clientActionId,
    };
    if (isStartAction) {
      unavailablePatch.start_dispatch_state = "failed";
      unavailablePatch.transport_ready = "false";
    }
    setWidgetStateSafe(unavailablePatch);
    console.warn("[ui_transport_unavailable]", {
      action_code: messageText,
      transport_status: transportStatus,
    });
    setInlineNotice(
      uiText((cleanExtraState as Record<string, unknown>) || {}, "transient.connection_failed", "")
    );
    console.warn("run_step: host did not provide callTool or MCP bridge");
    const errEl = document.getElementById("cardDesc");
    const state = latestState;
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

  const state =
    Object.keys(activeClientState).length > 0
      ? activeClientState
      : { current_step: "step_0" };

  const baseState = state;
  const ws = persistedWidgetState;
  let nextState = Object.assign({}, baseState);
  if (cleanExtraState && typeof cleanExtraState === "object") {
    nextState = Object.assign({}, nextState, cleanExtraState);
  }
  nextState = retainCanonicalStepContinuity(nextState, activeClientState, ws);
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
  const requestCorrelationId = coalesceString(
    (nextState as Record<string, unknown>).correlation_id,
    (nextState as Record<string, unknown>).__correlation_id,
    requestId
  );
  const requestTransport = hasCallTool ? "callTool" : "bridge";
  const startedAt = Date.now();
  const debugCalls = isDevEnv();
  console.log("[ui_calltool_request_shape]", {
    correlation_id: requestCorrelationId,
    client_action_id: clientActionId,
    request_id: requestId,
    action_code: String(messageText || "").trim().toUpperCase(),
    transport_status: transportStatus,
    transport_primary: requestTransport,
    request_shape_fingerprint: shapeFingerprint(payload),
    payload_source: "pre_resolve",
    payload_reason_code: "pre_resolve",
  });
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
    if (isStartAction) {
      setWidgetStateSafe({
        start_dispatch_state: "failed",
        transport_ready: "true",
      });
    }
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
    const responseCorrelation = resolveClientCorrelation({
      raw: normalizedRaw,
      result: directResult,
      fallbackClientActionId: clientActionId,
      fallbackRequestId: requestId,
    });
    console.log("[ui_calltool_response_shape]", {
      correlation_id: responseCorrelation.correlation_id,
      client_action_id: responseCorrelation.client_action_id,
      request_id: responseCorrelation.request_id,
      action_code: String(messageText || "").trim().toUpperCase(),
      transport_used: transportUsed,
      response_shape_fingerprint: shapeFingerprint(normalizedRaw),
      payload_source: resolvedResponse.source,
      payload_reason_code: resolvedResponse.source_reason_code,
    });
    const ingestedResult = handleToolResultAndMaybeScheduleBootstrapRetry(normalizedRaw, {
      source: "call_run_step",
      client_action_id: clientActionId,
      request_id: requestId,
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
    const fallbackStateAdvanced =
      result?.ok === false
        ? false
        : (hasIngestedResult && (orderingAdvanced || stepAdvanced));
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
    const livenessNotice = resolveActionLivenessNotice(nextState as Record<string, unknown>, liveness);
    const hasExplicitError = livenessNotice.failure_class !== "none";
    console.log("[ui_action_liveness_ack]", {
      action_code: liveness.action_code_echo,
      client_action_id: liveness.client_action_id_echo,
      correlation_id: responseCorrelation.correlation_id,
      request_id: responseCorrelation.request_id,
      ack_status: liveness.ack_status,
      state_advanced: liveness.state_advanced,
      reason_code: liveness.reason_code,
      failure_class: livenessNotice.failure_class,
      payload_source: resolvedResponse.source,
      payload_reason_code: resolvedResponse.source_reason_code,
      ordering_before: describeBootstrapOrdering(orderingBeforeIngest),
      ordering_after: describeBootstrapOrdering(orderingAfterIngest),
    });
    setWidgetStateSafe({
      ui_action_liveness_ack_status: liveness.ack_status,
      ui_action_liveness_state_advanced: liveness.state_advanced ? "true" : "false",
      ui_action_liveness_reason_code: liveness.reason_code,
      ui_action_liveness_failure_class: livenessNotice.failure_class,
      ui_action_liveness_action_code: liveness.action_code_echo,
      ui_action_liveness_client_action_id: liveness.client_action_id_echo,
    });
    if (hasExplicitError) {
      console.warn("[ui_action_liveness_explicit_error]", {
        action_code: liveness.action_code_echo,
        client_action_id: liveness.client_action_id_echo,
        ack_status: liveness.ack_status,
        reason_code: liveness.reason_code,
        failure_class: livenessNotice.failure_class,
      });
      if (transientRetryError && errorObj?.type === "rate_limited") {
        setInlineNotice(errorObj.user_message || uiText(nextState, "transient.rate_limited", ""));
        lockRateLimit(errorObj.retry_after_ms ?? 1500);
      } else if (transientRetryError && errorObj?.type === "timeout") {
        setInlineNotice(errorObj.user_message || uiText(nextState, "transient.timeout", ""));
      } else {
        setInlineNotice(livenessNotice.message);
      }
      if (liveness.ack_status === "accepted" && !liveness.state_advanced) {
        console.warn("[ui_action_dispatch_ack_without_state_advance]", {
          action_code: String(messageText || "").trim().toUpperCase(),
          correlation_id: responseCorrelation.correlation_id,
          client_action_id: liveness.client_action_id_echo,
          request_id: responseCorrelation.request_id,
          response_ingested: hasIngestedResult,
          ordering_advanced: orderingAdvanced,
          payload_source: resolvedResponse.source,
          payload_reason_code: resolvedResponse.source_reason_code,
          response_view_mode: responseViewMode,
          failure_class: livenessNotice.failure_class,
          preserve_expected_visible_error: true,
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
      if (transientRetryError) return;
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
