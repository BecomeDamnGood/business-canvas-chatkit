/**
 * Constants and i18n helpers for the UI.
 */

export const STRATEGY_STEP_ID = "strategy";

export const ORDER = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
  "presentation",
];

export const TITLES_DEFAULT: Record<string, string> = {
  step_0: "Step 1: Validation & Business Name",
  dream: "Step 2: Dream",
  purpose: "Step 3: Purpose",
  bigwhy: "Step 4: Big Why",
  role: "Step 5: Role",
  entity: "Step 6: Entity",
  strategy: "Step 7: Strategy",
  targetgroup: "Step 8: Target Group",
  productsservices: "Step 9: Products and Services",
  rulesofthegame: "Step 10: Rules of the game",
  presentation: "Step 11: Presentation",
};

const PRESTART_TEXT_DEFAULT = {
  headline: "Build a complete Business Model and Strategy Canvas step by step.",
  provenTitle: "The Proven Standard",
  provenBody:
    "A globally implemented strategy canvas used by teams worldwide, built through Ben Steenstra's unique step-by-step method of questioning and structured development.",
  outcomesTitle: "By the end you'll have",
  outcome1: "A focused canvas that fits on one page",
  outcome2: "A presentation you can use immediately (PPTX)",
  outcome3: "A plan your team can align around",
  howLabel: "How it works",
  howValue: "One question at a time",
  timeLabel: "Time",
  timeValue: "10–15 minutes",
  skeleton: "Loading translation…",
} as const;

export type PrestartContent = {
  headline: string;
  provenTitle: string;
  provenBody: string;
  outcomesTitle: string;
  outcome1: string;
  outcome2: string;
  outcome3: string;
  howLabel: string;
  howValue: string;
  timeLabel: string;
  timeValue: string;
  skeleton: string;
};

export const UI_STRINGS: Record<string, Record<string, string>> = {
  default: {
    "title.step_0": TITLES_DEFAULT.step_0,
    "title.dream": TITLES_DEFAULT.dream,
    "title.purpose": TITLES_DEFAULT.purpose,
    "title.bigwhy": TITLES_DEFAULT.bigwhy,
    "title.role": TITLES_DEFAULT.role,
    "title.entity": TITLES_DEFAULT.entity,
    "title.strategy": TITLES_DEFAULT.strategy,
    "title.targetgroup": TITLES_DEFAULT.targetgroup,
    "title.productsservices": TITLES_DEFAULT.productsservices,
    "title.rulesofthegame": TITLES_DEFAULT.rulesofthegame,
    "title.presentation": TITLES_DEFAULT.presentation,
    prestartWelcome: PRESTART_TEXT_DEFAULT.headline,
    "prestart.headline": PRESTART_TEXT_DEFAULT.headline,
    "prestart.proven.title": PRESTART_TEXT_DEFAULT.provenTitle,
    "prestart.proven.body": PRESTART_TEXT_DEFAULT.provenBody,
    "prestart.outcomes.title": PRESTART_TEXT_DEFAULT.outcomesTitle,
    "prestart.outcomes.item1": PRESTART_TEXT_DEFAULT.outcome1,
    "prestart.outcomes.item2": PRESTART_TEXT_DEFAULT.outcome2,
    "prestart.outcomes.item3": PRESTART_TEXT_DEFAULT.outcome3,
    "prestart.meta.how.label": PRESTART_TEXT_DEFAULT.howLabel,
    "prestart.meta.how.value": PRESTART_TEXT_DEFAULT.howValue,
    "prestart.meta.time.label": PRESTART_TEXT_DEFAULT.timeLabel,
    "prestart.meta.time.value": PRESTART_TEXT_DEFAULT.timeValue,
    "prestart.loading": PRESTART_TEXT_DEFAULT.skeleton,
    "stepLabel.validation": "Validation",
    "sectionTitle.step_0": "Validation & Business Name",
    uiSubtitle: "Use the app widget to continue (not the chat box)",
    uiUseWidgetToContinue: "Use the app widget to continue (not the chat box).",
    btnGoToNextStep: "Go to next step",
    byText: "A business model by:",
    startHint: "Click Start to begin.",
    inputPlaceholder: "Type your answer here (use the widget, not the chat box)…",
    btnStart: "Start with Validation & Business Name",
    btnDreamConfirm: "I'm happy with this formulation, continue to the Purpose step",
    wordingChoiceHeading: "This is your input:",
    wordingChoiceSuggestionLabel: "This would be my suggestion:",
    wordingChoiceInstruction: "Please click what suits you best.",
    "dreamBuilder.startExercise": "Start the exercise",
    "dreamBuilder.statements.title": "Your Dream statements",
    "dreamBuilder.statements.count": "N statements out of a minimum of 20 so far",
    "dreamBuilder.statements.empty": "No statements yet.",
    "generic.choicePrompt.shareOrOption": "Share your thoughts or choose an option",
    btnSwitchToSelfDream: "Switch back to self-formulate the dream",
    sendTitle: "Send",
    errorMessage: "Something went wrong while processing your message. Please try again.",
    optionsDisplayError: "We can't safely display these options right now. Please try again.",
    scoringIntro1:
      "You now have more than 20 statements, so I've clustered them for you. You can still edit and add statements, but please give them a score.",
    scoringIntro2: "",
    scoringIntro3: "The average per cluster updates immediately while you type.",
    scoringDreamQuestion:
      "You can see above, based on your scores, which topics matter most to you. Do you now have a clearer idea of what your Dream could be about, and can you say something about it? Or would you prefer that I formulate a Dream for you based on what you find important?",
    btnScoringContinue: "Formulate my dream for me based on what I find important.",
    scoringFilled: "N/M",
    scoringAvg: "Average: X",
    purposeInstructionHint: "Answer the question, formulate your own Purpose, or choose an option",
    "sectionTitle.dream": "Your Dream",
    "sectionTitle.purposeOf": "The Purpose of {0}",
    "sectionTitle.purposeOfFuture": "The Purpose of your future company",
    "sectionTitle.bigwhyOf": "The Big Why of {0}",
    "sectionTitle.bigwhyOfFuture": "The Big Why of your future company",
    "sectionTitle.roleOf": "The Role of {0}",
    "sectionTitle.roleOfFuture": "The Role of your future company",
    "sectionTitle.entityOf": "The Entity of {0}",
    "sectionTitle.entityOfFuture": "The Entity of your future company",
    "sectionTitle.strategyOf": "The Strategy of {0}",
    "sectionTitle.strategyOfFuture": "The Strategy of your future company",
    "sectionTitle.targetgroupOf": "The Target Group of {0}",
    "sectionTitle.targetgroupOfFuture": "The Target Group of your future company",
    "sectionTitle.productsservicesOf": "The Products and Services of {0}",
    "sectionTitle.productsservicesOfFuture": "The Products and Services of your future company",
    "sectionTitle.rulesofthegameOf": "The Rules of the game of {0}",
    "sectionTitle.rulesofthegameOfFuture": "The Rules of the game of your future company",
    "sectionTitle.presentation": "Create your Presentation",
  },
};

