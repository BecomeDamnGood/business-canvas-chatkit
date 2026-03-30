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

function softenKnownHarshFeedbackSentence(params: {
  stepId: string;
  input: string;
  resolveString: FeedbackStringResolver;
}): string {
  const sentence = ensureSentence(params.input);
  if (!sentence) return "";

  const targetedRewrites: Array<{ pattern: RegExp; key: string }> = [
    {
      pattern: /^["'“”‘’]?[^.!?]+["'“”‘’]?\s+is too broad to guide your choices[.!?]*$/i,
      key: "compare.feedback.reason.soft.targetgroup.too_broad.default",
    },
    {
      pattern: /^["'“”‘’]?[^.!?]+["'“”‘’]?\s+is too generic to create a usable target group[.!?]*$/i,
      key: "compare.feedback.reason.soft.targetgroup.too_generic.default",
    },
    {
      pattern: /^["'“”‘’]?[^.!?]+["'“”‘’]?\s+is te breed om richting te geven aan je keuzes[.!?]*$/i,
      key: "compare.feedback.reason.soft.targetgroup.too_broad.default",
    },
    {
      pattern: /^["'“”‘’]?[^.!?]+["'“”‘’]?\s+is te algemeen om er een bruikbare doelgroep van te maken[.!?]*$/i,
      key: "compare.feedback.reason.soft.targetgroup.too_generic.default",
    },
    {
      pattern:
        /\b(?:too focused on the provider side|te veel gericht op de aanbiederskant)\b[\s\S]*\b(?:broader human effect|bredere menselijke effect|desired future state|gewenste toekomstige situatie)\b/i,
      key: "compare.feedback.reason.soft.provider_future.default",
    },
    {
      pattern: /\b(?:is too broad|is te breed)\b/i,
      key: "compare.feedback.reason.soft.more_focus.default",
    },
    {
      pattern: /\b(?:is too generic|is te algemeen)\b/i,
      key: "compare.feedback.reason.soft.more_specific.default",
    },
  ];
  for (const rewrite of targetedRewrites) {
    if (!rewrite.pattern.test(sentence)) continue;
    const localized = ensureSentence(params.resolveString(rewrite.key, ""));
    if (localized) return localized;
  }
  return sentence;
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

export function sanitizeUserPickFeedbackTextForDisplay(rawText: string): string {
  return splitFeedbackSentences(rawText).join(" ").trim();
}

export function sanitizeFeedbackReasonForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const stepLabel = feedbackStepLabel(params.stepId, params.resolveString);
  const introTemplate = params.resolveString("compare.feedback.compare.intro.template", "");
  const intro = ensureSentence(String(introTemplate || "").replace(/\{0\}/g, stepLabel));
  const candidate = splitFeedbackSentences(params.rawReason).find((sentence) => {
    if (isPureGenericFeedbackAcknowledgementSentence(sentence)) return false;
    if (intro && normalizeComparable(sentence) === normalizeComparable(intro)) return false;
    return true;
  });
  if (!candidate) return "";
  return softenKnownHarshFeedbackSentence({
    stepId: params.stepId,
    input: candidate,
    resolveString: params.resolveString,
  });
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
  return ensureSentence(resolveString("compare.feedback.user_pick.ack.default", ""));
}

export function isMeaningfulUserPickFeedbackText(params: {
  stepId: string;
  rawText: string;
  resolveString: FeedbackStringResolver;
}): boolean {
  const sanitized = sanitizeUserPickFeedbackTextForDisplay(params.rawText);
  if (!sanitized) return false;
  const comparable = normalizeComparable(sanitized);
  if (!comparable) return false;
  const acknowledgment = userPickAcknowledgmentForDisplay(params.resolveString);
  const defaultReason = ensureSentence(
    params.resolveString("compare.feedback.user_pick.reason.default", "")
  );
  const fallbackCombined = [acknowledgment, defaultReason].filter(Boolean).join(" ");
  const blocked = [
    acknowledgment,
    defaultReason,
    fallbackCombined,
  ]
    .map((value) => normalizeComparable(value))
    .filter(Boolean);
  if (blocked.includes(comparable)) return false;
  return true;
}

export function userPickFeedbackReasonForDisplay(params: {
  stepId: string;
  rawReason: string;
  resolveString: FeedbackStringResolver;
}): string {
  const reason = sanitizeFeedbackReasonForDisplay(params);
  if (reason) return reason;
  return ensureSentence(
    params.resolveString("compare.feedback.user_pick.reason.default", "")
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
