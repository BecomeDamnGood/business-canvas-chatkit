import type { StepIntent } from "../contracts/intents.js";

function routeToIntent(route: string): StepIntent {
  const normalized = String(route || "").trim();
  if (!normalized) return { type: "SUBMIT_TEXT", text: "", context: "free_text" };
  // Contract mode: keep route tokens explicit and menu-scoped.
  if (normalized.includes("FINISH_LATER")) return { type: "FINISH_LATER" };
  if (normalized.includes("CONTINUE")) return { type: "CONTINUE" };
  if (normalized.includes("START_EXERCISE")) {
    return { type: "START_EXERCISE", exerciseType: "dream_builder" };
  }
  return { type: "ROUTE", route: normalized };
}

export function actionCodeToIntent(params: {
  actionCode: string;
  route?: string;
}): StepIntent {
  const actionCode = String(params.actionCode || "").trim();
  const route = String(params.route || "").trim();

  if (actionCode === "ACTION_TEXT_SUBMIT") {
    return { type: "SUBMIT_TEXT", text: "", context: "free_text" };
  }
  if (actionCode === "ACTION_WORDING_PICK_USER") {
    return { type: "WORDING_PICK", choice: "user" };
  }
  if (actionCode === "ACTION_WORDING_PICK_SUGGESTION") {
    return { type: "WORDING_PICK", choice: "suggestion" };
  }
  if (actionCode === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
    return { type: "SUBMIT_SCORES", scores: [] };
  }
  if (!route && actionCode.startsWith("ACTION_")) {
    return { type: "ROUTE", route: actionCode };
  }
  return routeToIntent(route);
}