export function baseLang(lang: string | null | undefined): string {
  const l = String(lang || "").toLowerCase();
  return l.split(/[-_]/)[0] || "default";
}

export function t(lang: string | null | undefined, key: string): string {
  const b = baseLang(lang);
  const table = UI_STRINGS[b] || UI_STRINGS.default;
  return (table && table[key]) ? table[key] : (UI_STRINGS.default[key] || "");
}

export function titlesForLang(lang: string | null | undefined): Record<string, string> {
  const b = baseLang(lang);
  const table = UI_STRINGS[b] || UI_STRINGS.default;
  const titles = { ...TITLES_DEFAULT };
  for (const step of ORDER) {
    const key = "title." + step;
    if (table && table[key]) titles[step] = table[key];
  }
  return titles;
}

export function prestartWelcomeForLang(lang: string | null | undefined): string {
  const b = baseLang(lang);
  const table = UI_STRINGS[b] || UI_STRINGS.default;
  return (table && table.prestartWelcome) ? table.prestartWelcome : PRESTART_TEXT_DEFAULT.headline;
}

function requiredPrestartKeysPresent(table: Record<string, string> | null | undefined): boolean {
  if (!table) return false;
  const keys = [
    "prestart.headline",
    "prestart.proven.title",
    "prestart.proven.body",
    "prestart.outcomes.title",
    "prestart.outcomes.item1",
    "prestart.outcomes.item2",
    "prestart.outcomes.item3",
    "prestart.meta.how.label",
    "prestart.meta.how.value",
    "prestart.meta.time.label",
    "prestart.meta.time.value",
  ];
  return keys.every((key) => String(table[key] || "").trim().length > 0);
}

export function hasPrestartContentForLang(lang: string | null | undefined): boolean {
  const b = baseLang(lang);
  const table = UI_STRINGS[b] || null;
  if (!table) return false;
  return requiredPrestartKeysPresent(table);
}

export function prestartContentForLang(lang: string | null | undefined): PrestartContent {
  return {
    headline: t(lang, "prestart.headline"),
    provenTitle: t(lang, "prestart.proven.title"),
    provenBody: t(lang, "prestart.proven.body"),
    outcomesTitle: t(lang, "prestart.outcomes.title"),
    outcome1: t(lang, "prestart.outcomes.item1"),
    outcome2: t(lang, "prestart.outcomes.item2"),
    outcome3: t(lang, "prestart.outcomes.item3"),
    howLabel: t(lang, "prestart.meta.how.label"),
    howValue: t(lang, "prestart.meta.how.value"),
    timeLabel: t(lang, "prestart.meta.time.label"),
    timeValue: t(lang, "prestart.meta.time.value"),
    skeleton: t(lang, "prestart.loading") || PRESTART_TEXT_DEFAULT.skeleton,
  };
}

export function getSectionTitle(
  lang: string | null | undefined,
  stepId: string,
  businessName: string | null | undefined
): string {
  const titles = titlesForLang(lang);
  if (stepId === "step_0") return titles[stepId] || "";
  if (stepId === "dream") return t(lang, "sectionTitle.dream");
  if (stepId === "presentation") return t(lang, "sectionTitle.presentation");
  const hasBusinessName =
    businessName &&
    String(businessName).trim() !== "" &&
    String(businessName).trim() !== "TBD";
  const stepsWithCompany = [
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
  ];
  if (stepsWithCompany.indexOf(stepId) !== -1) {
    const keyOf = "sectionTitle." + stepId + "Of";
    const keyFuture = "sectionTitle." + stepId + "OfFuture";
    const template = t(lang, keyOf);
    const noName = t(lang, keyFuture);
    if (hasBusinessName) return template.replace(/\{0\}/g, String(businessName).trim());
    return noName;
  }
  return titles[stepId] || "";
}
