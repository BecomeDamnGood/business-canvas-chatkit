/**
 * Main entry point: wire modules, attach event listeners, init.
 */

import { t } from "./ui_constants.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";
import {
  initActionsConfig,
  callRunStep,
  handleToolResultAndMaybeScheduleBootstrapRetry,
  handleBridgeResponse,
  isTrustedBridgeMessageEvent,
  mergeToolOutputWithResponseMetadata,
  notifyHostTransportSignal,
  resolveAllowedHostOrigin,
  setBridgeEnabled,
  setSendEnabled,
  setInlineNotice,
  setLoading,
} from "./ui_actions.js";
import { render } from "./ui_render.js";

initActionsConfig({ render, t });

const isLocalDev = (globalThis as Record<string, unknown>).LOCAL_DEV === "1";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function latestWidgetState(): Record<string, unknown> {
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown>; lang?: string } }).__BSC_LATEST__;
  const state = latest?.state;
  return state && typeof state === "object" ? state : {};
}

function latestWidgetLang(): string {
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown>; lang?: string } }).__BSC_LATEST__;
  const state = latestWidgetState();
  return String(latest?.lang || state.ui_strings_lang || state.language || "en")
    .trim()
    .toLowerCase();
}

function uiStringFromContract(key: string): string {
  return String(t(latestWidgetLang(), key) || "").trim();
}

function actionCodeFromState(stateKey: string): string {
  const state = latestWidgetState();
  return String(state[stateKey] || "").trim();
}

function isWidgetResultLike(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return false;
  const state = rec.state;
  if (state !== undefined && (typeof state !== "object" || state === null || Array.isArray(state))) {
    return false;
  }
  const widgetLikeKeys = new Set([
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
  return keys.some((key) => widgetLikeKeys.has(key));
}

function normalizeHostToolResultNotification(paramsRaw: unknown): Record<string, unknown> {
  const params = toRecord(paramsRaw);
  const directCandidate = params;
  const resultCandidate = toRecord(params.result);
  const toolOutputCandidate = params.toolOutput;
  const metadata = toRecord(params.toolResponseMetadata);
  if (isWidgetResultLike(directCandidate)) {
    if (Object.keys(resultCandidate).length > 0 || Object.keys(toRecord(toolOutputCandidate)).length > 0) {
      console.warn("[host_tool_result_mixed_shape_used]", {
        has_direct_result: true,
        has_result_wrapper: Object.keys(resultCandidate).length > 0,
        has_tool_output: Object.keys(toRecord(toolOutputCandidate)).length > 0,
      });
    }
    return mergeToolOutputWithResponseMetadata(directCandidate, metadata);
  }
  if (Object.keys(resultCandidate).length > 0) {
    if (Object.keys(toRecord(toolOutputCandidate)).length > 0) {
      console.warn("[host_tool_result_mixed_shape_used]", {
        has_result: true,
        has_tool_output: true,
      });
    }
    return mergeToolOutputWithResponseMetadata(resultCandidate, metadata);
  }
  if (Object.keys(metadata).length > 0 || Object.keys(toRecord(toolOutputCandidate)).length > 0) {
    console.warn("[host_tool_result_legacy_shape_used]", {
      has_result: false,
      has_tool_output: Object.keys(toRecord(toolOutputCandidate)).length > 0,
      has_tool_response_metadata: Object.keys(metadata).length > 0,
    });
  }
  return mergeToolOutputWithResponseMetadata(toolOutputCandidate, metadata);
}

function ingestHostPayload(
  payload: unknown,
  source: "set_globals" | "host_notification"
): void {
  clearStartupGrace();
  if (source === "set_globals") {
    handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });
    return;
  }
  handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "host_notification" });
}

const STARTUP_GRACE_MS_DEFAULT = 320;
const STARTUP_WAITING_VIEW_MODE = "waiting_locale";

function startupGraceMs(): number {
  const raw = Number((globalThis as Record<string, unknown>).__BSC_STARTUP_GRACE_MS ?? STARTUP_GRACE_MS_DEFAULT);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.min(1500, Math.trunc(raw)));
}

function setStartupGraceUntil(untilMs: number): void {
  (globalThis as Record<string, unknown>).__BSC_STARTUP_GRACE_UNTIL_MS = untilMs;
}

function clearStartupGrace(): void {
  (globalThis as Record<string, unknown>).__BSC_STARTUP_GRACE_UNTIL_MS = 0;
}

