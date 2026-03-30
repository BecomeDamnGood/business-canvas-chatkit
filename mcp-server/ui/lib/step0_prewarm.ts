export const ACTION_STEP0_PREWARM = "ACTION_STEP0_PREWARM";
export const STEP0_PREWARM_DEBOUNCE_MS = 350;

export function normalizeStep0PrewarmText(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

export function buildStep0PrewarmKey(input: string): string {
  return normalizeStep0PrewarmText(input);
}

export function shouldScheduleStep0Prewarm(params: {
  currentStep: string;
  started: unknown;
  inputValue: string;
  lastScheduledKey: string;
  inFlightKey: string;
}): { shouldSchedule: boolean; key: string } {
  const currentStep = String(params.currentStep || "").trim();
  const started = String(params.started || "").trim().toLowerCase() === "true";
  const key = buildStep0PrewarmKey(params.inputValue);
  if (currentStep !== "step_0" || started || !key) {
    return { shouldSchedule: false, key };
  }
  if (key === String(params.lastScheduledKey || "") || key === String(params.inFlightKey || "")) {
    return { shouldSchedule: false, key };
  }
  return { shouldSchedule: true, key };
}
