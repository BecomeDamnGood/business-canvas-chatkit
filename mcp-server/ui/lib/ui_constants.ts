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

export const PRESTART_WELCOME_DEFAULT = `Build a complete Business Model and Strategy Canvas step by step.

<strong>The Proven Standard</strong>
A globally implemented strategy canvas used by teams worldwide, built through Ben Steenstra's unique step-by-step method of questioning and structured development.

<strong>By the end you'll have</strong><ul>
<li>A focused canvas that fits on one page</li>
<li>A presentation you can use immediately (PPTX)</li>
<li>A plan your team can align around</li>
</ul><strong>How it works</strong>
One question at a time. Clear input, structured output.

<strong>Time</strong>
Estimated time: 10–15 minutes.`;

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
    prestartWelcome: PRESTART_WELCOME_DEFAULT,
    uiSubtitle: "Use the app widget to continue (not the chat box)",
    uiUseWidgetToContinue: "Use the app widget to continue (not the chat box).",
    btnGoToNextStep: "Go to next step",
    byText: "A business model by:",
    startHint: "Click Start to begin.",
    inputPlaceholder: "Type your answer here (use the widget, not the chat box)…",
    btnStart: "Start the proces with Validation & Business Name",
    btnOk: "Continue",
    btnOk_strategy: "I'm happy, continue to step 7 Strategy",
    btnDreamConfirm: "I'm happy with this formulation, continue to the Purpose step",
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
  return (table && table.prestartWelcome) ? table.prestartWelcome : PRESTART_WELCOME_DEFAULT;
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
