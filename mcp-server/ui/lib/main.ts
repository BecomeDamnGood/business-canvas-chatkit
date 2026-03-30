// @ts-nocheck
import { t } from "./ui_constants.js";
import { collectPartialPendingScoresForContractAction, render } from "./ui_render.js";
import { stripInlineText } from "./ui_text.js";
import {
  applyToolResult,
  callRunStep,
  handleBridgeResponse,
  handleToolResultAndMaybeScheduleBootstrapRetry,
  initActionsConfig,
  isTrustedBridgeMessageEvent,
  notifyHostTransportSignal,
  resolveAllowedHostOrigin,
  resolveWidgetPayload,
  setBridgeEnabled,
  setInlineNotice,
  setLoading,
  setSendEnabled,
  toolData,
} from "./ui_actions.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";

  initActionsConfig({ render, t });
  var isLocalDev = globalThis.LOCAL_DEV === "1" || typeof location !== "undefined" && location.hostname === "localhost";
  async function callToolViaLocalMcp(toolName, toolArgs) {
    const body = {
      jsonrpc: "2.0",
      id: `local_${Date.now()}`,
      method: "tools/call",
      params: { name: String(toolName || ""), arguments: toolArgs || {} }
    };
    const response = await fetch("/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const parsed = await response.json();
    if (!response.ok || parsed?.error) {
      const message = parsed?.error?.message || `Local MCP call failed (${response.status})`;
      throw new Error(String(message));
    }
    return parsed?.result ?? parsed;
  }
  function ensureLocalDevOpenAiShim() {
    if (!isLocalDev) return;
    const current = globalThis.openai;
    if (current && typeof current.callTool === "function") return;
    const next = current && typeof current === "object" ? current : {};
    next.callTool = (name, args) => callToolViaLocalMcp(name, args);
    if (!next.toolOutput || typeof next.toolOutput !== "object") next.toolOutput = {};
    if (!next.toolResponseMetadata || typeof next.toolResponseMetadata !== "object") next.toolResponseMetadata = {};
    globalThis.openai = next;
    console.log("[local_dev_openai_shim_enabled]", { endpoint: "/mcp" });
  }
  function latestWidgetState() {
    const latest = globalThis.__BSC_LATEST__;
    const state = latest?.state;
    return state && typeof state === "object" ? state : {};
  }
  function latestWidgetLang() {
    const latest = globalThis.__BSC_LATEST__;
    const state = latestWidgetState();
    return String(latest?.lang || state.ui_strings_lang || state.language || "en").trim().toLowerCase();
  }
  function buildStartupInitState() {
    return {
      state: {
        current_step: "step_0",
        started: "false",
        ui_gate_status: "waiting_locale",
        ui_strings_status: "pending"
      },
      ui: {
        flags: {
          bootstrap_waiting_locale: true,
          bootstrap_interactive_ready: false,
          interactive_fallback_active: false
        },
        view: {
          mode: "waiting_locale",
          waiting_locale: true
        }
      }
    };
  }
  function uiStringFromContract(key) {
    return String(t(latestWidgetLang(), key) || "").trim();
  }
  function latestWidgetResult() {
    const data = toolData();
    const resolved = resolveWidgetPayload(data);
    return resolved.result && typeof resolved.result === "object" ? resolved.result : {};
  }
  function latestPendingInteraction() {
    const result = latestWidgetResult();
    const ui = result && typeof result.ui === "object" ? result.ui : {};
    const pending = ui && typeof ui.pending_interaction === "object" ? ui.pending_interaction : {};
    const kind = String(pending.kind || "").trim().toLowerCase();
    const status = String(pending.status || "").trim().toLowerCase();
    if ((kind !== "text_compare" && kind !== "list_compare") || status !== "pending") return null;
    const allowedActions = Array.isArray(pending.allowed_actions) ? pending.allowed_actions : [];
    return {
      id: String(pending.id || "").trim(),
      allowedActions
    };
  }
  function pendingInteractionAction(actionId) {
    const pending = latestPendingInteraction();
    if (!pending) return null;
    for (const action of pending.allowedActions) {
      if (!action || typeof action !== "object") continue;
      if (String(action.id || "").trim() !== String(actionId || "").trim()) continue;
      const actionCode = String(action.action_code || "").trim();
      if (!actionCode) continue;
      return {
        interactionId: pending.id,
        actionCode
      };
    }
    return null;
  }
  function actionRoleForStateKey(stateKey) {
    const normalized = String(stateKey || "").trim();
    const roleMap = {
      ui_action_start: "start",
      ui_action_text_submit: "text_submit",
      ui_action_score_submit: "score_submit",
      ui_action_compare_pick_user: "compare_pick_user",
      ui_action_compare_pick_suggestion: "compare_pick_suggestion"
    };
    return String(roleMap[normalized] || "").trim();
  }
  function actionDescriptorFromLatestContract(role) {
    const roleNorm = String(role || "").trim().toLowerCase();
    if (!roleNorm) return null;
    const result = latestWidgetResult();
    const ui = result && typeof result.ui === "object" ? result.ui : {};
    const actionContract = ui && typeof ui.action_contract === "object" ? ui.action_contract : {};
    const actions = Array.isArray(actionContract.actions) ? actionContract.actions : [];
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      if (String(action.role || "").trim().toLowerCase() !== roleNorm) continue;
      const actionCode = String(action.action_code || "").trim();
      if (!actionCode) continue;
      return {
        actionCode,
        payloadMode: String(action.payload_mode || "").trim().toLowerCase()
      };
    }
    return null;
  }
  function actionLabelFromLatestContract(role) {
    const roleNorm = String(role || "").trim().toLowerCase();
    if (!roleNorm) return null;
    const result = latestWidgetResult();
    const ui = result && typeof result.ui === "object" ? result.ui : {};
    const actionContract = ui && typeof ui.action_contract === "object" ? ui.action_contract : {};
    const actions = Array.isArray(actionContract.actions) ? actionContract.actions : [];
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      if (String(action.role || "").trim().toLowerCase() !== roleNorm) continue;
      return {
        label: stripInlineText(String(action.label || "")).trim(),
        labelKey: String(action.label_key || "").trim()
      };
    }
    return null;
  }
  function actionCodeFromState(stateKey) {
    const role = actionRoleForStateKey(stateKey);
    if (!role) return "";
    const descriptor = actionDescriptorFromLatestContract(role);
    if (descriptor?.actionCode) return descriptor.actionCode;
    return "";
  }
  function actionPayloadModeFromState(stateKey) {
    const role = actionRoleForStateKey(stateKey);
    if (role) {
      const descriptor = actionDescriptorFromLatestContract(role);
      if (descriptor?.payloadMode) return descriptor.payloadMode;
    }
    return "";
  }
  function ingestHostPayload(payload, source) {
    clearStartupGrace();
    if (source === "set_globals") {
      handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });
      return;
    }
    handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "host_notification" });
  }
  function clearStartupGrace() {
    return;
  }
  function renderStartupWaitShell(reason) {
    console.log("[startup_wait_shell_rendered]", { reason });
    // Keep the widget hidden until the first canonical payload arrives.
    // Rendering a transient wait shell causes a visible blank/skeleton flash in ChatGPT.
  }
  function readSetGlobalsPayloadFromHost() {
    const host = globalThis.openai;
    return applyToolResult({
      toolOutput: host?.toolOutput,
      toolResponseMetadata: host?.toolResponseMetadata
    });
  }
  function hasRenderedStateSnapshot() {
    const state = latestWidgetState();
    if (!state || typeof state !== "object" || Object.keys(state).length === 0) return false;
    const currentStep = String(state.current_step || "").trim();
    const gateStatus = String(state.ui_gate_status || "").trim().toLowerCase();
    return Boolean(currentStep || gateStatus);
  }
  function tryInitialIngestFromHost(source) {
    const payload = readSetGlobalsPayloadFromHost();
    if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return false;
    ingestHostPayload(payload, source);
    notifyHostTransportSignal("set_globals");
    return true;
  }
  function scheduleStartupFailClosed(_reason) {
    return;
  }
  if (isLocalDev && typeof window !== "undefined") {
    const reportDevError = (message, file, line, col) => {
      const target = document.getElementById("status") || document.getElementById("uiSubtitle");
      if (!target) return;
      const parts = [message];
      if (file) parts.push(`@ ${file}${line ? ":" + line : ""}${col ? ":" + col : ""}`);
      const prefix = uiStringFromContract("dev.error.prefix");
      target.textContent = `${prefix} ${parts.join(" ")}`.trim();
    };
    window.addEventListener("error", (e) => {
      console.error(
        "[ui_error]",
        e?.message,
        e?.filename,
        e?.lineno,
        e?.colno,
        e?.error?.stack
      );
      reportDevError(
        String(e?.message || uiStringFromContract("dev.error.unknown")),
        e?.filename,
        e?.lineno,
        e?.colno
      );
    });
    window.addEventListener("unhandledrejection", (e) => {
      const reason = e?.reason;
      console.error(
        "[ui_rejection]",
        reason && reason.message ? reason.message : reason,
        reason && reason.stack ? reason.stack : ""
      );
      reportDevError(
        String(reason && reason.message ? reason.message : reason || uiStringFromContract("dev.error.unhandled_rejection"))
      );
    });
  }
  if (typeof window !== "undefined") {
    resolveAllowedHostOrigin();
    window.addEventListener("message", (e) => {
      if (!isTrustedBridgeMessageEvent(e)) return;
      const data = e?.data;
      if (!data || typeof data !== "object") return;
      if (data.jsonrpc !== "2.0") return;
      const method = typeof data.method === "string" ? data.method : "";
      if (method.startsWith("ui/")) {
        setBridgeEnabled(true);
        notifyHostTransportSignal("bridge_message");
      }
      if (method === "ui/initialize") {
        try {
          const initialized = applyToolResult(data.params);
          if (initialized && typeof initialized === "object" && Object.keys(initialized).length > 0) {
            ingestHostPayload(data.params, "host_notification");
          } else if (!hasRenderedStateSnapshot()) {
            renderStartupWaitShell("ui_initialize");
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (getIsLoading()) setLoading(false);
        }
        return;
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
  function syncSendButtonState(input) {
    if (!input || getIsLoading()) return;
    if (input.disabled === true || input.readOnly === true) {
      setSendEnabled(false);
      return;
    }
    const inputVal = (input.value || "").trim();
    setSendEnabled(inputVal.length > 0);
  }
  function submitWidgetInput() {
    if (getIsLoading()) return;
    const input = document.getElementById("input");
    if (input?.disabled === true || input?.readOnly === true) return;
    const inputVal = (input?.value || "").trim();
    if (!inputVal) return;
    const submitActionCode = actionCodeFromState("ui_action_text_submit");
    const submitPayloadMode = actionPayloadModeFromState("ui_action_text_submit") || "text";
    if (!submitActionCode) {
      console.warn("[ui_action_missing]", { state_key: "ui_action_text_submit" });
      setInlineNotice(
        uiStringFromContract("error.contract.body")
      );
      return;
    }
    const win = globalThis;
    const shouldSubmitScores = submitPayloadMode === "scores";
    if (shouldSubmitScores) {
      const scoringScores = win.__dreamScoringScores || [];
      const payloadScores = [];
      for (let ci = 0; ci < scoringScores.length; ci++) {
        const row = scoringScores[ci] || [];
        const normRow = [];
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
    const pendingScores = collectPartialPendingScoresForContractAction();
    callRunStep(
      submitActionCode,
      pendingScores ? { __text_submit: inputVal, __pending_scores: pendingScores } : { __text_submit: inputVal }
    );
  }
  var inputEl = document.getElementById("input");
  if (inputEl) {
    const sync = () => syncSendButtonState(inputEl);
    inputEl.addEventListener("input", sync);
    inputEl.addEventListener("change", sync);
    inputEl.addEventListener("keydown", (event) => {
      const ev = event;
      if (ev.key === "Enter" && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        submitWidgetInput();
      }
    });
    sync();
  }
  var sendEl = document.getElementById("send");
  if (sendEl) {
    sendEl.addEventListener("click", () => {
      submitWidgetInput();
    });
  }
  var comparePickUser = document.getElementById("comparePickUser");
  if (comparePickUser) {
    comparePickUser.addEventListener("click", () => {
      if (getIsLoading()) return;
      const pendingAction = pendingInteractionAction("pick_user");
      if (!pendingAction?.actionCode || !pendingAction?.interactionId) {
        console.warn("[ui_pending_interaction_missing]", { action_id: "pick_user" });
        setInlineNotice(
          uiStringFromContract("error.contract.body")
        );
        return;
      }
      callRunStep(pendingAction.actionCode, {
        __submitted_pending_interaction_id: pendingAction.interactionId
      });
    });
  }
  var comparePickSuggestion = document.getElementById("comparePickSuggestion");
  if (comparePickSuggestion) {
    comparePickSuggestion.addEventListener("click", () => {
      if (getIsLoading()) return;
      const pendingAction = pendingInteractionAction("pick_suggestion");
      if (!pendingAction?.actionCode || !pendingAction?.interactionId) {
        console.warn("[ui_pending_interaction_missing]", { action_id: "pick_suggestion" });
        setInlineNotice(
          uiStringFromContract("error.contract.body")
        );
        return;
      }
      callRunStep(pendingAction.actionCode, {
        __submitted_pending_interaction_id: pendingAction.interactionId
      });
    });
  }
  var btnStart = document.getElementById("btnStart");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      if (getIsLoading()) return;
      const actionCode = actionCodeFromState("ui_action_start");
      if (!actionCode) {
        console.warn("[ui_action_missing]", { state_key: "ui_action_start" });
        setInlineNotice(
          uiStringFromContract("error.contract.body")
        );
        btnStart.disabled = true;
        return;
      }
      setSessionStarted(true);
      setSessionWelcomeShown(false);
      callRunStep(actionCode, { started: "true" });
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
          renderStartupWaitShell(hasRenderedStateSnapshot() ? "set_globals_empty_payload_with_cache" : "set_globals_empty_payload");
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (getIsLoading()) setLoading(false);
      }
    });
  }
  ensureLocalDevOpenAiShim();
  const initialIngested = tryInitialIngestFromHost("set_globals");
  if (!initialIngested) {
    renderStartupWaitShell("initial_bootstrap_probe");
  }
  if (!initialIngested && isLocalDev) {
    callToolViaLocalMcp("run_step", {
      current_step_id: "step_0",
      user_message: "",
      input_mode: "widget",
      state: {}
    }).then((payload) => {
      ingestHostPayload(payload, "set_globals");
      notifyHostTransportSignal("set_globals");
    }).catch((err) => {
      console.error("[local_dev_initial_ingest_failed]", String(err?.message || err || "unknown"));
    });
  }
