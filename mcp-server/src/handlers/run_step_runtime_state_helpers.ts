import {
  STEP_FINAL_FIELD_BY_STEP_ID,
  type CanvasState,
  type ProvisionalSource,
} from "../core/state.js";

type ParseStep0FinalFn = (raw: string, fallbackName: string) => { name?: string } | null | undefined;

type CreateRunStepRuntimeStateHelpersDeps = {
  step0Id: string;
  dreamStepId: string;
  purposeStepId: string;
  bigwhyStepId: string;
  roleStepId: string;
  entityStepId: string;
  strategyStepId: string;
  targetgroupStepId: string;
  productsservicesStepId: string;
  rulesofthegameStepId: string;
  presentationStepId: string;
  dreamExplainerSpecialist: string;
  parseStep0Final: ParseStep0FinalFn;
  parseListItems: (value: string) => string[];
  canonicalizeComparableText: (value: string) => string;
  getFinalsSnapshot: (state: CanvasState) => Record<string, string>;
};

/**
 * Universal recap instruction (language-agnostic; appended to every specialist).
 * Model-driven: when user asks for recap/summary of what is established, set wants_recap=true.
 */
export const RECAP_INSTRUCTION = `UNIVERSAL RECAP (every step)
- If the user asks to summarize or recap what has been established so far (in any wording or language), set wants_recap=true. Do not use language-specific keyword lists; infer from intent.
- When wants_recap=true: set message to show the recap, localized, built ONLY from the finals:
  Start with one line: "This is what we have established so far based on our dialogue:" (localized).
  Then add one blank line (empty line).
  Then show the recap with the following formatting using HTML <strong> tags for labels:
  (1) For step_0_final: parse the pattern "Venture: <venture_type> | Name: <business_name> | Status: <existing|starting>":
     - Format as "<strong>Venture:</strong> <venture_type>" (translate "Venture" to the user's language).
     - Directly below that: "<strong>Name:</strong> <business_name>" (translate "Name" to the user's language). Show this even if business_name is "TBD".
     - Then one blank line (empty line).
  (2) For all other non-empty finals (dream_final, purpose_final, bigwhy_final, role_final, entity_final, strategy_final, targetgroup_final, productsservices_final, rulesofthegame_final): 
      - If the value is a single line: format as "<strong>Label:</strong> <value>" with Label in the user's language (e.g. "Dream:", "Purpose:", "Big Why:", "Role:", "Entity:", "Strategy:", "Target Group:", "Products and Services:", "Rules of the Game:").
      - If the value contains bullets (lines starting with "• " or "- "): format as:
        "<strong>Label:</strong>" on its own line, then each bullet on its own line prefixed with "• " (convert "- " bullets to "• ").
      - If the value contains numbered lines (lines starting with "1.", "2.", "3.", etc. or "1)", "2)", "3)", etc.): format as:
        "<strong>Label:</strong>" on its own line, then convert each numbered line to a bullet line prefixed with "• ".
      - CRITICAL: Each final must be formatted separately. Do NOT combine content from strategy_final, targetgroup_final, productsservices_final, or rulesofthegame_final into one section. Each final has its own label and its own content.
      - After each step, ALWAYS add one blank line (empty line). Skip empty finals.
  Then set question to your normal next question for this step.
- When wants_recap=false: behave as usual.`;

