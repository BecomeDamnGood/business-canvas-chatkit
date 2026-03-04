import type { CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
import { DREAM_STEP_ID } from "../steps/dream.js";
import { DREAM_EXPLAINER_SPECIALIST } from "../steps/dream_explainer.js";
import { PURPOSE_STEP_ID } from "../steps/purpose.js";
import { BIGWHY_STEP_ID } from "../steps/bigwhy.js";
import { ROLE_STEP_ID } from "../steps/role.js";
import { ENTITY_STEP_ID } from "../steps/entity.js";
import { STRATEGY_STEP_ID } from "../steps/strategy.js";
import { TARGETGROUP_STEP_ID } from "../steps/targetgroup.js";
import { PRODUCTSSERVICES_STEP_ID } from "../steps/productsservices.js";
import { RULESOFTHEGAME_STEP_ID } from "../steps/rulesofthegame.js";
import { PRESENTATION_STEP_ID } from "../steps/presentation.js";
import { SPECIALIST_META_TOPICS, type SpecialistMetaTopic } from "../steps/user_intent.js";

export const LANGUAGE_LOCK_INSTRUCTION = `LANGUAGE OVERRIDE (HARD)
- ALWAYS produce ALL user-facing JSON strings in the LANGUAGE parameter.
- If LANGUAGE is missing or empty: detect language from USER_MESSAGE and use that language.
- Once LANGUAGE is set, keep using it unless the user explicitly requests a different language.
- Do NOT mix languages.
- Do not translate or alter the product name 'The Business Strategy Canvas Builder'; keep it exactly as-is.`;

/**
 * Universal meta vs off-topic policy (steps other than Step 0 only).
 * Appended to every step prompt except step_0. Intent-driven; no language-specific keyword lists.
 */
export const UNIVERSAL_META_OFFTOPIC_POLICY = `UNIVERSAL_META_OFFTOPIC_POLICY (apply only on steps after Step 0)

1) ALLOWED META (always answer briefly, then return to the step)
Treat as allowed at any time; infer from intent (no language-specific keyword lists):
- Profile/credibility questions about the method creator or model origin
- Questions about process/model value ("why this is needed", "what is the point")
- Questions about who this builder is for, skipping a step, going back a step, or whether a step feels pointless
- Questions about session storage/privacy and canvas business value
- Requests to recap what we have established so far (use wants_recap above; do not replace that mechanism)
After answering: put the short answer in message, then set question to your normal next question for this step.

2) OFF-TOPIC OR NONSENSE (Step-0 tone + deterministic redirect)
If the user asks something unrelated to The Business Strategy Canvas Builder or the current step:
- action must be ASK.
- message must follow this structure (localized):
  Sentence 1: short, friendly, empathetic, non-judgmental boundary. Light humor is allowed as a small wink (never sarcastic, never at the user's expense).
  Sentence 2 (optional): include only for clearly off-topic/nonsense signals; keep the same tone.
  Sentence 3 (always): fixed redirect with this meaning: "Let's continue with the <step name> of <company name>." If company name is unknown, use the localized equivalent of "my future company".
- Keep question for normal contract-driven next-step continuation; do not output numbered options in message.`;

/** @deprecated Use UNIVERSAL_META_OFFTOPIC_POLICY. Kept for test backward compatibility. */
export const OFF_TOPIC_POLICY = UNIVERSAL_META_OFFTOPIC_POLICY;

export const OFFTOPIC_FLAG_CONTRACT_INSTRUCTION = `OFFTOPIC CONTRACT (HARD)
- Always return a boolean field "is_offtopic".
- Set is_offtopic=false when the user's input can be incorporated into the current step output.
- Set is_offtopic=true only when the input is unrelated to this step.
- Meta intents (process value, model credibility, profile, recap) are not off-topic: keep is_offtopic=false for those.
- If is_offtopic=true: answer briefly in message, do not ask to proceed to the next step, and keep proceed flags false.`;

export const USER_INTENT_CONTRACT_INSTRUCTION = `USER_INTENT CONTRACT (HARD)
- Always return a string field "user_intent" with one of:
  STEP_INPUT, WHY_NEEDED, RESISTANCE, INSPIRATION_REQUEST, META_QUESTION, RECAP_REQUEST, OFFTOPIC.
- Infer user_intent from meaning and context (semantic intent), not from language-specific keyword lists.
- If unsure, set user_intent="STEP_INPUT".
- If wants_recap=true, set user_intent="RECAP_REQUEST".
- If is_offtopic=true for unrelated content, set user_intent="OFFTOPIC".
- For process/step-benefit doubt ("what is the point / why this is needed"), set user_intent to WHY_NEEDED or RESISTANCE accordingly.`;

export const META_TOPIC_CONTRACT_INSTRUCTION = `META_TOPIC CONTRACT (HARD)
- Always return a string field "meta_topic" with one of:
  NONE, MODEL_VALUE, MODEL_CREDIBILITY, BEN_PROFILE, TOOL_AUDIENCE, STEP_SKIP_NOT_SUPPORTED, STEP_POINTLESS, STEP_BACK_NOT_SUPPORTED, CANVAS_VALUE, SESSION_STORAGE, RECAP.
- Infer meta_topic from meaning/context semantically, not from language-specific keyword lists.
- Set meta_topic="MODEL_VALUE" for process/model-value questions.
- Set meta_topic="MODEL_CREDIBILITY" for model/method credibility or origin questions.
- Set meta_topic="BEN_PROFILE" for profile/credibility questions about the method creator.
- Set meta_topic="TOOL_AUDIENCE" for "who is this for" type questions.
- Set meta_topic="STEP_SKIP_NOT_SUPPORTED" for requests to skip the current step.
- Set meta_topic="STEP_POINTLESS" when users explicitly say the step is pointless/useless.
- Set meta_topic="STEP_BACK_NOT_SUPPORTED" when users ask to go back to a previous step.
- Set meta_topic="CANVAS_VALUE" for "what is the value of this canvas" type questions.
- Set meta_topic="SESSION_STORAGE" for "is this saved/stored" type questions.
- If the user asks for their current step output or previous step output, classify as recap: wants_recap=true, user_intent="RECAP_REQUEST", meta_topic="RECAP".
- Set meta_topic="RECAP" when wants_recap=true.
- Set meta_topic="NONE" for normal step input, inspiration-only requests, or generic off-topic content.`;

type RunStepPolicyMetaDeps = {
  fieldForStep: (stepId: string) => string;
  wordingStepLabel: (stepId: string) => string;
  finalFieldByStepId: Record<string, string>;
  provisionalValueForStep: (state: CanvasState, stepId: string) => string;
  parseStep0Final: (step0Final: string, fallbackName: string) => { venture: string; name: string; status: string };
  stripChoiceInstructionNoise: (value: string) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
};

const OFFTOPIC_STEP_LABEL_UI_KEY_BY_STEP: Record<string, string> = {
  [DREAM_STEP_ID]: "offtopic.step.dream",
  [PURPOSE_STEP_ID]: "offtopic.step.purpose",
  [BIGWHY_STEP_ID]: "offtopic.step.bigwhy",
  [ROLE_STEP_ID]: "offtopic.step.role",
  [ENTITY_STEP_ID]: "offtopic.step.entity",
  [STRATEGY_STEP_ID]: "offtopic.step.strategy",
  [TARGETGROUP_STEP_ID]: "offtopic.step.targetgroup",
  [PRODUCTSSERVICES_STEP_ID]: "offtopic.step.productsservices",
  [RULESOFTHEGAME_STEP_ID]: "offtopic.step.rulesofthegame",
  [PRESENTATION_STEP_ID]: "offtopic.step.presentation",
};

const BEN_PROFILE_IMAGE_URL = "/ui/assets/ben-steenstra.webp";
const BEN_PROFILE_WEBSITE_URL = "https://www.bensteenstra.com";
const SPECIALIST_META_TOPIC_SET = new Set<string>(SPECIALIST_META_TOPICS);
const META_TOPIC_LOCALES_OFFTOPIC_DOC = new Set<string>([
  "en",
  "nl",
  "de",
  "fr",
  "es",
  "it",
  "ja",
  "pt",
  "hi",
  "id",
  "ko",
  "zh",
]);

type MetaTopicRouteConfig = {
  ui_key: string;
  append_redirect: boolean;
  append_current_context: boolean;
  use_profile_media: boolean;
  enabled_locales: ReadonlySet<string>;
};

const META_TOPIC_ROUTE_REGISTRY: Partial<Record<SpecialistMetaTopic, MetaTopicRouteConfig>> = {
  TOOL_AUDIENCE: {
    ui_key: "meta.topic.toolAudience.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
  STEP_SKIP_NOT_SUPPORTED: {
    ui_key: "meta.topic.stepSkipNotSupported.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
  STEP_POINTLESS: {
    ui_key: "meta.topic.stepPointless.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
  STEP_BACK_NOT_SUPPORTED: {
    ui_key: "meta.topic.stepBackNotSupported.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
  CANVAS_VALUE: {
    ui_key: "meta.topic.canvasValue.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
  SESSION_STORAGE: {
    ui_key: "meta.topic.sessionStorage.body",
    append_redirect: true,
    append_current_context: false,
    use_profile_media: false,
    enabled_locales: META_TOPIC_LOCALES_OFFTOPIC_DOC,
  },
};

const MOTIVATION_MISSING_PIECE_BY_STEP: Record<string, string> = {
  [STEP_0_ID]: "the concrete starting point of your business",
  [DREAM_STEP_ID]: "the future change your company truly wants to create",
  [PURPOSE_STEP_ID]: "the deeper reason your work matters beyond output",
  [BIGWHY_STEP_ID]: "the deeper meaning that keeps your direction alive under pressure",
  [ROLE_STEP_ID]: "the stable contribution your company chooses to make",
  [ENTITY_STEP_ID]: "the clear identity people can immediately understand",
  [STRATEGY_STEP_ID]: "the focus choices that protect execution and consistency",
  [TARGETGROUP_STEP_ID]: "the specific audience this is really for",
  [PRODUCTSSERVICES_STEP_ID]: "the concrete value you will actually deliver",
  [RULESOFTHEGAME_STEP_ID]: "the non-negotiable rules that protect quality and trust",
  [PRESENTATION_STEP_ID]: "the story that makes your choices clear and usable for others",
};

const MOTIVATION_QUOTES_BY_STEP: Record<string, string[]> = {
  [STEP_0_ID]: [
    `Do you know what Dwight D. Eisenhower said: "Plans are worthless, but planning is everything."`,
    `Do you know what Arthur Ashe said: "Start where you are. Use what you have. Do what you can."`,
    `Do you know what James Clear said: "You do not rise to the level of your goals. You fall to the level of your systems."`,
  ],
  [DREAM_STEP_ID]: [
    `Do you know what Eleanor Roosevelt said: "The future belongs to those who believe in the beauty of their dreams."`,
    `Do you know what Nelson Mandela said: "It always seems impossible until it’s done."`,
    `Do you know what Walt Disney said: "All our dreams can come true, if we have the courage to pursue them."`,
  ],
  [PURPOSE_STEP_ID]: [
    `Do you know what Simon Sinek said: "People don’t buy what you do; they buy why you do it."`,
    `Do you know what John F. Kennedy said: "Efforts and courage are not enough without purpose and direction."`,
    `Do you know what Friedrich Nietzsche said: "He who has a why to live can bear almost any how."`,
  ],
  [BIGWHY_STEP_ID]: [
    `Do you know what Viktor E. Frankl said: "When we are no longer able to change a situation, we are challenged to change ourselves."`,
    `Do you know what Howard Thurman said: "Don’t ask what the world needs. Ask what makes you come alive."`,
    `Do you know what Rumi said: "Let yourself be silently drawn by the strange pull of what you really love."`,
  ],
  [ROLE_STEP_ID]: [
    `Do you know what Lao Tzu said: "To lead people, walk behind them."`,
    `Do you know what Ralph Nader said: "The function of leadership is to produce more leaders, not more followers."`,
    `Do you know what Simon Sinek said: "Leadership is not about being in charge. It is about taking care of those in your charge."`,
  ],
  [ENTITY_STEP_ID]: [
    `Do you know what Jeff Bezos said: "Your brand is what people say about you when you’re not in the room."`,
    `Do you know what Marty Neumeier said: "A brand is a person’s gut feeling about a product, service, or company."`,
    `Do you know what Scott Cook said: "A brand is no longer what we tell the consumer it is. It is what consumers tell each other it is."`,
  ],
  [STRATEGY_STEP_ID]: [
    `Do you know what Michael E. Porter said: "The essence of strategy is choosing what not to do."`,
    `Do you know what Henry Mintzberg said: "Strategy is a pattern in a stream of decisions."`,
    `Do you know what Dwight D. Eisenhower said: "Plans are worthless, but planning is everything."`,
  ],
  [TARGETGROUP_STEP_ID]: [
    `Do you know what Peter Drucker said: "The purpose of business is to create a customer."`,
    `Do you know what Steve Jobs said: "Start with the customer experience and work backward."`,
    `Do you know what Seth Godin said: "If you try to reach everyone, you’ll reach no one."`,
  ],
  [PRODUCTSSERVICES_STEP_ID]: [
    `Do you know what Theodore Levitt said: "People don’t want to buy a quarter-inch drill. They want a quarter-inch hole."`,
    `Do you know what Paul Graham said: "Make something people want."`,
    `Do you know what Jeff Bezos said: "We’re customer obsessed, not competitor obsessed."`,
  ],
  [RULESOFTHEGAME_STEP_ID]: [
    `Do you know what Ray Dalio said: "Principles are ways of successfully dealing with reality."`,
    `Do you know what Warren Buffett said: "It takes 20 years to build a reputation and five minutes to ruin it."`,
    `Do you know what James Clear said: "You do not rise to the level of your goals. You fall to the level of your systems."`,
  ],
  [PRESENTATION_STEP_ID]: [
    `Do you know what Maya Angelou said: "People will never forget how you made them feel."`,
    `Do you know what George Bernard Shaw said: "The single biggest problem in communication is the illusion that it has taken place."`,
    `Do you know what Edsger W. Dijkstra said: "Simplicity is a prerequisite for reliability."`,
  ],
};

const MOTIVATION_USER_INTENTS = new Set([
  "STEP_INPUT",
  "WHY_NEEDED",
  "RESISTANCE",
  "INSPIRATION_REQUEST",
  "META_QUESTION",
  "RECAP_REQUEST",
  "OFFTOPIC",
] as const);

type MotivationUserIntent =
  | "STEP_INPUT"
  | "WHY_NEEDED"
  | "RESISTANCE"
  | "INSPIRATION_REQUEST"
  | "META_QUESTION"
  | "RECAP_REQUEST"
  | "OFFTOPIC";

type MotivationPolicyApplyParams = {
  enabled: boolean;
  stepId: string;
  userMessage: string;
  renderedStatus: TurnOutputStatus;
  specialistResult: Record<string, unknown>;
  previousSpecialist: Record<string, unknown>;
  state: CanvasState;
  requireWordingPick: boolean;
};

type MotivationPolicyApplyResult = {
  specialistResult: Record<string, unknown>;
  suppressChoices: boolean;
};

function formatIndexedTemplate(templateRaw: string, values: string[]): string {
  let out = String(templateRaw || "");
  for (let i = 0; i < values.length; i += 1) {
    out = out.replace(new RegExp(`\\{${i}\\}`, "g"), String(values[i] || ""));
  }
  return out;
}

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function countSentenceUnits(raw: string): number {
  return String(raw || "")
    .replace(/\r/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function stripNumberedChoiceLines(prompt: string): string {
  return String(prompt || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s+/.test(line))
    .join("\n")
    .trim();
}

function normalizeEssenceValueToSingleSentence(raw: string): string {
  const compact = String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0]?.trim() || compact;
  return firstSentence.replace(/[.!?]+$/, "").trim();
}

function quoteLastByStepState(state: CanvasState): Record<string, string> {
  const raw = ((state as any).quote_last_by_step && typeof (state as any).quote_last_by_step === "object")
    ? ((state as any).quote_last_by_step as Record<string, unknown>)
    : {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [String(k), String(v || "")])
  );
}

export function createRunStepPolicyMetaHelpers(deps: RunStepPolicyMetaDeps) {
  function uiStringFromState(state: CanvasState, key: string, fallback: string): string {
    const uiStrings = ((state as any).ui_strings && typeof (state as any).ui_strings === "object")
      ? ((state as any).ui_strings as Record<string, unknown>)
      : {};
    const value = typeof uiStrings[key] === "string" ? String(uiStrings[key] || "").trim() : "";
    return value || fallback;
  }

  function localeBaseFromState(state?: CanvasState | null): string {
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

  function uiStringLocaleFirst(state: CanvasState | null | undefined, key: string): string {
    const uiStrings = (state && typeof (state as any).ui_strings === "object")
      ? ((state as any).ui_strings as Record<string, unknown>)
      : {};
    const localized = String(uiStrings[key] || "").trim();
    if (localized) return localized;
    const base = localeBaseFromState(state || null);
    if (!base || base === "en") {
      return deps.uiDefaultString(key);
    }
    return "";
  }

  function offTopicStepLabel(stepId: string, state: CanvasState): string {
    const key = OFFTOPIC_STEP_LABEL_UI_KEY_BY_STEP[stepId] || "";
    if (!key) return deps.wordingStepLabel(stepId);
    return uiStringFromState(state, key, deps.wordingStepLabel(stepId));
  }

  function offTopicCompanyName(state: CanvasState): string {
    const fromState = String((state as any)?.business_name || "").trim();
    if (fromState && fromState !== "TBD") return fromState;

    const step0Final = String((state as any)?.step_0_final || "").trim();
    if (step0Final) {
      const parsed = deps.parseStep0Final(step0Final, "TBD");
      const parsedName = String(parsed?.name || "").trim();
      if (parsedName && parsedName !== "TBD") return parsedName;
    }
    return uiStringFromState(state, "offtopic.companyFallback", deps.uiDefaultString("offtopic.companyFallback"));
  }

  function offTopicCurrentContextLine(stepId: string, state: CanvasState): string {
    const template = uiStringLocaleFirst(state, "offtopic.current.template");
    if (!template) return "";
    return ensureSentenceEnd(
      formatIndexedTemplate(template, [
        offTopicStepLabel(stepId, state),
        offTopicCompanyName(state),
      ]).trim()
    );
  }

  function offTopicCurrentContextHeading(stepId: string, state: CanvasState): string {
    const template = uiStringLocaleFirst(state, "offtopic.current.template");
    if (!template) return "";
    const rendered = formatIndexedTemplate(template, [
      offTopicStepLabel(stepId, state),
      offTopicCompanyName(state),
    ]).trim();
    if (!rendered) return "";
    const base = rendered.replace(/[.!?]+$/g, "").replace(/\s*:\s*$/g, "").trim();
    return base ? `${base}:` : "";
  }

  function offTopicRedirectLine(stepId: string, state: CanvasState): string {
    const template = uiStringLocaleFirst(state, "offtopic.redirect.template");
    if (!template) return "";
    return ensureSentenceEnd(
      formatIndexedTemplate(template, [
        offTopicStepLabel(stepId, state),
        offTopicCompanyName(state),
      ]).trim()
    );
  }

  function buildBenProfileWidgetProfile(state?: CanvasState | null): {
    image_url: string;
    image_alt: string;
  } {
    const imageAlt = uiStringLocaleFirst(state || null, "media.image.alt");
    return {
      image_url: BEN_PROFILE_IMAGE_URL,
      image_alt: imageAlt,
    };
  }

  function buildBenProfileMessage(state?: CanvasState | null): string {
    const paragraph1 = uiStringLocaleFirst(state || null, "meta.benProfile.paragraph1");
    const paragraph2 = uiStringLocaleFirst(state || null, "meta.benProfile.paragraph2");
    const paragraph3 = uiStringLocaleFirst(state || null, "meta.benProfile.paragraph3");
    const paragraph4Template = uiStringLocaleFirst(state || null, "meta.benProfile.paragraph4");
    const paragraph4 = formatIndexedTemplate(paragraph4Template, [BEN_PROFILE_WEBSITE_URL]);
    return [
      paragraph1,
      paragraph2,
      paragraph3,
      paragraph4,
    ].join("\n\n");
  }

  const motivationHigherPurposeOpener = deps.uiDefaultString("motivation.opener");
  const motivationProvenLine = deps.uiDefaultString(
    "motivation.provenLine",
    "This is a proven model used worldwide, including by Samsung, HTC, LG, New Black, and Fresh 'n Rebel."
  );
  const motivationFixedContinuePrompt = deps.uiDefaultString(
    "motivation.continuePrompt",
    "Give me one honest sentence. Not perfect. Just true."
  );

  function resolveMotivationUserIntent(specialist: Record<string, unknown>): MotivationUserIntent {
    const intentRaw = String((specialist as any).user_intent || "").trim().toUpperCase();
    if (MOTIVATION_USER_INTENTS.has(intentRaw as MotivationUserIntent)) {
      return intentRaw as MotivationUserIntent;
    }
    const wantsRecap =
      specialist.wants_recap === true ||
      String((specialist as any).wants_recap || "").trim().toLowerCase() === "true";
    if (wantsRecap) return "RECAP_REQUEST";
    const isOfftopic =
      specialist.is_offtopic === true ||
      String((specialist as any).is_offtopic || "").trim().toLowerCase() === "true";
    if (isOfftopic) return "OFFTOPIC";
    return "STEP_INPUT";
  }

  function resolveSpecialistMetaTopic(specialist: Record<string, unknown>): SpecialistMetaTopic {
    const topicRaw = String((specialist as any).meta_topic || "").trim().toUpperCase();
    const intent = resolveMotivationUserIntent(specialist);
    const wantsRecap =
      specialist.wants_recap === true ||
      String((specialist as any).wants_recap || "").trim().toLowerCase() === "true";
    if (wantsRecap || intent === "RECAP_REQUEST") return "RECAP";
    if (topicRaw === "MODEL_PROCESS") {
      return intent === "WHY_NEEDED" || intent === "RESISTANCE"
        ? "MODEL_VALUE"
        : "MODEL_CREDIBILITY";
    }
    if (SPECIALIST_META_TOPIC_SET.has(topicRaw)) return topicRaw as SpecialistMetaTopic;
    if (intent === "WHY_NEEDED" || intent === "RESISTANCE") return "MODEL_VALUE";
    if (intent === "META_QUESTION") return "MODEL_CREDIBILITY";
    return "NONE";
  }

  function pickQuoteForStep(stepId: string, state: CanvasState): string {
    const pool = Array.isArray(MOTIVATION_QUOTES_BY_STEP[stepId]) ? MOTIVATION_QUOTES_BY_STEP[stepId] : [];
    if (pool.length === 0) return "";
    const quoteState = quoteLastByStepState(state);
    const last = String(quoteState[stepId] || "").trim();
    const candidates = pool.length > 1 ? pool.filter((quote) => quote !== last) : pool.slice();
    const index = Math.max(0, Math.min(candidates.length - 1, Math.floor(Math.random() * candidates.length)));
    const selected = String(candidates[index] || candidates[0] || "").trim();
    if (!selected) return "";
    quoteState[stepId] = selected;
    (state as any).quote_last_by_step = quoteState;
    return selected;
  }

  function overviewEssenceSentence(
    stepId: string,
    state: CanvasState,
    specialist: Record<string, unknown>,
    previousSpecialist: Record<string, unknown>
  ): string {
    if (!stepId) return "";
    if (stepId === STEP_0_ID) {
      const step0Final = String((state as any).step_0_final || "").trim() || String((specialist as any).step_0 || "").trim();
      if (!step0Final) return "";
      const parsed = deps.parseStep0Final(step0Final, String((state as any).business_name || "TBD"));
      if (!parsed.venture || !parsed.name) return "";
      const statement =
        String(parsed.status || "").toLowerCase() === "existing"
          ? `You have a ${parsed.venture} called ${parsed.name}`
          : `You want to start a ${parsed.venture} called ${parsed.name}`;
      return statement;
    }

    const normalized = resolveCurrentStepEssenceValue(stepId, state, specialist, previousSpecialist);
    if (!normalized) return "";
    const contextLine = offTopicCurrentContextLine(stepId, state)
      .replace(/[.!?]+$/g, "")
      .trim();
    if (!contextLine) return normalized;
    return `${contextLine} ${normalized}`.trim();
  }

  function resolveCurrentStepEssenceValue(
    stepId: string,
    state: CanvasState,
    specialist: Record<string, unknown>,
    previousSpecialist: Record<string, unknown>
  ): string {
    const field = deps.fieldForStep(stepId);
    const finalField = deps.finalFieldByStepId[stepId] || "";
    const provisional = deps.provisionalValueForStep(state, stepId);
    const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
    const fieldValue = field ? String((specialist as any)[field] || "").trim() : "";
    const previousFieldValue = field ? String((previousSpecialist as any)[field] || "").trim() : "";
    const refined = String((specialist as any).refined_formulation || "").trim();
    const previousRefined = String((previousSpecialist as any).refined_formulation || "").trim();

    let base = fieldValue || refined || provisional || finalValue || previousFieldValue || previousRefined;
    if (!base) {
      const statements = Array.isArray((specialist as any).statements)
        ? ((specialist as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
        : Array.isArray((previousSpecialist as any).statements)
          ? ((previousSpecialist as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
          : [];
      if (statements.length > 0) base = statements.join("; ");
    }
    return normalizeEssenceValueToSingleSentence(base);
  }

  function buildMotivationContinueLine(state: CanvasState, stepId: string, status: TurnOutputStatus): string {
    const basePiece = MOTIVATION_MISSING_PIECE_BY_STEP[stepId] || "the missing piece that matters most right now";
    const piece =
      status === "valid_output"
        ? `the next sharpening of ${basePiece}`
        : basePiece;
    const template = deps.uiStringFromStateMap(
      state,
      "motivation.continueTemplate",
      deps.uiDefaultString(
        "motivation.continueTemplate",
        "What we are doing now is protecting your motivation by making \"{0}\" clear in words you can actually carry into real decisions."
      )
    );
    return formatIndexedTemplate(template, [piece]).trim();
  }

  function applyMotivationQuotesContractV11(params: MotivationPolicyApplyParams): MotivationPolicyApplyResult {
    const specialist = params.specialistResult && typeof params.specialistResult === "object"
      ? { ...params.specialistResult }
      : {};
    if (!params.enabled) return { specialistResult: specialist, suppressChoices: false };
    if (!MOTIVATION_QUOTES_BY_STEP[params.stepId]) return { specialistResult: specialist, suppressChoices: false };
    if (String((specialist as any).action || "").trim().toUpperCase() !== "ASK") {
      return { specialistResult: specialist, suppressChoices: false };
    }
    const isOfftopic =
      specialist.is_offtopic === true ||
      String((specialist as any).is_offtopic || "").trim().toLowerCase() === "true";
    if (isOfftopic || params.requireWordingPick) {
      return { specialistResult: specialist, suppressChoices: false };
    }

    const userIntent = resolveMotivationUserIntent(specialist);
    const metaTopic = resolveSpecialistMetaTopic(specialist);
    const whyTrigger =
      userIntent === "WHY_NEEDED" ||
      userIntent === "RESISTANCE" ||
      metaTopic === "MODEL_VALUE";
    const inspirationTrigger = userIntent === "INSPIRATION_REQUEST";
    const questionRaw = stripNumberedChoiceLines(String((specialist as any).question || "")).trim();

    if (whyTrigger) {
      const essence = overviewEssenceSentence(params.stepId, params.state, specialist, params.previousSpecialist);
      const quote = pickQuoteForStep(params.stepId, params.state);
      const opener = deps.uiStringFromStateMap(
        params.state,
        "motivation.opener",
        motivationHigherPurposeOpener
      );
      const provenLine = deps.uiStringFromStateMap(
        params.state,
        "motivation.provenLine",
        motivationProvenLine
      );
      const continuePrompt = deps.uiStringFromStateMap(
        params.state,
        "motivation.continuePrompt",
        motivationFixedContinuePrompt
      );
      const blocks: string[] = [
        opener,
        provenLine,
      ];
      if (essence) {
        const essenceTemplate = deps.uiStringFromStateMap(
          params.state,
          "motivation.essencePrefix",
          deps.uiDefaultString("motivation.essencePrefix")
        );
        blocks.push(formatIndexedTemplate(essenceTemplate, [essence]).trim());
      }
      blocks.push(buildMotivationContinueLine(params.state, params.stepId, params.renderedStatus));
      if (quote) blocks.push(quote);

      return {
        specialistResult: {
          ...specialist,
          action: "ASK",
          message: blocks.join("\n\n").trim(),
          question: essence ? continuePrompt : (questionRaw || continuePrompt),
          user_intent: userIntent,
          meta_topic: "MODEL_VALUE",
          wants_recap: false,
          is_offtopic: false,
        },
        suppressChoices: false,
      };
    }

    if (inspirationTrigger) {
      const quote = pickQuoteForStep(params.stepId, params.state);
      if (!quote) return { specialistResult: specialist, suppressChoices: false };
      const currentMessage = String((specialist as any).message || "").trim();
      const nextMessage = currentMessage
        ? `${currentMessage}\n\n${quote}`
        : quote;
      return {
        specialistResult: {
          ...specialist,
          message: nextMessage,
        },
        suppressChoices: false,
      };
    }

    return { specialistResult: specialist, suppressChoices: false };
  }

  function buildModelCredibilityMessage(stepId: string, state: CanvasState): string {
    const provenLine = deps.uiStringFromStateMap(
      state,
      "motivation.provenLine",
      motivationProvenLine
    );
    return [
      deps.uiStringFromStateMap(
        state,
        "meta.modelCredibility.body",
        deps.uiDefaultString(
          "meta.modelCredibility.body",
          "This is a practical, step-by-step canvas model that turns ideas into clear choices and real trade-offs."
        )
      ),
      provenLine,
      offTopicRedirectLine(stepId, state),
    ].join(" ");
  }

  function buildMetaTopicMessageFromRegistry(params: {
    stepId: string;
    state: CanvasState;
    metaTopic: SpecialistMetaTopic;
  }): string {
    const config = META_TOPIC_ROUTE_REGISTRY[params.metaTopic];
    if (!config) return "";
    const localeBase = localeBaseFromState(params.state);
    if (!config.enabled_locales.has(localeBase || "en")) return "";

    const body = uiStringLocaleFirst(params.state, config.ui_key).trim();
    if (!body) return "";
    const chunks: string[] = [body];
    if (config.append_current_context) {
      const currentLine = offTopicCurrentContextLine(params.stepId, params.state).trim();
      if (currentLine) chunks.push(currentLine);
    }
    if (config.append_redirect) {
      const redirectLine = offTopicRedirectLine(params.stepId, params.state).trim();
      if (redirectLine) chunks.push(redirectLine);
    }
    return chunks.join(" ").trim();
  }

  function applyCentralMetaTopicRouter(params: {
    stepId: string;
    specialistResult: Record<string, unknown>;
    previousSpecialist?: Record<string, unknown>;
    state: CanvasState;
  }): Record<string, unknown> {
    const stepId = String(params.stepId || "").trim();
    const specialist = params.specialistResult && typeof params.specialistResult === "object"
      ? { ...params.specialistResult }
      : {};
    if (!stepId || stepId === STEP_0_ID) return specialist;

    // Canonical Dream INTRO text must come from ui_strings catalog source.
    if (stepId === DREAM_STEP_ID && String((specialist as any).action || "").trim().toUpperCase() === "INTRO") {
      const introBody = uiStringLocaleFirst(params.state, "dream.intro.body").trim();
      if (introBody) {
        return {
          ...specialist,
          message: introBody,
        };
      }
    }
    if (stepId === PURPOSE_STEP_ID && String((specialist as any).action || "").trim().toUpperCase() === "INTRO") {
      const introTemplate = uiStringLocaleFirst(params.state, "purpose.intro.body").trim();
      if (introTemplate) {
        return {
          ...specialist,
          message: formatIndexedTemplate(introTemplate, [offTopicCompanyName(params.state)]).trim(),
        };
      }
    }

    const metaTopic = resolveSpecialistMetaTopic(specialist);
    if (metaTopic === "NONE" || metaTopic === "RECAP") return specialist;

    const base = {
      ...specialist,
      action: "ASK",
      is_offtopic: false,
      wants_recap: false,
      meta_topic: metaTopic,
    } as Record<string, unknown>;

    if (metaTopic === "BEN_PROFILE") {
      const currentValue = resolveCurrentStepEssenceValue(
        stepId,
        params.state,
        specialist,
        params.previousSpecialist && typeof params.previousSpecialist === "object"
          ? params.previousSpecialist
          : {}
      );
      const currentContextHeading = offTopicCurrentContextHeading(stepId, params.state).trim();
      const currentBlock = currentContextHeading && currentValue
        ? `${currentContextHeading}\n\n${currentValue}`
        : (currentValue || "");
      const stepField = deps.fieldForStep(stepId);
      return {
        ...base,
        __widget_profile_image_url: buildBenProfileWidgetProfile(params.state).image_url,
        __widget_profile_image_alt: buildBenProfileWidgetProfile(params.state).image_alt,
        __suppress_refined_append: "true",
        refined_formulation: "",
        wording_choice_agent_current: "",
        wording_choice_pending: "false",
        wording_choice_selected: "",
        ...(stepField ? { [stepField]: "" } : {}),
        message: currentBlock
          ? `${buildBenProfileMessage(params.state)}\n\n${currentBlock}`
          : buildBenProfileMessage(params.state),
      };
    }

    if (metaTopic === "MODEL_CREDIBILITY") {
      return {
        ...base,
        message: buildModelCredibilityMessage(stepId, params.state),
      };
    }

    if (META_TOPIC_ROUTE_REGISTRY[metaTopic]) {
      const topicMessage = buildMetaTopicMessageFromRegistry({
        stepId,
        state: params.state,
        metaTopic,
      });
      if (!topicMessage) return specialist;
      return {
        ...base,
        message: topicMessage,
      };
    }

    return base;
  }

  function stripOfftopicStructureSentences(raw: string): string {
    const text = String(raw || "").replace(/\r/g, "\n").trim();
    if (!text) return "";
    const withoutStrongCurrent = text.replace(
      /<strong>\s*the current\b[\s\S]{0,240}?<\/strong>/gi,
      " "
    );
    const lines = withoutStrongCurrent
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(?:[-*•]|\d+[.)])\s+/.test(line));
    const compact = lines.join(" ").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    const parts = compact
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const structuralPatterns = [
      /\bthe current\b.{0,120}\bof\b.{0,120}\bis[.!?]?$/i,
      /\blet(?:'|’)?s continue with\b.{0,120}\bof\b.{0,120}[.!?]?$/i,
      /\blet(?:'|’)?s continue with\b.{0,120}\bstep\b.{0,40}\b(?:for|of)\b.{0,120}[.!?]?$/i,
      /\bnow,?\s+back\s+to\b/i,
    ];
    const kept = parts.filter((part) => !structuralPatterns.some((re) => re.test(part)));
    let out = kept.join(" ").trim();
    if (/(?:^|\s)•\s+/.test(out)) {
      out = out.split(/(?:^|\s)•\s+/)[0]?.trim() || "";
    }
    return out;
  }

  function normalizeComparableRedirectText(raw: string): string {
    let next = String(raw || "").trim().toLowerCase();
    if (!next) return "";
    try {
      next = next.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      // Keep original when normalize() is unavailable.
    }
    next = next
      .replace(/<[^>]+>/g, " ")
      .replace(/[“”"'`]/g, "")
      .replace(/[\-–—_/]+/g, " ")
      .replace(/[.,!?;:()[\]{}]+/g, " ")
      .replace(/\b(?:step|stap|paso|passo|etape|etapa|schritt)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return next;
  }

  function stripRedirectLikeSentence(raw: string, redirectSentence: string): string {
    const text = String(raw || "").replace(/\r/g, "\n").trim();
    if (!text) return "";
    const redirectComparable = normalizeComparableRedirectText(redirectSentence);
    if (!redirectComparable) return text;
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const kept = sentences.filter((sentence) => {
      const comparable = normalizeComparableRedirectText(sentence);
      if (!comparable) return false;
      if (comparable === redirectComparable) return false;
      if (comparable.includes(redirectComparable)) return false;
      if (redirectComparable.includes(comparable) && comparable.length >= Math.max(12, Math.floor(redirectComparable.length * 0.8))) {
        return false;
      }
      return true;
    });
    return kept.join(" ").trim();
  }

  function isLikelyMetaQuestionTurn(params: {
    userMessage: string;
    specialistResult: any;
  }): boolean {
    void params.userMessage;
    const specialist = params.specialistResult && typeof params.specialistResult === "object"
      ? params.specialistResult
      : {};
    if (specialist.wants_recap === true || String(specialist.wants_recap || "").trim().toLowerCase() === "true") {
      return true;
    }
    const userIntent = resolveMotivationUserIntent(specialist);
    if (
      userIntent === "META_QUESTION" ||
      userIntent === "RECAP_REQUEST" ||
      userIntent === "WHY_NEEDED" ||
      userIntent === "RESISTANCE"
    ) return true;
    const metaTopic = resolveSpecialistMetaTopic(specialist);
    return metaTopic !== "NONE";
  }

  function normalizeNonStep0OfftopicSpecialist(params: {
    stepId: string;
    activeSpecialist: string;
    userMessage: string;
    specialistResult: any;
    previousSpecialist: Record<string, unknown>;
    state: CanvasState;
  }): any {
    const stepId = String(params.stepId || "").trim();
    const specialist = params.specialistResult && typeof params.specialistResult === "object"
      ? params.specialistResult
      : {};
    if (!stepId || stepId === STEP_0_ID) return specialist;
    const isOfftopic =
      specialist.is_offtopic === true ||
      String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
    if (!isOfftopic) return specialist;
    const metaTopic = resolveSpecialistMetaTopic(specialist);
    if (metaTopic === "BEN_PROFILE") {
      return {
        ...specialist,
        action: "ASK",
        is_offtopic: true,
        message: buildBenProfileMessage(params.state),
        __widget_profile_image_url: buildBenProfileWidgetProfile(params.state).image_url,
        __widget_profile_image_alt: buildBenProfileWidgetProfile(params.state).image_alt,
        __suppress_refined_append: "true",
        __offtopic_meta_passthrough: "true",
        wording_choice_pending: "false",
        wording_choice_selected: "",
        feedback_reason_key: "",
        feedback_reason_text: "",
      };
    }
    if (isLikelyMetaQuestionTurn({ userMessage: params.userMessage, specialistResult: specialist })) {
      return {
        ...specialist,
        __offtopic_meta_passthrough: "true",
      };
    }

    const redirectSentence = offTopicRedirectLine(stepId, params.state);
    const specialistMessage = stripRedirectLikeSentence(
      stripOfftopicStructureSentences(
        deps.stripChoiceInstructionNoise(String(specialist.message || "").trim())
      ),
      redirectSentence
    );
    const message = specialistMessage
      ? `${specialistMessage} ${redirectSentence}`.trim()
      : redirectSentence;

    const next = {
      ...specialist,
      action: "ASK",
      message,
      __offtopic_meta_passthrough: "false",
      wording_choice_pending: "false",
      wording_choice_selected: "",
      feedback_reason_key: "",
      feedback_reason_text: "",
    } as Record<string, unknown>;

    if (stepId === DREAM_STEP_ID && String(params.activeSpecialist || "").trim() === DREAM_EXPLAINER_SPECIALIST) {
      next.suggest_dreambuilder = "true";
      const currentStatements =
        Array.isArray((next as any).statements) && (next as any).statements.length > 0
          ? ((next as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
          : [];
      if (currentStatements.length > 0) {
        next.statements = currentStatements;
      } else {
        const previousStatements = Array.isArray((params.previousSpecialist as any)?.statements)
          ? ((params.previousSpecialist as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
          : [];
        next.statements = previousStatements;
      }
    }
    return next;
  }

  function validateNonStep0OfftopicMessageShape(
    stepId: string,
    specialist: Record<string, unknown>,
    state?: CanvasState
  ): string | null {
    if (!state || stepId === STEP_0_ID) return null;
    const isOfftopic =
      specialist.is_offtopic === true ||
      String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
    if (!isOfftopic) return null;
    if (String((specialist as any).__offtopic_meta_passthrough || "").trim().toLowerCase() === "true") return null;
    if (isLikelyMetaQuestionTurn({ userMessage: "", specialistResult: specialist })) return null;

    const message = String(specialist.message || "").trim();
    if (!message) return "offtopic_message_empty";

    const bannedLegacyPatterns = [
      /\bside\s+question\b/i,
      /\bdetour\b/i,
      /\boff-?topic\b.{0,24}\bstep\b/i,
    ];
    if (bannedLegacyPatterns.some((pattern) => pattern.test(message))) {
      return "offtopic_contains_legacy_phrase";
    }

    const redirectSentence = offTopicRedirectLine(stepId, state);
    const redirectIndex = message.indexOf(redirectSentence);
    if (redirectIndex < 0) {
      return "offtopic_missing_redirect_sentence";
    }

    const currentAnchorSentence = offTopicCurrentContextLine(stepId, state);
    const structuredPrefix = message.slice(0, redirectIndex + redirectSentence.length).trim();
    const hasCurrentAnchorExact = structuredPrefix.includes(currentAnchorSentence);
    const hasCurrentAnchorGeneric = /\bthe current\b.{0,120}\bof\b.{0,120}\bis[.!?]?/i.test(structuredPrefix);
    if (hasCurrentAnchorExact || hasCurrentAnchorGeneric) {
      return "offtopic_current_context_must_be_recap_only";
    }

    const sentenceCount = countSentenceUnits(structuredPrefix);
    if (sentenceCount < 1 || sentenceCount > 3) return "offtopic_invalid_sentence_count";

    return null;
  }

  return {
    resolveMotivationUserIntent,
    resolveSpecialistMetaTopic,
    buildBenProfileWidgetProfile,
    buildBenProfileMessage,
    applyMotivationQuotesContractV11,
    applyCentralMetaTopicRouter,
    normalizeNonStep0OfftopicSpecialist,
    validateNonStep0OfftopicMessageShape,
  };
}