function buildStartupInitState(): Record<string, unknown> {
  const language = latestWidgetLang() || "en";
  return {
    state: {
      current_step: "step_0",
      started: "false",
      language,
      ui_gate_status: STARTUP_WAITING_VIEW_MODE,
      ui_strings_status: "pending",
    },
    ui: {
      flags: {
        bootstrap_waiting_locale: true,
        bootstrap_interactive_ready: false,
        interactive_fallback_active: false,
      },
      view: {
        mode: STARTUP_WAITING_VIEW_MODE,
        waiting_locale: true,
      },
    },
  };
}

function readSetGlobalsPayloadFromHost(): Record<string, unknown> {
  const host = (globalThis as Record<string, unknown>).openai as
    | { toolOutput?: unknown; toolResponseMetadata?: unknown }
    | undefined;
  return mergeToolOutputWithResponseMetadata(host?.toolOutput, host?.toolResponseMetadata);
}

function tryInitialIngestFromHost(source: "set_globals" | "host_notification"): boolean {
  const payload = readSetGlobalsPayloadFromHost();
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return false;
  ingestHostPayload(payload, source);
  notifyHostTransportSignal("set_globals");
  return true;
}

function renderStartupWaitShell(reason: string): void {
  const graceMs = startupGraceMs();
  const startupInitState = buildStartupInitState();
  if (graceMs <= 0) {
    render(startupInitState);
    return;
  }
  const untilMs = Date.now() + graceMs;
  setStartupGraceUntil(untilMs);
  console.log("[startup_first_render_wait_shell]", {
    reason,
    grace_ms: graceMs,
  });
  render(startupInitState);
  setTimeout(() => {
    if (Date.now() < untilMs) return;
    clearStartupGrace();
    if (!tryInitialIngestFromHost("set_globals")) {
      console.log("[startup_payload_missing_after_grace]", {
        grace_ms: graceMs,
      });
      render(startupInitState);
    }
  }, graceMs);
}

if (isLocalDev && typeof window !== "undefined") {
  const reportDevError = (message: string, file?: string, line?: number, col?: number) => {
    const target =
      document.getElementById("status") ||
      document.getElementById("uiSubtitle");
    if (!target) return;
    const parts = [message];
    if (file) parts.push(`@ ${file}${line ? ":" + line : ""}${col ? ":" + col : ""}`);
    const prefix = uiStringFromContract("dev.error.prefix");
    target.textContent = `${prefix} ${parts.join(" ")}`.trim();
  };

  window.addEventListener("error", (e) => {
    console.error(
      "[ui_error]",
      (e as ErrorEvent)?.message,
      (e as ErrorEvent)?.filename,
      (e as ErrorEvent)?.lineno,
      (e as ErrorEvent)?.colno,
      (e as ErrorEvent)?.error?.stack
    );
    reportDevError(
      String((e as ErrorEvent)?.message || uiStringFromContract("dev.error.unknown")),
      (e as ErrorEvent)?.filename,
      (e as ErrorEvent)?.lineno,
      (e as ErrorEvent)?.colno
    );
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent)?.reason;
    console.error(
      "[ui_rejection]",
      (reason && reason.message) ? reason.message : reason,
      reason && reason.stack ? reason.stack : ""
    );
    reportDevError(
      String((reason && reason.message) ? reason.message : reason || uiStringFromContract("dev.error.unhandled_rejection"))
    );
  });
}

if (typeof window !== "undefined") {
  resolveAllowedHostOrigin();
  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedBridgeMessageEvent(e)) return;
    const data: any = e?.data;
    if (!data || typeof data !== "object") return;
    if (data.jsonrpc !== "2.0") return;
    const method = typeof data.method === "string" ? data.method : "";
    if (method.startsWith("ui/")) {
      setBridgeEnabled(true);
      notifyHostTransportSignal("bridge_message");
    }
    if (method === "ui/notifications/tool-result") {
      const payload = normalizeHostToolResultNotification(data.params);
      try {
        ingestHostPayload(payload, "host_notification");
        notifyHostTransportSignal("host_notification");
      } catch (err) {
        console.error(err);
      } finally {
        if (getIsLoading()) setLoading(false);
      }
      return;
    }
    if (data.id) {
      handleBridgeResponse(data);
      return;
    }
  });
}

function syncSendButtonState(input: HTMLTextAreaElement | null): void {
  if (!input || getIsLoading()) return;
  const inputVal = (input.value || "").trim();
  setSendEnabled(inputVal.length > 0);
}

