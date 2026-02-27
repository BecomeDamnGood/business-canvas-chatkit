import type { RenderedAction } from "../contracts/ui_actions.js";
import type { StepIntent } from "../contracts/intents.js";
import type { CanvasState } from "../core/state.js";

type ActioncodeRegistryEntry = {
  route?: string;
};

type ActioncodeRegistryShape = {
  actions: Record<string, ActioncodeRegistryEntry>;
  menus: Record<string, string[]>;
};

export type PromptInvariantContext = {
  stepId: string;
  status: "no_output" | "incomplete_output" | "valid_output";
  specialist: Record<string, unknown>;
  state: CanvasState;
};

type CreateRunStepRuntimeTextUiHelpersDeps = {
  step0Id: string;
  uiDefaultString: (key: string, fallback?: string) => string;
  menuLabelDefaults: Record<string, string>;
  menuLabelKeys: Record<string, string[]>;
  labelKeyForMenuAction: (menuId: string, actionCode: string, idx: number) => string;
  actioncodeRegistry: ActioncodeRegistryShape;
  actionCodeToIntent: (params: { actionCode: string; route: string }) => StepIntent;
  shouldSuppressFallbackText: (state: CanvasState | null | undefined) => boolean;
  isUiSemanticInvariantsV1Enabled: () => boolean;
};

