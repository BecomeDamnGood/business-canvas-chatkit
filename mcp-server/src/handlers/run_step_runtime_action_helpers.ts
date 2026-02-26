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

export type WordingChoiceUiPayload = {
  enabled: boolean;
  mode: WordingChoiceMode;
  user_text: string;
  suggestion_text: string;
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

type UiViewModeRoute =
  | "waiting_locale"
  | "prestart"
  | "interactive"
  | "recovery"
  | "blocked"
  | "failed";

export type UiViewPayload = {
  mode: UiViewModeRoute;
  waiting_locale: boolean;
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

  function deriveUiViewPayload(
    state: CanvasState | null | undefined,
    variant: UiViewVariant
  ): UiViewPayload | null {
    if (!state || typeof state !== "object") return null;
    const gateStatus = String((state as any).ui_gate_status || "").trim().toLowerCase();
    const phase = String((state as any).bootstrap_phase || "").trim().toLowerCase();
    const currentStep = String((state as any).current_step || deps.step0Id).trim() || deps.step0Id;
    const started = String((state as any).started || "").trim().toLowerCase() === "true";
    let mode: UiViewModeRoute = "interactive";
    if (gateStatus === "waiting_locale" || phase === "waiting_locale") mode = "waiting_locale";
    else if (gateStatus === "blocked") mode = "blocked";
    else if (gateStatus === "failed" || phase === "failed") mode = "failed";
    else if (phase === "recovery") mode = "recovery";
    else if (currentStep === deps.step0Id && !started) mode = "prestart";
    return {
      mode,
      waiting_locale: mode === "waiting_locale",
      ...(variant !== "default" ? { variant } : {}),
    };
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

  return {
    processActionCode,
    deriveUiViewPayload,
    isConfirmActionCode,
    menuHasConfirmAction,
  };
}
