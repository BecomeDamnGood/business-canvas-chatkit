function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

export function parseRetainedInstruction(rawInstruction: unknown): {
  retainedHeading: string;
  retainedItems: string[];
  instructionText: string;
} {
  const instruction = String(rawInstruction || "").replace(/\r/g, "\n").trim();
  if (!instruction) {
    return { retainedHeading: "", retainedItems: [], instructionText: "" };
  }
  const lines = instruction
    .split("\n")
    .map((line) => String(line || "").trim());
  const firstBulletIndex = lines.findIndex((line) => /^(?:[-*•·]|\d+[\).])\s+/.test(line));
  if (firstBulletIndex < 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }

  let bulletEndIndex = firstBulletIndex;
  while (bulletEndIndex < lines.length && /^(?:[-*•·]|\d+[\).])\s+/.test(lines[bulletEndIndex])) {
    bulletEndIndex += 1;
  }

  const retainedHeading = lines
    .slice(0, firstBulletIndex)
    .filter(Boolean)
    .join("\n")
    .trim();
  const retainedItems = lines
    .slice(firstBulletIndex, bulletEndIndex)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[\).])\s+/, "").trim())
    .filter(Boolean);
  const instructionText = lines
    .slice(bulletEndIndex)
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!retainedHeading || retainedItems.length === 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }
  return { retainedHeading, retainedItems, instructionText: instructionText || instruction };
}

export function resolveWordingChoiceFeedbackSource(
  wordingChoiceRaw: unknown,
  specialistRaw?: unknown
): Record<string, unknown> {
  const wordingChoice = toRecord(wordingChoiceRaw);
  if (Object.keys(wordingChoice).length === 0) return wordingChoice;

  const specialist = toRecord(specialistRaw);
  const userText = String(
    wordingChoice.user_text ||
      specialist.wording_choice_user_normalized ||
      specialist.wording_choice_user_raw ||
      ""
  ).trim();
  const suggestionText = String(
    wordingChoice.suggestion_text ||
      specialist.wording_choice_agent_current ||
      specialist.refined_formulation ||
      ""
  ).trim();
  const userItems =
    normalizeStringArray(wordingChoice.user_items).length > 0
      ? normalizeStringArray(wordingChoice.user_items)
      : normalizeStringArray(specialist.wording_choice_user_items);
  const suggestionItems =
    normalizeStringArray(wordingChoice.suggestion_items).length > 0
      ? normalizeStringArray(wordingChoice.suggestion_items)
      : normalizeStringArray(specialist.wording_choice_suggestion_items);

  return {
    ...wordingChoice,
    user_text: userText,
    suggestion_text: suggestionText,
    user_items: userItems,
    suggestion_items: suggestionItems,
  };
}

export function synthesizeUiFeedbackContractFromWordingChoice(
  wordingChoiceRaw: unknown,
  uiFlagsRaw?: unknown,
  specialistRaw?: unknown
): Record<string, unknown> | undefined {
  const wordingChoice = resolveWordingChoiceFeedbackSource(wordingChoiceRaw, specialistRaw);
  const uiFlags = toRecord(uiFlagsRaw);
  const wordingEnabled =
    wordingChoice.enabled === true ||
    String(uiFlags.require_wording_pick || "").trim().toLowerCase() === "true";
  if (!wordingEnabled) return undefined;

  const feedbackReasonText = String(
    wordingChoice.feedback_reason_text ||
      toRecord(wordingChoice.compare_feedback).text ||
      ""
  ).trim();
  const userLabel = String(wordingChoice.user_label || "").trim();
  const suggestionLabel = String(wordingChoice.suggestion_label || "").trim();
  const userText = String(wordingChoice.user_text || "").trim();
  const suggestionText = String(wordingChoice.suggestion_text || "").trim();
  const userItems = normalizeStringArray(wordingChoice.user_items);
  const suggestionItems = normalizeStringArray(wordingChoice.suggestion_items);
  const wordingInstruction = String(wordingChoice.instruction || "").trim();
  const parsedInstruction = parseRetainedInstruction(wordingInstruction);
  const wordingMode = String(wordingChoice.mode || "text").trim().toLowerCase() === "list" ? "list" : "text";
  const wordingVariant = String(wordingChoice.variant || "").trim().toLowerCase();

  if (
    wordingMode === "text" &&
    (feedbackReasonText || userText || suggestionText || userLabel || suggestionLabel)
  ) {
    return {
      version: "2026-03-16.feedback_contract.v1",
      kind: "single_value_compare",
      mode: "text",
      ...(feedbackReasonText ? { rationale: feedbackReasonText } : {}),
      ...(userLabel ? { current_label: userLabel } : {}),
      ...(suggestionLabel ? { suggested_label: suggestionLabel } : {}),
      ...(userText ? { current_value: userText } : {}),
      ...(suggestionText ? { suggested_value: suggestionText } : {}),
      ...(parsedInstruction.retainedHeading ? { retained_heading: parsedInstruction.retainedHeading } : {}),
      ...(parsedInstruction.retainedItems.length > 0 ? { retained_items: parsedInstruction.retainedItems } : {}),
      ...(parsedInstruction.instructionText ? { instruction: parsedInstruction.instructionText } : {}),
    };
  }

  if (
    wordingMode === "list" &&
    (feedbackReasonText || userItems.length > 0 || suggestionItems.length > 0)
  ) {
    return {
      version: "2026-03-16.feedback_contract.v1",
      kind: wordingVariant === "grouped_list_units" ? "grouped_list_compare" : "list_edit_compare",
      mode: "list",
      ...(feedbackReasonText ? { rationale: feedbackReasonText } : {}),
      ...(userLabel ? { current_label: userLabel } : {}),
      ...(suggestionLabel ? { suggested_label: suggestionLabel } : {}),
      ...(userText ? { current_value: userText } : {}),
      ...(suggestionText ? { suggested_value: suggestionText } : {}),
      ...(userItems.length > 0 ? { current_items: userItems } : {}),
      ...(suggestionItems.length > 0 ? { suggested_items: suggestionItems } : {}),
      ...(parsedInstruction.retainedHeading ? { retained_heading: parsedInstruction.retainedHeading } : {}),
      ...(parsedInstruction.retainedItems.length > 0 ? { retained_items: parsedInstruction.retainedItems } : {}),
      ...(parsedInstruction.instructionText ? { instruction: parsedInstruction.instructionText } : {}),
    };
  }

  return undefined;
}
