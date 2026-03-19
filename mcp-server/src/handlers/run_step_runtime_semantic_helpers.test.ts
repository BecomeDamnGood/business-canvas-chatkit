import test from "node:test";
import assert from "node:assert/strict";
import { createRunStepRuntimeSemanticHelpers } from "./run_step_runtime_semantic_helpers.js";

test("validateRenderedContractOrRecover clears stale Dream no-buttons state and rerenders with actions", () => {
  const helpers = createRunStepRuntimeSemanticHelpers({
    step0Id: "step_0",
    dreamStepId: "dream",
    dreamExplainerSwitchSelfMenuId: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
    dreamExplainerRefineMenuId: "DREAM_EXPLAINER_MENU_NEXT_STEP",
    actioncodeRegistry: {
      actions: {
        ACTION_DREAM_REFINE_CONFIRM: { route: "yes" },
      },
      menus: {
        DREAM_MENU_NEXT_STEP: ["ACTION_DREAM_REFINE_CONFIRM"],
      },
    },
    defaultMenuByStatus: {
      dream: {
        valid_output: "DREAM_MENU_NEXT_STEP",
      },
    },
    finalFieldByStepId: {
      dream: "dream_final",
    },
    getDreamRuntimeMode: () => "self",
    parseMenuFromContractIdForStep: (contractIdRaw: string) => {
      const menuId = String(contractIdRaw || "").split(":")[2] || "";
      return menuId === "NO_MENU" ? "" : menuId;
    },
    isConfirmActionCode: (actionCode: string) => actionCode === "ACTION_DREAM_REFINE_CONFIRM",
    menuHasConfirmAction: (menuId: string) => menuId === "DREAM_MENU_NEXT_STEP",
    inferUiRenderModeForStep: (state: any, stepId: string) =>
      String(state?.__ui_render_mode_by_step?.[stepId] || "").trim() === "no_buttons" ? "no_buttons" : "menu",
    fieldForStep: () => "dream",
    provisionalValueForStep: (state: any, stepId: string) =>
      String(state?.provisional_by_step?.[stepId] || "").trim(),
    provisionalSourceForStep: (state: any, stepId: string) =>
      String(state?.provisional_source_by_step?.[stepId] || "").trim() === "user_input"
        ? "user_input"
        : "system_generated",
    clearStepInteractiveState: (state) => state,
    clearStepSupportState: (state: any, stepId: string) => {
      const modeMap =
        state && typeof state.__ui_render_mode_by_step === "object" && state.__ui_render_mode_by_step !== null
          ? { ...(state.__ui_render_mode_by_step as Record<string, unknown>) }
          : {};
      delete modeMap[stepId];
      return {
        ...state,
        __ui_render_mode_by_step: modeMap,
      };
    },
    renderFreeTextTurnPolicy: ({ state, specialist }) => {
      const renderMode =
        String((state as any).__ui_render_mode_by_step?.dream || "").trim() === "no_buttons"
          ? "no_buttons"
          : "menu";
      const uiActionCodes =
        renderMode === "no_buttons" ? [] : ["ACTION_DREAM_REFINE_CONFIRM"];
      return {
        status: "valid_output",
        confirmEligible: true,
        specialist: {
          ...specialist,
          question: uiActionCodes.length > 0 ? "1. Bevestig deze droom." : "",
        },
        uiActionCodes,
        uiActions: uiActionCodes.map((actionCode) => ({
          action_code: actionCode,
          label: "Bevestigen",
        })) as any,
        contractId: "dream:valid_output:DREAM_MENU_NEXT_STEP",
        contractVersion: "test",
        textKeys: [],
      };
    },
    validateNonStep0OfftopicMessageShape: () => null,
    enforcePromptInvariants: ({ specialist }) => specialist,
    promptFallbackForInteractiveAsk: () => "",
    uiStringFromStateMap: (_state, _key, fallback) => fallback,
    uiDefaultString: (_key, fallback = "") => fallback,
    countNumberedOptions: (prompt: string) => (String(prompt || "").trim() ? 1 : 0),
    isUiSemanticInvariantsV1Enabled: () => true,
    bumpUiI18nCounter: () => {},
  });

  const state = {
    current_step: "dream",
    provisional_by_step: {
      dream: "Mindd droomt van een wereld waarin mensen met vertrouwen kiezen.",
    },
    provisional_source_by_step: {
      dream: "user_input",
    },
    __ui_render_mode_by_step: {
      dream: "no_buttons",
    },
  } as any;
  const specialist = {
    action: "ASK",
    message: "Op basis van je input stel ik de volgende droom voor.",
    question: "",
    dream: "Mindd droomt van een wereld waarin mensen met vertrouwen kiezen.",
    refined_formulation: "Mindd droomt van een wereld waarin mensen met vertrouwen kiezen.",
    step_support_state: "ok",
    is_offtopic: false,
  } as Record<string, unknown>;

  const validated = helpers.validateRenderedContractOrRecover({
    stepId: "dream",
    rendered: {
      status: "valid_output",
      confirmEligible: true,
      specialist,
      uiActionCodes: [],
      uiActions: [],
      contractId: "dream:valid_output:NO_MENU",
      contractVersion: "test",
      textKeys: [],
    },
    state,
    previousSpecialist: {},
    telemetry: null,
  });

  assert.equal(validated.violation, null);
  assert.equal(validated.recovered, true);
  assert.equal(String((validated.state as any).__ui_render_mode_by_step?.dream || ""), "");
  assert.deepEqual(validated.rendered.uiActionCodes, ["ACTION_DREAM_REFINE_CONFIRM"]);
});
