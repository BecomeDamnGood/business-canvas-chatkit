import {
  STEP_FINAL_FIELD_BY_STEP_ID,
  type CanvasState,
  type ProvisionalSource,
} from "../core/state.js";
import { buildContextSafeLastSpecialistResult } from "./run_step_context_whitelist.js";
import { isValidStepValueForStorage } from "./run_step_value_shape.js";

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
  uiDefaultString: (key: string, fallback?: string) => string;
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
  function localeBaseFromState(state: CanvasState | null | undefined): string {
    const raw = String(
      (state as any)?.ui_strings_lang ||
      (state as any)?.ui_strings_requested_lang ||
      (state as any)?.language ||
      ""
    )
      .trim()
      .toLowerCase();
    if (!raw) return "";
    return raw.split("-")[0] || "";
  }

  function shouldUseDefaultFallback(state: CanvasState | null | undefined): boolean {
    const base = localeBaseFromState(state);
    return !base || base === "en";
  }

  function localizedUiString(
    state: CanvasState | null | undefined,
    key: string,
    fallback: string
  ): string {
    const map = state && typeof (state as Record<string, unknown>).ui_strings === "object"
      ? ((state as Record<string, unknown>).ui_strings as Record<string, unknown>)
      : null;
    if (map) {
      const candidate = String(map[key] || "").trim();
      if (candidate) return candidate;
    }
    if (!shouldUseDefaultFallback(state)) return "";
    return String(fallback || "").trim();
  }

  function dedupeItems(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of items) {
      const item = String(raw || "").trim();
      if (!item) continue;
      const key = deps.canonicalizeComparableText(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function splitCamelTitleItems(raw: string): string[] {
    const tokens = String(raw || "")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length < 3) return [];
    const chunks: string[] = [];
    let current: string[] = [];
    for (const token of tokens) {
      const plain = token.replace(/^[("'\[]+|[)"'\],.;:!?]+$/g, "");
      const startsUpper = /^\p{Lu}/u.test(plain);
      if (startsUpper && current.length > 0) {
        chunks.push(current.join(" ").trim());
        current = [token];
      } else {
        current.push(token);
      }
    }
    if (current.length > 0) chunks.push(current.join(" ").trim());
    const cleaned = chunks
      .map((chunk) => chunk.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return cleaned.length >= 2 ? cleaned : [];
  }

  function productsServicesItemsFromValue(rawValue: string): string[] {
    const raw = String(rawValue || "").trim();
    if (!raw) return [];
    const parsed = deps.parseListItems(raw)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (parsed.length >= 2) return dedupeItems(parsed);

    const punctSplit = raw
      .replace(/\r/g, "\n")
      .split(/[;\n,]+/)
      .map((line) => String(line || "").replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean);
    if (punctSplit.length >= 2) return dedupeItems(punctSplit);

    const titleSplit = splitCamelTitleItems(raw);
    if (titleSplit.length >= 2) return dedupeItems(titleSplit);

    return dedupeItems([raw]);
  }

  function localeTokenSet(state: CanvasState | null | undefined, key: string): string[] {
    const raw = localizedUiString(state, key, deps.uiDefaultString(key));
    return String(raw || "")
      .split("|")
      .map((token) => String(token || "").trim().toLowerCase())
      .filter(Boolean);
  }

  function classifyProductsServicesItems(
    state: CanvasState | null | undefined,
    items: string[]
  ): "single_product" | "single_service" | "single_mixed" | "plural_products" | "plural_services" | "plural_mixed" {
    const normalized = items.map((line) => String(line || "").trim()).filter(Boolean);
    if (normalized.length === 0) return "plural_mixed";
    const productTokens = localeTokenSet(state, "productsservices.classifier.product.tokens");
    const serviceTokens = localeTokenSet(state, "productsservices.classifier.service.tokens");
    let productCount = 0;
    let serviceCount = 0;
    let unknownCount = 0;
    for (const itemRaw of normalized) {
      const item = String(itemRaw || "").toLowerCase();
      const productMatch = productTokens.some((token) => token && item.includes(token));
      const serviceMatch = serviceTokens.some((token) => token && item.includes(token));
      if (productMatch && !serviceMatch) {
        productCount += 1;
      } else if (serviceMatch && !productMatch) {
        serviceCount += 1;
      } else {
        unknownCount += 1;
      }
    }
    if (normalized.length === 1) {
      if (productCount === 1) return "single_product";
      if (serviceCount === 1) return "single_service";
      return "single_mixed";
    }
    if (unknownCount === 0 && productCount > 0 && serviceCount === 0) return "plural_products";
    if (unknownCount === 0 && serviceCount > 0 && productCount === 0) return "plural_services";
    return "plural_mixed";
  }

  function productsServicesCurrentHeading(state: CanvasState | null | undefined, companyName: string, items: string[]): string {
    const variant = classifyProductsServicesItems(state, items);
    const key = `productsservices.current.heading.${variant}`;
    const fallback = deps.uiDefaultString(key);
    const template = localizedUiString(state, key, fallback);
    const rendered = String(template || "").replace(/\{0\}/g, companyName).trim();
    if (!rendered) return "";
    const base = rendered.replace(/[.!?。！？]+$/g, "").replace(/\s*:\s*$/g, "").trim();
    return base ? `${base}:` : "";
  }

  function wordingStepLabelKey(stepId: string): string {
    if (stepId === deps.dreamStepId) return "offtopic.step.dream";
    if (stepId === deps.purposeStepId) return "offtopic.step.purpose";
    if (stepId === deps.bigwhyStepId) return "offtopic.step.bigwhy";
    if (stepId === deps.roleStepId) return "offtopic.step.role";
    if (stepId === deps.entityStepId) return "offtopic.step.entity";
    if (stepId === deps.strategyStepId) return "offtopic.step.strategy";
    if (stepId === deps.targetgroupStepId) return "offtopic.step.targetgroup";
    if (stepId === deps.productsservicesStepId) return "offtopic.step.productsservices";
    if (stepId === deps.rulesofthegameStepId) return "offtopic.step.rulesofthegame";
    if (stepId === deps.presentationStepId) return "offtopic.step.presentation";
    return "";
  }

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
    let next = state;
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
      wording_choice_list_semantics: "delta",
      wording_choice_agent_current: "",
      wording_choice_mode: "",
      wording_choice_target_field: "",
      wording_choice_presentation: "",
      wording_choice_variant: "",
      wording_choice_user_label: "",
      wording_choice_suggestion_label: "",
      wording_choice_user_variant_semantics: "",
      wording_choice_user_variant_stepworthy: "",
      feedback_reason_key: "",
      feedback_reason_text: "",
      pending_suggestion_intent: "",
      pending_suggestion_anchor: "",
      pending_suggestion_seed_source: "",
      pending_suggestion_feedback_text: "",
      pending_suggestion_presentation_mode: "",
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
      const fallbackStatements = (
        stepId === deps.productsservicesStepId
          ? productsServicesItemsFromValue(carriedValue || carriedRefined)
          : deps.parseListItems(carriedValue || carriedRefined)
      )
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
          : (
            stepId === deps.productsservicesStepId
              ? productsServicesItemsFromValue(value)
              : deps.parseListItems(value)
          )
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

  function wordingStepLabel(stepId: string, state?: CanvasState | null): string {
    const key = wordingStepLabelKey(stepId);
    if (key) {
      const fallback = deps.uiDefaultString(key);
      const localized = localizedUiString(state || null, key, fallback);
      if (localized) return localized;
    }
    return String(stepId || "").trim();
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

    return localizedUiString(
      state,
      "offtopic.companyFallback",
      deps.uiDefaultString("offtopic.companyFallback")
    );
  }

  function wordingSelectionValue(stepId: string, state: CanvasState, selectedValue = ""): string {
    const normalizeBulletConsistencySelectionValue = (rawValue: string): string => {
      const value = String(rawValue || "").trim();
      if (!value || !isBulletConsistencyStep(stepId)) return value;
      const items = (
        stepId === deps.productsservicesStepId
          ? productsServicesItemsFromValue(value)
          : deps.parseListItems(value)
      )
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (items.length === 0) return value;
      return items.map((line) => `• ${line}`).join("\n");
    };
    const explicit = normalizeBulletConsistencySelectionValue(selectedValue);
    if (explicit) return explicit;
    const last =
      (state as any)?.last_specialist_result && typeof (state as any).last_specialist_result === "object"
        ? ((state as any).last_specialist_result as Record<string, unknown>)
        : {};
    const field = fieldForStep(stepId);
    const fieldValue = field ? String(last[field] || "").trim() : "";
    const refined = String(last.refined_formulation || "").trim();
    const wordingValue = String(last.wording_choice_agent_current || "").trim();
    const provisional = provisionalValueForStep(state, stepId);
    const finalField = FINAL_FIELD_BY_STEP_ID[stepId] || "";
    const finalValue = finalField ? String((state as any)?.[finalField] || "").trim() : "";
    const resolved = fieldValue || refined || wordingValue || provisional || finalValue;
    if (!resolved) return "";
    return normalizeBulletConsistencySelectionValue(resolved);
  }

  function wordingSelectionMessage(
    stepId: string,
    state: CanvasState,
    activeSpecialist = "",
    selectedValue = ""
  ): string {
    const specialist = String(activeSpecialist || (state as any)?.active_specialist || "").trim();
    if (stepId === deps.dreamStepId && specialist === deps.dreamExplainerSpecialist) return "";
    const currentValue = wordingSelectionValue(stepId, state, selectedValue);
    if (stepId === deps.productsservicesStepId) {
      const items = productsServicesItemsFromValue(currentValue);
      const company = wordingCompanyName(state);
      const heading = productsServicesCurrentHeading(state, company, items);
      if (heading && items.length > 0) {
        return `${heading}\n${items.map((line) => `• ${line}`).join("\n")}`.trim();
      }
      if (heading && currentValue) return `${heading}\n${currentValue}`.trim();
      if (items.length > 0) return items.map((line) => `• ${line}`).join("\n");
      return currentValue;
    }
    const template = localizedUiString(
      state,
      "offtopic.current.template",
      deps.uiDefaultString("offtopic.current.template")
    );
    const headingRaw = String(template || "")
      .replace(/\{0\}/g, wordingStepLabel(stepId, state))
      .replace(/\{1\}/g, wordingCompanyName(state))
      .trim();
    const headingBase = headingRaw.replace(/[.!?]+$/g, "").replace(/\s*:\s*$/g, "").trim();
    const heading = headingBase ? `${headingBase}:` : headingRaw;
    if (heading && currentValue) return `${heading}\n\n${currentValue}`.trim();
    if (currentValue) return currentValue;
    return "";
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
    const contextSnapshotV2Enabled = String(process.env.BSC_CONTEXT_SNAPSHOT_V2 || "1").trim() !== "0";
    const lastRaw =
      state.last_specialist_result && typeof state.last_specialist_result === "object"
        ? (state.last_specialist_result as Record<string, unknown>)
        : {};
    const pendingSuggestionIntent = String(lastRaw.pending_suggestion_intent || "").trim();
    const pendingSuggestionAnchor = String(lastRaw.pending_suggestion_anchor || "").trim();
    const pendingSuggestionSeedSource = String(lastRaw.pending_suggestion_seed_source || "").trim();
    const pendingSuggestionFeedbackText = String(lastRaw.pending_suggestion_feedback_text || "").trim();
    const pendingSuggestionPresentationMode = String(lastRaw.pending_suggestion_presentation_mode || "").trim();
    const last = JSON.stringify(
      contextSnapshotV2Enabled ? buildContextSafeLastSpecialistResult(state) : lastRaw
    );

    const finals = { ...deps.getFinalsSnapshot(state) };
    const provisional = normalizedProvisionalByStep(state);
    for (const [stepId, finalField] of Object.entries(FINAL_FIELD_BY_STEP_ID)) {
      if (stepId === deps.step0Id) continue;
      if (!finalField || finals[finalField]) continue;
      const staged = String(provisional[stepId] || "").trim();
      if (!staged) continue;
      if (!isValidStepValueForStorage(stepId, staged)) continue;
      finals[finalField] = staged;
    }
    const finalsLines =
      Object.keys(finals).length === 0
        ? "(none yet)"
        : Object.entries(finals)
            .map(([k, v]) => `- ${k}: ${safe(v)}`)
            .join("\n");
    const pendingSuggestionContractLines =
      pendingSuggestionIntent && pendingSuggestionAnchor
        ? [
            "",
            "PENDING SUGGESTION CONTRACT (follow exactly when present)",
            `- intent: ${safe(pendingSuggestionIntent)}`,
            `- anchor: ${safe(pendingSuggestionAnchor)}`,
            `- seed_source: ${safe(pendingSuggestionSeedSource)}`,
            `- presentation_mode: ${safe(pendingSuggestionPresentationMode)}`,
            pendingSuggestionFeedbackText
              ? `- feedback_text: ${safe(pendingSuggestionFeedbackText)}`
              : "- feedback_text: (none)",
            "- If intent is feedback_on_suggestion or reject_suggestion_explicit with anchor suggestion, rewrite the previous suggestion itself.",
            "- If intent is feedback_on_current_value with anchor current_value, rewrite the current accepted wording itself.",
            "- Stay on step content. Do not switch to coaching, motivation, process explanation, or meta-step framing.",
            "- Return the next candidate wording for the same step field.",
          ].join("\n")
        : "";

    return `STATE FINALS (canonical; use for recap; do not invent)
${finalsLines}

RECAP RULE: Only include in a recap the finals listed above. Do not add placeholder values for missing steps.

STATE META (do not output this section)
- intro_shown_for_step: ${safe((state as any).intro_shown_for_step)}
- intro_shown_session: ${safe((state as any).intro_shown_session)}
${pendingSuggestionContractLines}
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
