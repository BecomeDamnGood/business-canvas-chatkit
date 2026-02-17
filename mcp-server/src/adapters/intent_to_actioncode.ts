import type { StepIntent } from "../contracts/intents.js";

export function intentToActionCode(intent: StepIntent): string {
  switch (intent.type) {
    case "WORDING_PICK":
      return intent.choice === "user"
        ? "ACTION_WORDING_PICK_USER"
        : "ACTION_WORDING_PICK_SUGGESTION";
    case "SUBMIT_SCORES":
      return "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES";
    case "CONFIRM":
      return "ACTION_CONFIRM_CONTINUE";
    case "START_EXERCISE":
      return "ACTION_DREAM_INTRO_START_EXERCISE";
    case "CONTINUE":
      return "ACTION_CONFIRM_CONTINUE";
    case "FINISH_LATER":
      return "ACTION_TEXT_SUBMIT";
    case "ROUTE":
      return intent.route;
    case "NAVIGATE_STEP":
      return "ACTION_CONFIRM_CONTINUE";
    case "REQUEST_EXPLANATION":
      return "ACTION_TEXT_SUBMIT";
    case "SUBMIT_TEXT":
      return "ACTION_TEXT_SUBMIT";
    default: {
      const _exhaustive: never = intent;
      return String(_exhaustive);
    }
  }
}