function submitWidgetInput(): void {
  if (getIsLoading()) return;
  const input = document.getElementById("input") as HTMLTextAreaElement | null;
  const inputVal = (input?.value || "").trim();
  if (!inputVal) return;

  const st = latestWidgetState();
  const submitActionCode = String(st.ui_action_text_submit || "").trim();
  const submitPayloadMode = String(st.ui_action_text_submit_payload_mode || "text").trim().toLowerCase();
  if (!submitActionCode) {
    console.warn("[ui_action_missing]", { state_key: "ui_action_text_submit" });
    setInlineNotice(
      uiStringFromContract("error.contract.body") || "Please refresh and try again."
    );
    return;
  }

  const win = globalThis as unknown as { __dreamScoringScores?: unknown[][] };
  const shouldSubmitScores = submitPayloadMode === "scores";

  if (shouldSubmitScores) {
    const scoringScores = win.__dreamScoringScores || [];
    const payloadScores: number[][] = [];
    for (let ci = 0; ci < scoringScores.length; ci++) {
      const row = (scoringScores[ci] || []) as unknown[];
      const normRow: number[] = [];
      for (let si = 0; si < row.length; si++) {
        const v = Number(row[si]);
        normRow.push(isNaN(v) ? 0 : Math.max(1, Math.min(10, v)));
      }
      payloadScores.push(normRow);
    }
    if (input) input.value = "";
    setSendEnabled(false);
    win.__dreamScoringScores = [];
    callRunStep(submitActionCode, { __pending_scores: payloadScores });
    return;
  }

  if (input) input.value = "";
  setSendEnabled(false);
  callRunStep(submitActionCode, { __text_submit: inputVal });
}

const inputEl = document.getElementById("input") as HTMLTextAreaElement | null;
if (inputEl) {
  const sync = () => syncSendButtonState(inputEl);
  inputEl.addEventListener("input", sync);
  inputEl.addEventListener("change", sync);
  inputEl.addEventListener("keydown", (event) => {
    const ev = event as KeyboardEvent;
    if (
      ev.key === "Enter" &&
      !ev.shiftKey &&
      !ev.altKey &&
      !ev.ctrlKey &&
      !ev.metaKey
    ) {
      ev.preventDefault();
      submitWidgetInput();
    }
  });
  sync();
}

const sendEl = document.getElementById("send");
if (sendEl) {
  sendEl.addEventListener("click", () => {
    submitWidgetInput();
  });
}

const wordingChoicePickUser = document.getElementById("wordingChoicePickUser");
if (wordingChoicePickUser) {
  wordingChoicePickUser.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromState("ui_action_wording_pick_user");
    if (!actionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_wording_pick_user" });
      setInlineNotice(
        uiStringFromContract("error.contract.body") || "Please refresh and try again."
      );
      return;
    }
    callRunStep(actionCode);
  });
}

const wordingChoicePickSuggestion = document.getElementById("wordingChoicePickSuggestion");
if (wordingChoicePickSuggestion) {
  wordingChoicePickSuggestion.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromState("ui_action_wording_pick_suggestion");
    if (!actionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_wording_pick_suggestion" });
      setInlineNotice(
        uiStringFromContract("error.contract.body") || "Please refresh and try again."
      );
      return;
    }
    callRunStep(actionCode);
  });
}

const btnStart = document.getElementById("btnStart");
if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromState("ui_action_start");
    if (!actionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_start" });
      setInlineNotice(
        uiStringFromContract("error.contract.body") || "Please refresh and try again."
      );
      (btnStart as HTMLButtonElement).disabled = true;
      return;
    }
    setSessionStarted(true);
    setSessionWelcomeShown(false);
    callRunStep(actionCode, { started: "true" });
  });
}

const btnStartDreamExercise = document.getElementById("btnStartDreamExercise");
if (btnStartDreamExercise) {
  btnStartDreamExercise.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromState("ui_action_dream_start_exercise");
    if (!actionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_dream_start_exercise" });
      setInlineNotice(
        uiStringFromContract("error.contract.body") || "Please refresh and try again."
      );
      return;
    }
    callRunStep(actionCode);
  });
}

const btnSwitchToSelfDream = document.getElementById("btnSwitchToSelfDream");
if (btnSwitchToSelfDream) {
  btnSwitchToSelfDream.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromState("ui_action_dream_switch_to_self");
    if (!actionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_dream_switch_to_self" });
      setInlineNotice(
        uiStringFromContract("error.contract.body") || "Please refresh and try again."
      );
      return;
    }
    callRunStep(actionCode);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("openai:set_globals", () => {
    try {
      const payload = readSetGlobalsPayloadFromHost();
      if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
        ingestHostPayload(payload, "set_globals");
        notifyHostTransportSignal("set_globals");
      } else {
        render();
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (getIsLoading()) setLoading(false);
    }
  });
}

if (!tryInitialIngestFromHost("set_globals")) {
  renderStartupWaitShell("initial_bootstrap_probe");
}
