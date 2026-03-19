function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimString(value: unknown): string {
  return String(value || "").trim();
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

export function resolveCompareFeedbackSource(
  compareRaw: unknown,
  specialistRaw?: unknown
): Record<string, unknown> {
  const compare = toRecord(compareRaw);
  if (Object.keys(compare).length === 0) return compare;

  const specialist = toRecord(specialistRaw);
  const userText = String(
    compare.user_text ||
      specialist.compare_user_normalized ||
      specialist.compare_user_raw ||
      ""
  ).trim();
  const suggestionText = String(
    compare.suggestion_text ||
      specialist.compare_agent_current ||
      specialist.refined_formulation ||
      ""
  ).trim();
  const userItems =
    normalizeStringArray(compare.user_items).length > 0
      ? normalizeStringArray(compare.user_items)
      : normalizeStringArray(specialist.compare_user_items);
  const suggestionItems =
    normalizeStringArray(compare.suggestion_items).length > 0
      ? normalizeStringArray(compare.suggestion_items)
      : normalizeStringArray(specialist.compare_suggestion_items);

  return {
    ...compare,
    user_text: userText,
    suggestion_text: suggestionText,
    user_items: userItems,
    suggestion_items: suggestionItems,
  };
}

export function synthesizeUiFeedbackContractFromCompare(
  compareRaw: unknown,
  uiFlagsRaw?: unknown,
  specialistRaw?: unknown
): Record<string, unknown> | undefined {
  const compare = resolveCompareFeedbackSource(compareRaw, specialistRaw);
  const uiFlags = toRecord(uiFlagsRaw);
  const wordingEnabled =
    compare.enabled === true ||
    String(uiFlags.require_compare_pick || "").trim().toLowerCase() === "true";
  if (!wordingEnabled) return undefined;

  const feedbackReasonText = String(
    compare.feedback_reason_text ||
      toRecord(compare.compare_feedback).text ||
      ""
  ).trim();
  const userLabel = String(compare.user_label || "").trim();
  const suggestionLabel = String(compare.suggestion_label || "").trim();
  const userText = String(compare.user_text || "").trim();
  const suggestionText = String(compare.suggestion_text || "").trim();
  const userItems = normalizeStringArray(compare.user_items);
  const suggestionItems = normalizeStringArray(compare.suggestion_items);
  const wordingInstruction = String(compare.instruction || "").trim();
  const parsedInstruction = parseRetainedInstruction(wordingInstruction);
  const wordingMode = String(compare.mode || "text").trim().toLowerCase() === "list" ? "list" : "text";
  const wordingVariant = String(compare.variant || "").trim().toLowerCase();

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

export function normalizeUiFeedbackContractSource(
  raw: unknown,
  specialistRaw?: unknown
): Record<string, unknown> | undefined {
  const record = toRecord(raw);
  const kind = trimString(record.kind);
  if (
    kind !== "single_value_canonical_suggestion" &&
    kind !== "single_value_compare" &&
    kind !== "grouped_list_compare" &&
    kind !== "list_edit_compare" &&
    kind !== "list_duplicate_merge_compare"
  ) {
    return undefined;
  }

  const specialist = toRecord(specialistRaw);
  const mode = trimString(record.mode).toLowerCase() === "list" ? "list" : "text";
  const heading = trimString(record.heading);
  const supportText =
    kind === "single_value_canonical_suggestion" ? "" : trimString(record.support_text);
  const rationale = trimString(record.rationale);
  const currentLabel = trimString(record.current_label);
  const suggestedLabel = trimString(record.suggested_label);
  const retainedHeading = trimString(record.retained_heading);
  const instruction = trimString(record.instruction);
  const currentItems = normalizeStringArray(record.current_items);
  const suggestedItems = normalizeStringArray(record.suggested_items);
  const retainedItems = normalizeStringArray(record.retained_items);
  const currentValue = trimString(
    record.current_value ||
      currentItems.join("\n") ||
      specialist.compare_user_normalized ||
      specialist.compare_user_raw
  );
  const suggestedValue = trimString(
    record.suggested_value ||
      suggestedItems.join("\n") ||
      specialist.compare_agent_current ||
      specialist.refined_formulation
  );

  if (
    !heading &&
    !supportText &&
    !rationale &&
    !currentLabel &&
    !suggestedLabel &&
    !currentValue &&
    !suggestedValue &&
    !retainedHeading &&
    !instruction &&
    currentItems.length === 0 &&
    suggestedItems.length === 0 &&
    retainedItems.length === 0
  ) {
    return undefined;
  }

  if (kind === "single_value_compare" && !currentValue) {
    return undefined;
  }

  return {
    version: "2026-03-16.feedback_contract.v1",
    kind,
    mode,
    ...(heading ? { heading } : {}),
    ...(supportText ? { support_text: supportText } : {}),
    ...(rationale ? { rationale } : {}),
    ...(currentLabel ? { current_label: currentLabel } : {}),
    ...(suggestedLabel ? { suggested_label: suggestedLabel } : {}),
    ...(currentValue ? { current_value: currentValue } : {}),
    ...(suggestedValue ? { suggested_value: suggestedValue } : {}),
    ...(currentItems.length > 0 ? { current_items: currentItems } : {}),
    ...(suggestedItems.length > 0 ? { suggested_items: suggestedItems } : {}),
    ...(retainedHeading ? { retained_heading: retainedHeading } : {}),
    ...(retainedItems.length > 0 ? { retained_items: retainedItems } : {}),
    ...(instruction ? { instruction } : {}),
  };
}
