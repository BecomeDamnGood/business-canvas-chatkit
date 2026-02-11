/**
 * Main entry point: wire modules, attach event listeners, init.
 */

import { t } from "./ui_constants.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";
import {
  initActionsConfig,
  callRunStep,
  setSendEnabled,
  setLoading,
  hasToolOutput,
  setWidgetStateSafe,
} from "./ui_actions.js";
import { render } from "./ui_render.js";

initActionsConfig({ render, t });

const inputEl = document.getElementById("input");
if (inputEl) {
  inputEl.addEventListener("input", () => {
    if (getIsLoading()) return;
    const inputVal = ((inputEl as HTMLInputElement).value || "").trim();
    setSendEnabled(inputVal.length > 0);
  });
}

const sendEl = document.getElementById("send");
if (sendEl) {
  sendEl.addEventListener("click", () => {
    if (getIsLoading()) return;
    const input = document.getElementById("input") as HTMLInputElement | null;
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
  });
}

const btnDreamConfirm = document.getElementById("btnDreamConfirm");
if (btnDreamConfirm) {
  btnDreamConfirm.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_DREAM_EXPLAINER_REFINE_CONFIRM");
  });
}

const btnStart = document.getElementById("btnStart");
if (btnStart) {
  btnStart.addEventListener("click", () => {
    if (getIsLoading()) return;
    setSessionStarted(true);
    setSessionWelcomeShown(false);
    setWidgetStateSafe({ started: "true" });
    render();
    if (!hasToolOutput()) {
      callRunStep("ACTION_START", { started: "true" });
    }
  });
}

const btnOk = document.getElementById("btnOk");
if (btnOk) {
  btnOk.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_CONFIRM_CONTINUE");
  });
}

const btnGoToNextStep = document.getElementById("btnGoToNextStep");
if (btnGoToNextStep) {
  btnGoToNextStep.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_DREAM_EXPLAINER_NEXT_STEP");
  });
}

const btnStartDreamExercise = document.getElementById("btnStartDreamExercise");
if (btnStartDreamExercise) {
  btnStartDreamExercise.addEventListener("click", () => {
    if (getIsLoading()) return;
    callRunStep("ACTION_CONFIRM_CONTINUE");
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
      render();
    } catch (e) {
      console.error(e);
    } finally {
      if (getIsLoading()) setLoading(false);
    }
  });
}

render();
