import type { CanvasState } from "../core/state.js";

type ActioncodeRegistryEntry = {
  route?: string;
  dispatch_owner?: "action_routing" | "special_route" | "state_action";
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

export type CompareMode = "text" | "list";
export type CompareVariant = "default" | "clarify_dual" | "grouped_list_units";

export type CompareCompareFeedbackUiPayload = {
  text: string;
};

export type CompareUiPayload = {
  enabled: boolean;
  mode: CompareMode;
  variant?: CompareVariant;
  compare_feedback?: CompareCompareFeedbackUiPayload;
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
  | "text_compare"
  | "dream_builder_collect"
  | "dream_builder_scoring"
  | "dream_builder_refine";

export type DreamBuilderBodyMode = "none" | "support_only" | "full_narrative";

export type UiViewPayload = {
  mode?: "prestart" | "interactive" | "blocked";
  waiting_locale?: false;
  variant?: Exclude<UiViewVariant, "default">;
  dream_builder_body_mode?: DreamBuilderBodyMode;
  dream_builder_statements_visible?: boolean;
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

  function dispatchOwnerForActionCode(actionCode: string): "action_routing" | "special_route" | "state_action" {
    const entry = deps.actioncodeRegistry.actions[actionCode];
    const owner = String(entry?.dispatch_owner || "").trim();
    if (owner === "special_route" || owner === "state_action") return owner;
    return "action_routing";
  }

  function shouldPretransitionActionCode(actionCode: string): boolean {
    return dispatchOwnerForActionCode(actionCode) === "action_routing";
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
    dispatchOwnerForActionCode,
    shouldPretransitionActionCode,
    deriveUiViewPayload,
    isConfirmActionCode,
    menuHasConfirmAction,
    firstConfirmActionCodeForMenu,
    firstGuidanceActionCodeForMenu,
  };
}