export function createRunStepRuntimeTextUiHelpers(deps: CreateRunStepRuntimeTextUiHelpersDeps) {
  function uiStringFromStateMap(
    state: CanvasState | null | undefined,
    key: string,
    fallback: string
  ): string {
    const map = state && typeof (state as Record<string, unknown>).ui_strings === "object"
      ? ((state as Record<string, unknown>).ui_strings as Record<string, unknown>)
      : null;
    if (map) {
      const candidate = String(map[key] || "").trim();
      if (candidate) return candidate;
    }
    if (deps.shouldSuppressFallbackText(state)) return "";
    return String(fallback || "").trim();
  }

  function step0CardDescForState(state: CanvasState | null | undefined): string {
    if (deps.shouldSuppressFallbackText(state)) return "";
    return uiStringFromStateMap(state, "step0.carddesc", deps.uiDefaultString("step0.carddesc"));
  }

  function step0QuestionForState(state: CanvasState | null | undefined): string {
    if (deps.shouldSuppressFallbackText(state)) return "";
    return uiStringFromStateMap(
      state,
      "step0.question.initial",
      deps.uiDefaultString("step0.question.initial")
    );
  }

  function step0ReadyActionLabel(state: CanvasState | null | undefined): string {
    if (deps.shouldSuppressFallbackText(state)) return "";
    const key = deps.labelKeyForMenuAction("STEP0_MENU_READY_START", "ACTION_STEP0_READY_START", 0);
    const fallback = String(deps.menuLabelDefaults[key] || "Yes, I'm ready. Let's start!").trim();
    return uiStringFromStateMap(state, key, fallback);
  }

  function formatIndexedTemplate(templateRaw: string, values: string[]): string {
    let out = String(templateRaw || "");
    for (let i = 0; i < values.length; i += 1) {
      out = out.replace(new RegExp(`\\{${i}\\}`, "g"), String(values[i] || ""));
    }
    return out;
  }

  function step0ReadinessStatement(
    state: CanvasState | null | undefined,
    parsed: { venture: string; name: string; status: string }
  ): string {
    if (deps.shouldSuppressFallbackText(state)) return "";
    const venture = String(parsed.venture || "venture").trim();
    const name = String(parsed.name || "TBD").trim();
    const existingTemplate = uiStringFromStateMap(
      state,
      "step0.readiness.statement.existing",
      deps.uiDefaultString("step0.readiness.statement.existing", "You have a {0} called {1}.")
    );
    const startingTemplate = uiStringFromStateMap(
      state,
      "step0.readiness.statement.starting",
      deps.uiDefaultString("step0.readiness.statement.starting", "You want to start a {0} called {1}.")
    );
    const template = String(parsed.status || "").toLowerCase() === "existing" ? existingTemplate : startingTemplate;
    return formatIndexedTemplate(template, [venture, name]).trim();
  }

  function step0ReadinessQuestion(
    state: CanvasState | null | undefined,
    parsed: { venture: string; name: string; status: string }
  ): string {
    if (deps.shouldSuppressFallbackText(state)) return "";
    const readyLabel = step0ReadyActionLabel(state);
    const suffix = uiStringFromStateMap(
      state,
      "step0.readiness.suffix",
      deps.uiDefaultString("step0.readiness.suffix", "Are you ready to start with the first step: the Dream?")
    );
    const statement = step0ReadinessStatement(state, parsed);
    if (!readyLabel || !statement || !suffix) return "";
    return `1) ${readyLabel}\n\n${statement} ${suffix}`.trim();
  }

  function countNumberedOptions(prompt: string): number {
    const lines = String(prompt || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const match = line.match(/^([1-9])[\)\.]\s+/);
      if (!match) continue;
      const n = Number(match[1]);
      if (n !== count + 1) break;
      count += 1;
    }
    return count;
  }

  function labelKeysForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
    const safeMenuId = String(menuId || "").trim();
    const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
    if (!safeMenuId || safeActionCodes.length === 0) return [];
    const fullActionCodes = Array.isArray(deps.actioncodeRegistry.menus[safeMenuId])
      ? deps.actioncodeRegistry.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    const fullLabelKeys = Array.isArray(deps.menuLabelKeys[safeMenuId])
      ? deps.menuLabelKeys[safeMenuId].map((labelKey) => String(labelKey || "").trim())
      : [];
    if (fullActionCodes.length === 0) return [];
    if (fullActionCodes.length !== fullLabelKeys.length) {
      return safeActionCodes.map((actionCode, idx) => deps.labelKeyForMenuAction(safeMenuId, actionCode, idx));
    }
    const usedIndices = new Set<number>();
    const filteredLabelKeys: string[] = [];
    for (const actionCode of safeActionCodes) {
      let matchedIndex = -1;
      for (let i = 0; i < fullActionCodes.length; i += 1) {
        if (usedIndices.has(i)) continue;
        if (fullActionCodes[i] !== actionCode) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex < 0) return [];
      usedIndices.add(matchedIndex);
      const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
      if (!labelKey) return [];
      filteredLabelKeys.push(labelKey);
    }
    return filteredLabelKeys;
  }

  function labelsForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
    const safeMenuId = String(menuId || "").trim();
    const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
    if (!safeMenuId || safeActionCodes.length === 0) return [];
    const fullActionCodes = Array.isArray(deps.actioncodeRegistry.menus[safeMenuId])
      ? deps.actioncodeRegistry.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    const fullLabelKeys = labelKeysForMenuActionCodes(safeMenuId, fullActionCodes);
    if (fullActionCodes.length === 0 || fullLabelKeys.length !== fullActionCodes.length) return [];
    const usedIndices = new Set<number>();
    const filteredLabels: string[] = [];
    for (const actionCode of safeActionCodes) {
      let matchedIndex = -1;
      for (let i = 0; i < fullActionCodes.length; i += 1) {
        if (usedIndices.has(i)) continue;
        if (fullActionCodes[i] !== actionCode) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex < 0) return [];
      usedIndices.add(matchedIndex);
      const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
      const label = String(deps.menuLabelDefaults[labelKey] || "").trim();
      if (!label) return [];
      filteredLabels.push(label);
    }
    return filteredLabels;
  }

  function stripNumberedOptions(prompt: string): string {
    const kept = String(prompt || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .filter((line) => !/^[1-9][\)\.]\s+/.test(line));
    return kept.join("\n").trim();
  }

  function buildRenderedActionsFromMenu(
    menuId: string,
    actionCodes: string[],
    stateForLabels?: CanvasState | null
  ): RenderedAction[] {
    const safeCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
    const labels = labelsForMenuActionCodes(menuId, safeCodes);
    const labelKeys = labelKeysForMenuActionCodes(menuId, safeCodes);
    if (!safeCodes.length || labels.length !== safeCodes.length || labelKeys.length !== safeCodes.length) return [];
    return safeCodes.map((actionCode, idx) => {
      const entry = deps.actioncodeRegistry.actions[actionCode];
      const route = String(entry?.route || actionCode).trim();
      const labelKey = labelKeys[idx] || deps.labelKeyForMenuAction(menuId, actionCode, idx);
      const label = uiStringFromStateMap(stateForLabels || null, labelKey, labels[idx]);
      return {
        id: `${actionCode}:${idx + 1}`,
        label,
        label_key: labelKey,
        action_code: actionCode,
        intent: deps.actionCodeToIntent({ actionCode, route }),
        primary: idx === 0,
      };
    });
  }

  function buildQuestionTextFromActions(prompt: string): string {
    return stripNumberedOptions(prompt) || String(prompt || "").trim();
  }

  function promptFallbackForInteractiveAsk(state: CanvasState, stepId: string): string {
    if (stepId === deps.step0Id) {
      return step0QuestionForState(state);
    }
    return uiStringFromStateMap(
      state,
      "invariant.prompt.ask.default",
      deps.uiDefaultString("invariant.prompt.ask.default", "Share your thoughts or choose an option.")
    );
  }

  function enforcePromptInvariants(context: PromptInvariantContext): Record<string, unknown> {
    if (!deps.isUiSemanticInvariantsV1Enabled()) return context.specialist;
    const stepId = String(context.stepId || "").trim();
    const status = context.status;
    const specialist = context.specialist || {};
    const action = String((specialist as Record<string, unknown>).action || "").trim().toUpperCase();
    if (action !== "ASK") return specialist;
    const interactiveAsk = status === "no_output" || status === "incomplete_output";
    if (!interactiveAsk) return specialist;

    const currentQuestion = String((specialist as Record<string, unknown>).question || "").trim();
    const currentMessage = String((specialist as Record<string, unknown>).message || "").trim();
    const wordingPending = String((specialist as Record<string, unknown>).wording_choice_pending || "").trim() === "true";
    const next = { ...specialist };
    if (!currentQuestion) {
      (next as Record<string, unknown>).question = promptFallbackForInteractiveAsk(context.state, stepId);
    }
    if (wordingPending && !currentMessage) {
      (next as Record<string, unknown>).message = uiStringFromStateMap(
        context.state,
        "wording.choice.context.default",
        deps.uiDefaultString("wording.choice.context.default", "Please choose the wording that fits best.")
      );
    }
    return next;
  }

  return {
    uiStringFromStateMap,
    step0CardDescForState,
    step0QuestionForState,
    step0ReadyActionLabel,
    step0ReadinessStatement,
    step0ReadinessQuestion,
    countNumberedOptions,
    labelKeysForMenuActionCodes,
    labelsForMenuActionCodes,
    buildRenderedActionsFromMenu,
    buildQuestionTextFromActions,
    promptFallbackForInteractiveAsk,
    enforcePromptInvariants,
  };
}
