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

function splitFeedbackSentences(input: string): string[] {
  const normalized = String(input || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => ensureSentence(sentence))
    .filter(Boolean);
}

function isPureGenericFeedbackAcknowledgementSentence(input: string): boolean {
  const sentence = String(input || "").trim();
  if (!sentence) return false;
  const patterns = [
    /^(?:that|this|dat|dit)\s+(?:is|feels|sounds)\s+(?:a\s+|een\s+)?(?:good|great|strong|solid|goed|sterk|prima)\s+(?:start|beginning|starting point|point|insight|beginpunt|startpunt|inzicht)(?:\s+(?:already|al))?[.!?]*$/i,
    /^(?:good|great|strong|solid)\s+(?:start|beginning|starting point|point|insight)[.!?]*$/i,
    /^(?:goed|sterk|prima)\s+(?:beginpunt|start|startpunt|inzicht)[.!?]*$/i,
    /^(?:dat|dit)\s+is\s+een\s+(?:goed|sterk|prima)\s+(?:beginpunt|start|startpunt|inzicht)[.!?]*$/i,
    /^(?:i think i understand what you mean|i understand what you mean|ik denk dat ik begrijp wat je bedoelt|ik begrijp wat je bedoelt)[.!?]*$/i,
    /^(?:your|de|je)\s+(?:current|huidige)\s+(?:wording|formulation|sentence|zin|entity|entiteit|purpose|bestaansreden|big why|grote waarom|role|rol|target group|doelgroep)\s+(?:is|blijft)\s+(?:clear|helder|duidelijk)[^.!?]*(?:but|maar)[^.!?]*(?:stronger|krachtiger|distinctive|onderscheidend|unique|uniek|recognizable|herkenbaar|generic|generiek)[^.!?]*[.!?]*$/i,
    /^(?:your|de|je)\s+(?:current|huidige)\s+(?:entity|entiteit|wording|formulation|zin)\s+(?:is|blijft)\s+(?:clear|helder|duidelijk)[^.!?]*(?:misses|mist)[^.!?]*(?:distinctive|onderscheidend|unique|uniek|recognizable|herkenbaar)[^.!?]*[.!?]*$/i,
    /^(?:your|je)\s+(?:(?:current|huidige)\s+)?(?:wording|formulation|zin|formulering)\s+(?:is|blijft)\s+(?:clear|helder|duidelijk)[^.!?]*(?:can be|kan)\s+(?:more\s+)?(?:stronger|krachtiger)[^.!?]*[.!?]*$/i,
  ];
  if (patterns.some((pattern) => pattern.test(sentence))) return true;
  if (
    /^(?:i|ik)\s+(?:have|heb)\s+(?:your|je)?\s*(?:current\s+)?(?:wording|formulation|zin|formulering)?\s*(?:made more compact|compacter gemaakt|shortened|verkort|tightened|aangescherpt|rewritten|herschreven)[^.!?]*[.!?]*$/i.test(
      sentence
    ) &&
    !/\b(?:so that|zodat|because|omdat)\b/i.test(sentence)
  ) {
    return true;
  }
  return false;
}

export function sanitizeSupportTextForDisplay(rawText: string): string {
  const sanitized = splitFeedbackSentences(rawText).filter(
    (sentence) => !isPureGenericFeedbackAcknowledgementSentence(sentence)
  );
  return sanitized.join(" ").trim();
}

export function sanitizeFeedbackReasonForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const stepLabel = feedbackStepLabel(params.stepId, params.resolveString);
  const introTemplate = params.resolveString("wording.feedback.compare.intro.template", "");
  const intro = ensureSentence(String(introTemplate || "").replace(/\{0\}/g, stepLabel));
  const candidate = splitFeedbackSentences(params.rawReason).find((sentence) => {
    if (isPureGenericFeedbackAcknowledgementSentence(sentence)) return false;
    if (intro && normalizeComparable(sentence) === normalizeComparable(intro)) return false;
    return true;
  });
  return candidate || "";
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

export function userPickAcknowledgmentForDisplay(resolveString: FeedbackStringResolver): string {
  return ensureSentence(resolveString("wording.feedback.user_pick.ack.default", ""));
}

export function userPickFeedbackReasonForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const reason = sanitizeFeedbackReasonForDisplay(params);
  if (reason) return reason;
  return ensureSentence(
    params.resolveString("wording.feedback.user_pick.reason.default", "")
  );
}

export function formatUserPickFeedbackForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const acknowledgment = userPickAcknowledgmentForDisplay(params.resolveString);
  const reason = userPickFeedbackReasonForDisplay(params);
  return [acknowledgment, reason].filter(Boolean).join("\n\n").trim();
}
