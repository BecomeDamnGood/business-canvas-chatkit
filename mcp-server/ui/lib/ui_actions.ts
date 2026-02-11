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
  if (!bridgeEnabled) return false;
  if (typeof window === "undefined") return false;
  return Boolean(window.parent);
}

function normalizeToolOutput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as { structuredContent?: unknown };
  if (r.structuredContent && typeof r.structuredContent === "object") {
    return r.structuredContent as Record<string, unknown>;
  }
  return raw as Record<string, unknown>;
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
  const oo = o as { toolOutput?: unknown };
  return (
    Boolean(o && oo.toolOutput) ||
    Boolean(getLastToolOutput() && Object.keys(getLastToolOutput()).length)
  );
}

/** Allow render() to use callTool return value, otherwise fall back to host toolOutput / cache. */
export function toolData(overrideRaw?: unknown): Record<string, unknown> {
  if (overrideRaw) return normalizeToolOutput(overrideRaw);
  const o = oa();
  const oo = o as { toolOutput?: unknown };
  if (o && oo.toolOutput) return normalizeToolOutput(oo.toolOutput);
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
  return languageFromState(resultState) || "en";
}

export function ensureLanguageInState(
  state: Record<string, unknown> | null | undefined,
  lang: string
): Record<string, unknown> {
  const current = state?.language ? String(state.language).trim() : "";
  if (current) return state || {};
  return Object.assign({}, state || {}, { language: lang });
}

let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
let lastCallAt = 0;
const CLICK_DEBOUNCE_MS = 250;
const RUN_STEP_TIMEOUT_MS = 25000;

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

async function callToolViaBridge(name: string, args: unknown): Promise<unknown> {
  if (!canUseBridge() || typeof window === "undefined") {
    throw new Error("bridge unavailable");
  }
  const id = `bsc_${Date.now()}_${++bridgeSeq}`;
  const message = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
  return new Promise((resolve, reject) => {
    pendingBridgeCalls.set(id, { resolve, reject });
    try {
      window.parent.postMessage(message, "*");
    } catch (e) {
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

  const badge = document.getElementById("badge");
  if (badge) badge.classList.toggle("loading", loading);

  const inputEl = document.getElementById("input");
  const sendEl = document.getElementById("send");
  const btnStart = document.getElementById("btnStart") as HTMLButtonElement | null;
  const btnOk = document.getElementById("btnOk") as HTMLButtonElement | null;
  const btnGoToNextStep = document.getElementById("btnGoToNextStep") as HTMLButtonElement | null;
  const btnStartDreamExercise = document.getElementById("btnStartDreamExercise") as HTMLButtonElement | null;
  const btnSwitchToSelfDream = document.getElementById("btnSwitchToSelfDream") as HTMLButtonElement | null;

  if (inputEl) (inputEl as HTMLInputElement).disabled = loading;
  if (sendEl) (sendEl as HTMLButtonElement).disabled = loading;
  if (btnStart) btnStart.disabled = loading;
  if (btnOk) btnOk.disabled = loading;
  if (btnGoToNextStep) btnGoToNextStep.disabled = loading;
  if (btnStartDreamExercise) btnStartDreamExercise.disabled = loading;
  if (btnSwitchToSelfDream) btnSwitchToSelfDream.disabled = loading;

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
  if (!hasCallTool && !canUseBridge()) {
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
  if (String(message || "").trim() === "") {
    if (hasToolOutput) return;
    if (!persistedStarted) return;
  }

  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const state = latest.state || { current_step: "step_0" };

  const lang =
    uiLang(state) || (typeof navigator !== "undefined" ? (navigator.language || "en").slice(0, 2).toLowerCase() : "en");
  let nextState = ensureLanguageInState(state, lang);
  if (extraState && typeof extraState === "object") {
    nextState = Object.assign({}, nextState, extraState);
  }

  setWidgetStateSafe({ language: nextState.language, started: "true" });

  const payload = {
    current_step_id: nextState.current_step || "step_0",
    user_message: String(message || ""),
    input_mode: "widget",
    state: nextState,
  };

  setLoading(true);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let didTimeout = false;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      if (controller) controller.abort();
      reject(new Error("run_step timeout"));
    }, RUN_STEP_TIMEOUT_MS);
  });

  try {
    const callPromise = canUseBridge()
      ? callToolViaBridge("run_step", payload)
      : (o as { callTool: (name: string, args: unknown, opts?: unknown) => Promise<unknown> }).callTool(
          "run_step",
          payload,
          controller ? { signal: controller.signal } : undefined
        );
    const resp = await Promise.race([callPromise, timeoutPromise]);
    const normalized = applyToolResult(resp);
    if (_render) _render(normalized);
  } catch (e) {
    const msg = (e && (e as Error).message) ? String((e as Error).message) : "";
    const isTimeout =
      msg.toLowerCase().includes("timeout") ||
      (e && (e as Error).name === "AbortError") ||
      (e && (e as { type?: string }).type === "timeout");
    if (isTimeout || didTimeout) {
      setInlineNotice("This is taking longer than usual. Please try again.");
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
    setLoading(false);
  }
}
