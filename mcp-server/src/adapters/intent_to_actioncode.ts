import type { StepIntent } from "../contracts/intents.js";

export function intentToActionCode(intent: StepIntent): string {
  const requiresStepOrMenuContext = (intentType: string): never => {
    throw new Error(
      `intentToActionCode(${intentType}) requires step/menu context and is not routing-safe in the generic adapter.`
    );
  };

  switch (intent.type) {
    case "WORDING_PICK":
      return intent.choice === "user"
        ? "ACTION_WORDING_PICK_USER"
        : "ACTION_WORDING_PICK_SUGGESTION";
    case "SUBMIT_SCORES":
      return "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES";
    case "START_EXERCISE":
      return requiresStepOrMenuContext(intent.type);
    case "CONTINUE":
      return requiresStepOrMenuContext(intent.type);
    case "FINISH_LATER":
      return requiresStepOrMenuContext(intent.type);
    case "ROUTE":
      return intent.route;
    case "NAVIGATE_STEP":
      return requiresStepOrMenuContext(intent.type);
    case "REQUEST_EXPLANATION":
      return requiresStepOrMenuContext(intent.type);
    case "SUBMIT_TEXT":
      return "ACTION_TEXT_SUBMIT";
    default: {
      const _exhaustive: never = intent;
      return String(_exhaustive);
    }
  }
}
