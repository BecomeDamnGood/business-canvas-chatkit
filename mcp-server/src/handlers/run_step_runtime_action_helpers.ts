import type { CanvasState } from "../core/state.js";

type ActioncodeRegistryEntry = {
  route?: string;
  flags?: string[];
};

type ActioncodeRegistryShape = {
  actions: Record<string, ActioncodeRegistryEntry>;
  menus: Record<string, string[]>;
};

type CreateRunStepRuntimeActionHelpersDeps = {
  step0Id: string;
  actioncodeRegistry: ActioncodeRegistryShape;
  onUnknownActionCode?: (params: {
    actionCode: string;
    currentStep: string;
    state: CanvasState;
  }) => void;
};

export type WordingChoiceMode = "text" | "list";
export type WordingChoiceVariant = "default" | "clarify_dual";

export type WordingChoiceUiPayload = {
  enabled: boolean;
  mode: WordingChoiceMode;
  variant?: WordingChoiceVariant;
  user_text: string;
  suggestion_text: string;
  user_label?: string;
  suggestion_label?: string;
  user_items: string[];
  suggestion_items: string[];
  instruction: string;
};

type UiViewVariant =
  | "default"
  | "wording_choice"
  | "dream_builder_collect"
  | "dream_builder_scoring"
  | "dream_builder_refine";

export type UiViewPayload = {
  mode?: "prestart" | "interactive" | "blocked";
  waiting_locale?: false;
  variant?: Exclude<UiViewVariant, "default">;
};

export function createRunStepRuntimeActionHelpers(deps: CreateRunStepRuntimeActionHelpersDeps) {
  /**
   * Process ActionCode: deterministic switch/case for all ActionCodes.
   * Returns explicit route token or "yes" for the specialist.
   * No LLM routing, no context-dependent logic.
   */
  function processActionCode(
    actionCode: string,
    currentStep: string,
    state: CanvasState,
    lastSpecialistResult: any
  ): string {
    void state;
    void lastSpecialistResult;
    const entry = deps.actioncodeRegistry.actions[actionCode];
    if (entry) return String(entry.route || "").trim();
    if (actionCode.startsWith("ACTION_")) {
      deps.onUnknownActionCode?.({
        actionCode,
        currentStep,
        state,
      });
    }
    return actionCode;
  }

  function deriveUiViewPayload(variant: UiViewVariant): UiViewPayload | null {
    if (variant === "default") return null;
    return { variant };
  }

  function isConfirmActionCode(actionCode: string): boolean {
    const entry = deps.actioncodeRegistry.actions[actionCode];
    if (!entry) return false;
    if (Array.isArray(entry.flags) && entry.flags.includes("confirm")) return true;
    if (entry.route === "yes") return true;
    const upper = actionCode.toUpperCase();
    return upper.includes("_CONFIRM") || upper.includes("FINAL_CONTINUE");
  }

  function menuHasConfirmAction(menuId: string): boolean {
    const actionCodes = Array.isArray(deps.actioncodeRegistry.menus[menuId])
      ? deps.actioncodeRegistry.menus[menuId]
      : [];
    return actionCodes.some((code) => isConfirmActionCode(String(code || "").trim()));
  }

  function firstConfirmActionCodeForMenu(menuId: string): string {
    const actionCodes = Array.isArray(deps.actioncodeRegistry.menus[menuId])
      ? deps.actioncodeRegistry.menus[menuId]
      : [];
    for (const rawCode of actionCodes) {
      const code = String(rawCode || "").trim();
      if (!code) continue;
      if (isConfirmActionCode(code)) return code;
    }
    return "";
  }

  function firstGuidanceActionCodeForMenu(menuId: string): string {
    const actionCodes = Array.isArray(deps.actioncodeRegistry.menus[menuId])
      ? deps.actioncodeRegistry.menus[menuId]
      : [];
    const candidates = actionCodes
      .map((rawCode) => String(rawCode || "").trim())
      .filter(Boolean)
      .filter((code) => !isConfirmActionCode(code));
    if (candidates.length === 0) return "";
    const preferenceScore = (code: string): number => {
      const upper = String(code || "").toUpperCase();
      if (/_EXPLAIN_MORE|_ASK_|_GIVE_EXAMPLE|_CONSOLIDATE|_FORMULATE|_WRITE|_REFINE/.test(upper)) {
        return 3;
      }
      if (/_ESCAPE_/.test(upper) || /_FINISH_LATER|_CONTINUE$/.test(upper)) return 1;
      return 2;
    };
    const ranked = [...candidates].sort((left, right) => preferenceScore(right) - preferenceScore(left));
    return String(ranked[0] || "").trim();
  }

  return {
    processActionCode,
    deriveUiViewPayload,
    isConfirmActionCode,
    menuHasConfirmAction,
    firstConfirmActionCodeForMenu,
    firstGuidanceActionCodeForMenu,
  };
}
