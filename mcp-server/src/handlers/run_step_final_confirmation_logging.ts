import {
  STEP_FINAL_FIELD_BY_STEP_ID,
  type CanvasState,
} from "../core/state.js";
import {
  createStructuredLogContextFromState,
  logStructuredEvent,
} from "./run_step_response.js";

export type StepFinalConfirmationEvent = {
  stepId: string;
  finalField: string;
  finalText: string;
  businessName: string;
  source: "explicit_confirmation";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericTurnIndex(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function resolveBusinessNameFromStateForReporting(
  state: Record<string, unknown>,
  step0Id: string,
  parseStep0Final: (step0Final: string, fallbackName: string) => { name?: string } | null | undefined
): string {
  const direct = String(state.business_name || "").trim();
  if (direct && direct.toLowerCase() !== "tbd") return direct;
  const step0FinalField = String((STEP_FINAL_FIELD_BY_STEP_ID as Record<string, string>)[step0Id] || "").trim();
  const step0Final = step0FinalField ? String(state[step0FinalField] || "").trim() : "";
  if (!step0Final) return direct || "TBD";
  const parsed = parseStep0Final(step0Final, direct || "TBD");
  const parsedName = String(parsed?.name || "").trim();
  if (parsedName && parsedName.toLowerCase() !== "tbd") return parsedName;
  return direct || parsedName || "TBD";
}

export function collectStepFinalConfirmationEvents(params: {
  previousState: CanvasState | Record<string, unknown> | null | undefined;
  nextState: CanvasState | Record<string, unknown> | null | undefined;
  step0Id: string;
  parseStep0Final: (step0Final: string, fallbackName: string) => { name?: string } | null | undefined;
}): StepFinalConfirmationEvent[] {
  const previousState = asRecord(params.previousState || {});
  const nextState = asRecord(params.nextState || {});
  const businessName = resolveBusinessNameFromStateForReporting(
    nextState,
    params.step0Id,
    params.parseStep0Final
  );
  const events: StepFinalConfirmationEvent[] = [];

  for (const [stepId, finalField] of Object.entries(STEP_FINAL_FIELD_BY_STEP_ID as Record<string, string>)) {
    const normalizedStepId = String(stepId || "").trim();
    const normalizedFinalField = String(finalField || "").trim();
    if (!normalizedStepId || !normalizedFinalField) continue;

    const previousValue = String(previousState[normalizedFinalField] || "").trim();
    const nextValue = String(nextState[normalizedFinalField] || "").trim();
    if (!nextValue || previousValue === nextValue) continue;

    events.push({
      stepId: normalizedStepId,
      finalField: normalizedFinalField,
      finalText: nextValue,
      businessName,
      source: "explicit_confirmation",
    });
  }

  return events;
}

export function logStepFinalConfirmationEvents(params: {
  previousState: CanvasState | Record<string, unknown> | null | undefined;
  nextState: CanvasState | Record<string, unknown> | null | undefined;
  step0Id: string;
  parseStep0Final: (step0Final: string, fallbackName: string) => { name?: string } | null | undefined;
}): void {
  const events = collectStepFinalConfirmationEvents(params);
  const nextStateRecord = asRecord(params.nextState || {});
  for (const event of events) {
    logStructuredEvent(
      "info",
      "app_usage_step_final_confirmed",
      createStructuredLogContextFromState(nextStateRecord, {
        step_id: event.stepId,
      }),
      {
        analytics_schema: "bsc_app_usage_v3",
        session_turn_index: numericTurnIndex(nextStateRecord.__session_turn_index),
        final_field: event.finalField,
        final_text: event.finalText,
        business_name: event.businessName,
        source: event.source,
      }
    );
  }
}