export function createRunStepRuntimeStateHelpers(deps: CreateRunStepRuntimeStateHelpersDeps) {
  function isBulletConsistencyStep(stepId: string): boolean {
    return (
      stepId === deps.strategyStepId ||
      stepId === deps.productsservicesStepId ||
      stepId === deps.rulesofthegameStepId
    );
  }

  function isInformationalContextPolicyStep(stepId: string): boolean {
    return (
      stepId === deps.dreamStepId ||
      stepId === deps.purposeStepId ||
      stepId === deps.bigwhyStepId ||
      stepId === deps.roleStepId ||
      stepId === deps.entityStepId ||
      stepId === deps.strategyStepId ||
      stepId === deps.targetgroupStepId ||
      stepId === deps.productsservicesStepId ||
      stepId === deps.rulesofthegameStepId
    );
  }

  const FINAL_FIELD_BY_STEP_ID: Record<string, string> = { ...STEP_FINAL_FIELD_BY_STEP_ID };

  function normalizedProvisionalByStep(state: any): Record<string, string> {
    const raw =
      state && typeof state.provisional_by_step === "object" && state.provisional_by_step !== null
        ? (state.provisional_by_step as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [String(k), String(v ?? "").trim()])
    );
  }

  function provisionalValueForStep(state: any, stepId: string): string {
    if (!stepId) return "";
    const map = normalizedProvisionalByStep(state);
    return String(map[stepId] || "").trim();
  }

  function normalizedProvisionalSourceByStep(state: any): Record<string, ProvisionalSource> {
    const raw =
      state && typeof state.provisional_source_by_step === "object" && state.provisional_source_by_step !== null
        ? (state.provisional_source_by_step as Record<string, unknown>)
        : {};
    const next: Record<string, ProvisionalSource> = {};
    for (const [stepIdRaw, sourceRaw] of Object.entries(raw)) {
      const stepId = String(stepIdRaw || "").trim();
      if (!stepId) continue;
      const source = String(sourceRaw || "").trim();
      if (
        source === "user_input" ||
        source === "wording_pick" ||
        source === "action_route" ||
        source === "system_generated"
      ) {
        next[stepId] = source;
      }
    }
    return next;
  }

  function provisionalSourceForStep(state: any, stepId: string): ProvisionalSource {
    if (!stepId) return "system_generated";
    const map = normalizedProvisionalSourceByStep(state);
    const source = String(map[stepId] || "").trim();
    if (
      source === "user_input" ||
      source === "wording_pick" ||
      source === "action_route" ||
      source === "system_generated"
    ) {
      return source;
    }
    return "system_generated";
  }

  function withProvisionalValue(
    state: CanvasState,
    stepId: string,
    value: string,
    source: ProvisionalSource
  ): CanvasState {
    if (!stepId) return state;
    const map = normalizedProvisionalByStep(state);
    const sourceMap = normalizedProvisionalSourceByStep(state);
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      delete map[stepId];
      delete sourceMap[stepId];
    } else {
      map[stepId] = trimmed;
      sourceMap[stepId] = source;
    }
    return {
      ...state,
      provisional_by_step: map,
      provisional_source_by_step: sourceMap,
    };
  }

  function clearProvisionalValue(state: CanvasState, stepId: string): CanvasState {
    return withProvisionalValue(state, stepId, "", "system_generated");
  }

  function clearStepInteractiveState(state: CanvasState, stepId: string): CanvasState {
    if (!stepId) return state;
    let next = clearProvisionalValue(state, stepId);
    const last =
      (next as any).last_specialist_result && typeof (next as any).last_specialist_result === "object"
        ? { ...((next as any).last_specialist_result as Record<string, unknown>) }
        : null;
    if (!last) return next;
    const targetField = String((last as any).wording_choice_target_field || "").trim();
    const currentStep = String((next as any).current_step || "").trim();
    const shouldResetWordingState =
      targetField === stepId ||
      (targetField === "" && currentStep === stepId) ||
      String((last as any).wording_choice_pending || "").trim() === "true";
    if (!shouldResetWordingState) return next;
    const resetLast = {
      ...last,
      wording_choice_pending: "false",
      wording_choice_selected: "",
      wording_choice_user_raw: "",
      wording_choice_user_normalized: "",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
      wording_choice_agent_current: "",
      wording_choice_mode: "",
      wording_choice_target_field: "",
      feedback_reason_key: "",
      feedback_reason_text: "",
    };
    (next as any).last_specialist_result = resetLast;
    return next;
  }

  function fieldForStep(stepId: string): string {
    if (stepId === deps.step0Id) return "step_0";
    if (stepId === deps.dreamStepId) return "dream";
    if (stepId === deps.purposeStepId) return "purpose";
    if (stepId === deps.bigwhyStepId) return "bigwhy";
    if (stepId === deps.roleStepId) return "role";
    if (stepId === deps.entityStepId) return "entity";
    if (stepId === deps.strategyStepId) return "strategy";
    if (stepId === deps.targetgroupStepId) return "targetgroup";
    if (stepId === deps.productsservicesStepId) return "productsservices";
    if (stepId === deps.rulesofthegameStepId) return "rulesofthegame";
    if (stepId === deps.presentationStepId) return "presentation_brief";
    return "";
  }

  function preserveProgressForInformationalAction(
    stepId: string,
    specialistResult: any,
    previousSpecialist: Record<string, unknown>,
    state: CanvasState
  ): any {
    const safe = specialistResult && typeof specialistResult === "object" ? { ...specialistResult } : {};
    const field = fieldForStep(stepId);
    const finalField = FINAL_FIELD_BY_STEP_ID[stepId] || "";
    const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
    const provisionalValue = provisionalValueForStep(state, stepId);
    const previousValue = field ? String((previousSpecialist as any)[field] || "").trim() : "";
    const carriedValue = previousValue || provisionalValue || finalValue;
    const previousRefined = String((previousSpecialist as any).refined_formulation || "").trim();
    const carriedRefined = previousRefined || carriedValue;

    if (field) {
      (safe as any)[field] = carriedValue;
    }

    safe.refined_formulation = carriedRefined;

    if (isBulletConsistencyStep(stepId)) {
      const previousStatements = Array.isArray((previousSpecialist as any).statements)
        ? ((previousSpecialist as any).statements as string[])
        : [];
      const carriedStatements = previousStatements
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      const fallbackStatements = deps.parseListItems(carriedValue || carriedRefined)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      const statements = carriedStatements.length > 0 ? carriedStatements : fallbackStatements;
      safe.statements = statements;
      const joined = statements.join("\n");
      if (field) {
        (safe as any)[field] = joined;
      }
      safe.refined_formulation = joined;
    }

    return safe;
  }

  function informationalProgressFingerprint(
    stepId: string,
    specialist: Record<string, unknown>,
    state: CanvasState
  ): { value: string; statements: string[] } {
    const field = fieldForStep(stepId);
    const finalField = FINAL_FIELD_BY_STEP_ID[stepId] || "";
    const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
    const provisionalValue = provisionalValueForStep(state, stepId);
    const fieldValue = field ? String((specialist as any)[field] || "").trim() : "";
    const refined = String((specialist as any).refined_formulation || "").trim();
    const value = fieldValue || refined || provisionalValue || finalValue;
    const statements = isBulletConsistencyStep(stepId)
      ? (
        Array.isArray((specialist as any).statements)
          ? ((specialist as any).statements as string[])
          : deps.parseListItems(value)
      )
        .map((line) => String(line || "").trim())
        .filter(Boolean)
      : [];
    return { value, statements };
  }

  function informationalActionMutatesProgress(
    stepId: string,
    specialistResult: Record<string, unknown>,
    previousSpecialist: Record<string, unknown>,
    state: CanvasState
  ): boolean {
    if (!isInformationalContextPolicyStep(stepId)) return false;
    const baseline = informationalProgressFingerprint(
      stepId,
      preserveProgressForInformationalAction(stepId, {}, previousSpecialist, state),
      state
    );
    const current = informationalProgressFingerprint(stepId, specialistResult, state);
    const baselineValue = deps.canonicalizeComparableText(baseline.value);
    const currentValue = deps.canonicalizeComparableText(current.value);
    if (baselineValue !== currentValue) return true;
    if (isBulletConsistencyStep(stepId)) {
      const baselineItems = baseline.statements.map((line) => deps.canonicalizeComparableText(line));
      const currentItems = current.statements.map((line) => deps.canonicalizeComparableText(line));
      if (baselineItems.length !== currentItems.length) return true;
      for (let i = 0; i < baselineItems.length; i += 1) {
        if (baselineItems[i] !== currentItems[i]) return true;
      }
    }
    return false;
  }

  function wordingStepLabel(stepId: string): string {
    if (stepId === deps.dreamStepId) return "Dream";
    if (stepId === deps.purposeStepId) return "Purpose";
    if (stepId === deps.bigwhyStepId) return "Big Why";
    if (stepId === deps.roleStepId) return "Role";
    if (stepId === deps.entityStepId) return "Entity";
    if (stepId === deps.strategyStepId) return "Strategy";
    if (stepId === deps.targetgroupStepId) return "Target Group";
    if (stepId === deps.productsservicesStepId) return "Products and Services";
    if (stepId === deps.rulesofthegameStepId) return "Rules of the game";
    if (stepId === deps.presentationStepId) return "Presentation";
    return "step";
  }

  function wordingCompanyName(state: CanvasState): string {
    const fromState = String((state as any)?.business_name || "").trim();
    if (fromState && fromState !== "TBD") return fromState;

    const step0Final = String((state as any)?.step_0_final || "").trim();
    if (step0Final) {
      const parsed = deps.parseStep0Final(step0Final, "TBD");
      const parsedName = String(parsed?.name || "").trim();
      if (parsedName && parsedName !== "TBD") return parsedName;
    }

    return "your future company";
  }

  function wordingSelectionMessage(stepId: string, state: CanvasState, activeSpecialist = ""): string {
    const specialist = String(activeSpecialist || (state as any)?.active_specialist || "").trim();
    if (stepId === deps.dreamStepId && specialist === deps.dreamExplainerSpecialist) return "";
    return `Your current ${wordingStepLabel(stepId)} for ${wordingCompanyName(state)} is:`;
  }

  /** Only flag explicit injection markers; never flag bullets/requirements/goals (business brief). */
  function looksLikeMetaInstruction(userMessage: string): boolean {
    const t = String(userMessage ?? "").trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    const injectionMarkers = [
      "system:",
      "assistant:",
      "ignore previous instructions",
      "ignore all previous",
      "disregard previous",
      "you are chatgpt",
      "you are a model",
      "you are an ai",
      "pretend you are",
      "roleplay as",
      "act as ",
    ];
    return injectionMarkers.some((m) => lower.includes(m));
  }

  function extractUserMessageFromWrappedInput(raw: string): string {
    const t = String(raw ?? "");
    if (!t.trim()) return "";

    // Common wrapper used by planners / orchestrators:
    // "CURRENT_STEP_ID: step_0 | USER_MESSAGE: <text>"
    const m1 = t.match(/\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
    if (m1 && typeof m1[1] === "string") return m1[1].trim();

    // Sometimes the wrapper is multi-line and includes "PLANNER_INPUT:".
    const m2 = t.match(/\bPLANNER_INPUT\s*:\s*[\s\S]*?\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
    if (m2 && typeof m2[1] === "string") return m2[1].trim();

    // Otherwise, return empty to indicate "no extraction happened".
    return "";
  }

  function isPristineStateForStart(state: CanvasState): boolean {
    return (
      String(state.current_step) === deps.step0Id &&
      String((state as any).step_0_final ?? "").trim() === "" &&
      String((state as any).dream_final ?? "").trim() === "" &&
      String((state as any).intro_shown_session ?? "") !== "true" &&
      Object.keys((state as any).last_specialist_result ?? {}).length === 0
    );
  }

  function buildSpecialistContextBlock(state: CanvasState): string {
    const safe = (value: unknown) => String(value ?? "").replace(/\r\n/g, "\n");
    const last =
      state.last_specialist_result && typeof state.last_specialist_result === "object"
        ? JSON.stringify(state.last_specialist_result)
        : "";

    const finals = { ...deps.getFinalsSnapshot(state) };
    const provisional = normalizedProvisionalByStep(state);
    for (const [stepId, finalField] of Object.entries(FINAL_FIELD_BY_STEP_ID)) {
      if (stepId === deps.step0Id) continue;
      if (!finalField || finals[finalField]) continue;
      const staged = String(provisional[stepId] || "").trim();
      if (!staged) continue;
      finals[finalField] = staged;
    }
    const finalsLines =
      Object.keys(finals).length === 0
        ? "(none yet)"
        : Object.entries(finals)
            .map(([k, v]) => `- ${k}: ${safe(v)}`)
            .join("\n");

    return `STATE FINALS (canonical; use for recap; do not invent)
${finalsLines}

RECAP RULE: Only include in a recap the finals listed above. Do not add placeholder values for missing steps.

STATE META (do not output this section)
- intro_shown_for_step: ${safe((state as any).intro_shown_for_step)}
- intro_shown_session: ${safe((state as any).intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
  }

  return {
    RECAP_INSTRUCTION,
    FINAL_FIELD_BY_STEP_ID,
    normalizedProvisionalByStep,
    provisionalValueForStep,
    provisionalSourceForStep,
    withProvisionalValue,
    clearProvisionalValue,
    clearStepInteractiveState,
    informationalActionMutatesProgress,
    fieldForStep,
    wordingStepLabel,
    wordingCompanyName,
    wordingSelectionMessage,
    looksLikeMetaInstruction,
    extractUserMessageFromWrappedInput,
    isPristineStateForStart,
    buildSpecialistContextBlock,
  };
}
