/**
 * Main entry point: wire modules, attach event listeners, init.
 */

import { t } from "./ui_constants.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";
import {
  applyToolResult,
  initActionsConfig,
  callRunStep,
  handleToolResultAndMaybeScheduleBootstrapRetry,
  handleBridgeResponse,
  isTrustedBridgeMessageEvent,
  notifyHostTransportSignal,
  resolveAllowedHostOrigin,
  resolveWidgetPayload,
  setBridgeEnabled,
  setSendEnabled,
  setInlineNotice,
  setLoading,
  toolData,
} from "./ui_actions.js";
import { render } from "./ui_render.js";

initActionsConfig({ render, t });

const isLocalDev = (globalThis as Record<string, unknown>).LOCAL_DEV === "1";
const STARTUP_WAITING_VIEW_MODE = "waiting_locale";

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

function latestActionContractActions(): Array<Record<string, unknown>> {
  const resolved = resolveWidgetPayload(toolData());
  const result = resolved.result;
  const uiPayload =
    result && typeof result.ui === "object" && result.ui
      ? (result.ui as Record<string, unknown>)
      : {};
  const actionContract =
    uiPayload && typeof uiPayload.action_contract === "object" && uiPayload.action_contract
      ? (uiPayload.action_contract as Record<string, unknown>)
      : {};
  if (!Array.isArray(actionContract.actions)) return [];
  return (actionContract.actions as unknown[])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Record<string, unknown>);
}

function actionByRole(role: string): Record<string, unknown> | null {
  const roleNorm = String(role || "").trim().toLowerCase();
  if (!roleNorm) return null;
  const actions = latestActionContractActions();
  for (const action of actions) {
    if (String(action.role || "").trim().toLowerCase() !== roleNorm) continue;
    const actionCode = String(action.action_code || "").trim();
    if (!actionCode) continue;
    return action;
  }
  return null;
}

function actionCodeFromRole(role: string): string {
  const action = actionByRole(role);
  return action ? String(action.action_code || "").trim() : "";
}

function payloadModeFromRole(role: string): "text" | "scores" {
  const action = actionByRole(role);
  if (!action) return "text";
  return String(action.payload_mode || "").trim().toLowerCase() === "scores" ? "scores" : "text";
}

function guardMissingActionRole(role: string, elementToDisable?: HTMLButtonElement | null): boolean {
  console.warn("[ui_action_contract_missing]", { role });
  setInlineNotice(
    uiStringFromContract("error.contract.body") || "Please refresh and try again."
  );
  if (elementToDisable) elementToDisable.disabled = true;
  return false;
}

function ingestHostPayload(
  payload: unknown,
  source: "set_globals" | "host_notification"
): void {
  if (source === "set_globals") {
    handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });
    return;
  }
  handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "host_notification" });
}

function readSetGlobalsPayloadFromHost(): Record<string, unknown> {
  const host = (globalThis as Record<string, unknown>).openai as
    | { toolOutput?: unknown; toolResponseMetadata?: unknown }
    | undefined;
  return applyToolResult({
    toolOutput: host?.toolOutput,
    toolResponseMetadata: host?.toolResponseMetadata,
  });
}

function tryInitialIngestFromHost(source: "set_globals" | "host_notification"): boolean {
  const payload = readSetGlobalsPayloadFromHost();
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return false;
  ingestHostPayload(payload, source);
  notifyHostTransportSignal("set_globals");
  return true;
}

function hasRenderedStateSnapshot(): boolean {
  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__;
  const state = latest?.state;
  return Boolean(state && typeof state === "object" && Object.keys(state).length > 0);
}

function buildStartupInitState(): Record<string, unknown> {
  return {
    _meta: {
      widget_result: {
        current_step_id: "step_0",
        state: {
          current_step: "step_0",
          started: "false",
          ui_gate_status: STARTUP_WAITING_VIEW_MODE,
          ui_strings_status: "pending",
          bootstrap_phase: STARTUP_WAITING_VIEW_MODE,
        },
        ui: {
          flags: {
            bootstrap_waiting_locale: true,
            bootstrap_interactive_ready: false,
          },
          view: {
            mode: STARTUP_WAITING_VIEW_MODE,
            waiting_locale: true,
          },
        },
      },
    },
  };
}

function renderStartupWaitState(reason: string): void {
  if (hasRenderedStateSnapshot()) return;
  const startupInitState = buildStartupInitState();
  console.log("[startup_first_render_wait_shell]", { reason });
  render(startupInitState);
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
      try {
        ingestHostPayload(data.params, "host_notification");
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

  const submitActionCode = actionCodeFromRole("text_submit");
  const submitPayloadMode = payloadModeFromRole("text_submit");
  if (!submitActionCode) {
    guardMissingActionRole("text_submit");
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
    const actionCode = actionCodeFromRole("wording_pick_user");
    if (!actionCode) {
      guardMissingActionRole("wording_pick_user");
      return;
    }
    callRunStep(actionCode);
  });
}

const wordingChoicePickSuggestion = document.getElementById("wordingChoicePickSuggestion");
if (wordingChoicePickSuggestion) {
  wordingChoicePickSuggestion.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromRole("wording_pick_suggestion");
    if (!actionCode) {
      guardMissingActionRole("wording_pick_suggestion");
      return;
    }
    callRunStep(actionCode);
  });
}

const btnStart = document.getElementById("btnStart");
if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromRole("start");
    if (!actionCode) {
      guardMissingActionRole("start", btnStart as HTMLButtonElement);
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
    const actionCode = actionCodeFromRole("dream_start_exercise");
    if (!actionCode) {
      guardMissingActionRole("dream_start_exercise");
      return;
    }
    callRunStep(actionCode);
  });
}

const btnSwitchToSelfDream = document.getElementById("btnSwitchToSelfDream");
if (btnSwitchToSelfDream) {
  btnSwitchToSelfDream.addEventListener("click", () => {
    if (getIsLoading()) return;
    const actionCode = actionCodeFromRole("dream_switch_to_self");
    if (!actionCode) {
      guardMissingActionRole("dream_switch_to_self");
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
        console.log("[startup_set_globals_empty_payload_ignored]");
        renderStartupWaitState("set_globals_empty_payload");
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (getIsLoading()) setLoading(false);
    }
  });
}

if (!tryInitialIngestFromHost("set_globals")) {
  renderStartupWaitState("initial_bootstrap_probe");
}
