type FeedbackStringResolver = (key: string, fallback?: string) => string;

function normalizeComparable(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSentence(value: string): string {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function isGenericFeedbackAcknowledgementSentence(input: string): boolean {
  const sentence = String(input || "").trim();
  if (!sentence) return false;
  const patterns = [
    /^(?:that|this|dat|dit)\s+(?:is|feels|sounds)\s+(?:a\s+|een\s+)?(?:good|great|strong|solid|goed|sterk|prima)\b/i,
    /^(?:good|great|strong|solid)\s+(?:start|beginning|starting point|point|insight)\b/i,
    /^(?:goed|sterk|prima)\s+(?:beginpunt|start|startpunt|inzicht)\b/i,
    /^(?:dat|dit)\s+is\s+een\s+(?:goed|sterk|prima)\s+(?:beginpunt|start|startpunt)\b/i,
    /^(?:i think i understand what you mean|i understand what you mean|ik denk dat ik begrijp wat je bedoelt|ik begrijp wat je bedoelt)\b/i,
  ];
  return patterns.some((pattern) => pattern.test(sentence));
}

export function sanitizeFeedbackReasonForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const reason = ensureSentence(params.rawReason);
  if (!reason) return "";
  if (isGenericFeedbackAcknowledgementSentence(reason)) return "";
  const stepLabel = feedbackStepLabel(params.stepId, params.resolveString);
  const introTemplate = params.resolveString("wording.feedback.compare.intro.template", "");
  const intro = ensureSentence(String(introTemplate || "").replace(/\{0\}/g, stepLabel));
  if (intro && normalizeComparable(reason) === normalizeComparable(intro)) return "";
  return reason;
}

function stripStepPrefix(value: string): string {
  return String(value || "")
    .replace(/^(?:step|stap)\s+\d+\s*:\s*/i, "")
    .trim();
}

function prettifyStepId(stepId: string): string {
  const normalized = String(stepId || "").trim();
  if (!normalized) return "";
  if (normalized === "bigwhy") return "Big Why";
  if (normalized === "targetgroup") return "Target Group";
  if (normalized === "productsservices") return "Products and Services";
  if (normalized === "rulesofthegame") return "Rules of the Game";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function feedbackStepLabel(stepId: string, resolveString: FeedbackStringResolver): string {
  const candidates = [
    resolveString(`ppt.heading.${stepId}`, ""),
    resolveString(`offtopic.step.${stepId}`, ""),
    resolveString(`title.${stepId}`, ""),
  ]
    .map((value) => stripStepPrefix(value))
    .filter(Boolean);
  return candidates[0] || prettifyStepId(stepId);
}

export function formatCompareFeedbackForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  return sanitizeFeedbackReasonForDisplay(params);
}

export function formatUserPickFeedbackForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const stepLabel = feedbackStepLabel(params.stepId, params.resolveString);
  const acknowledgment = ensureSentence(
    params.resolveString("wording.feedback.user_pick.ack.default", "")
  );
  const nudgeTemplate = params.resolveString("wording.feedback.user_pick.nudge.template", "");
  const nudge = ensureSentence(String(nudgeTemplate || "").replace(/\{0\}/g, stepLabel));
  const reason = sanitizeFeedbackReasonForDisplay(params);
  if (reason) {
    return [acknowledgment, nudge, reason].filter(Boolean).join("\n\n").trim();
  }
  const fallbackReason = ensureSentence(
    params.resolveString("wording.feedback.user_pick.reason.default", "")
  );
  return [acknowledgment, fallbackReason].filter(Boolean).join("\n\n").trim();
}
