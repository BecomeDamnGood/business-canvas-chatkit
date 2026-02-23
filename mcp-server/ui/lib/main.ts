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
  mergeToolOutputWithResponseMetadata,
  setBridgeEnabled,
  setSendEnabled,
  setLoading,
  setWidgetStateSafe,
} from "./ui_actions.js";
import { render } from "./ui_render.js";

initActionsConfig({ render, t });

const isLocalDev = (globalThis as Record<string, unknown>).LOCAL_DEV === "1";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeHostToolResultNotification(paramsRaw: unknown): Record<string, unknown> {
  const params = toRecord(paramsRaw);
  const toolOutputCandidate =
    params.result !== undefined
      ? params.result
      : (params.toolResult !== undefined ? params.toolResult : (params.output !== undefined ? params.output : paramsRaw));
  const metadataRaw =
    params.toolResponseMetadata !== undefined
      ? params.toolResponseMetadata
      : (params.responseMetadata !== undefined ? params.responseMetadata : params.metadata);
  const metadata = toRecord(metadataRaw);

  const siblingMeta = toRecord(params._meta);
  const hasSiblingMeta = Object.keys(siblingMeta).length > 0;
  const hasSiblingWidgetResult = params.widget_result !== undefined;
  if (hasSiblingMeta || hasSiblingWidgetResult) {
    const nextMeta = toRecord(metadata._meta);
    if (hasSiblingMeta) Object.assign(nextMeta, siblingMeta);
    if (hasSiblingWidgetResult && nextMeta.widget_result === undefined) {
      nextMeta.widget_result = params.widget_result;
    }
    metadata._meta = nextMeta;
  }

  return mergeToolOutputWithResponseMetadata(toolOutputCandidate, metadata);
}

if (isLocalDev && typeof window !== "undefined") {
  const reportDevError = (message: string, file?: string, line?: number, col?: number) => {
    const target =
      document.getElementById("status") ||
      document.getElementById("uiSubtitle");
    if (!target) return;
    const parts = [message];
    if (file) parts.push(`@ ${file}${line ? ":" + line : ""}${col ? ":" + col : ""}`);
    target.textContent = `[ui_error] ${parts.join(" ")}`.trim();
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
      String((e as ErrorEvent)?.message || "unknown error"),
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
      String((reason && reason.message) ? reason.message : reason || "unhandled rejection")
    );
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (e: MessageEvent) => {
    const data: any = e?.data;
    if (!data || typeof data !== "object") return;
    if (data.jsonrpc !== "2.0") return;
    const method = typeof data.method === "string" ? data.method : "";
    if (method.startsWith("ui/")) {
      setBridgeEnabled(true);
    }
    if (method === "ui/notifications/tool-result") {
      const payload = normalizeHostToolResultNotification(data.params);
      try {
        handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "host_notification" });
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

  const latest = (globalThis as { __BSC_LATEST__?: { state?: Record<string, unknown> } }).__BSC_LATEST__ || {};
  const st = latest.state || {};
  const win = globalThis as unknown as { __dreamScoringScores?: unknown[][] };
  const isDreamScoringDirection =
    st.current_step === "dream" &&
    String(st.active_specialist || "") === "DreamExplainer" &&
    Array.isArray(win.__dreamScoringScores) &&
    (win.__dreamScoringScores?.length ?? 0) > 0;

  if (isDreamScoringDirection) {
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
    callRunStep("ACTION_DREAM_EXPLAINER_SUBMIT_SCORES", { __pending_scores: payloadScores });
    return;
  }

  if (input) input.value = "";
  setSendEnabled(false);
  callRunStep("ACTION_TEXT_SUBMIT", { __text_submit: inputVal });
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
    callRunStep("ACTION_WORDING_PICK_USER");
  });
}

const wordingChoicePickSuggestion = document.getElementById("wordingChoicePickSuggestion");
if (wordingChoicePickSuggestion) {
  wordingChoicePickSuggestion.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_WORDING_PICK_SUGGESTION");
  });
}

const btnStart = document.getElementById("btnStart");
if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (getIsLoading()) return;
    setSessionStarted(true);
    setSessionWelcomeShown(false);
    setWidgetStateSafe({ started: "true" });
    callRunStep("ACTION_START", { started: "true" });
  });
}

const btnStartDreamExercise = document.getElementById("btnStartDreamExercise");
if (btnStartDreamExercise) {
  btnStartDreamExercise.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_DREAM_INTRO_START_EXERCISE");
  });
}

const btnSwitchToSelfDream = document.getElementById("btnSwitchToSelfDream");
if (btnSwitchToSelfDream) {
  btnSwitchToSelfDream.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_DREAM_SWITCH_TO_SELF");
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("openai:set_globals", () => {
    try {
      const host = (globalThis as Record<string, unknown>).openai as
        | { toolOutput?: unknown; toolResponseMetadata?: unknown }
        | undefined;
      const payload = mergeToolOutputWithResponseMetadata(
        host?.toolOutput,
        host?.toolResponseMetadata
      );
      if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
        handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });
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

render();
