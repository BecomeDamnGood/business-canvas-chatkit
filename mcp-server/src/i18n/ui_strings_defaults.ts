/**
 * SSOT default UI strings and i18n key set for server-side locale resolution.
 */
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, MENU_LABEL_KEYS, labelKeyForMenuAction } from "../core/menu_contract.js";
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
const PRESTART_WELCOME_DEFAULT = PRESTART_TEXT_DEFAULT.headline;


export const UI_STRINGS_DEFAULT: Record<string, string> = {
  "title.step_0": "Step 1: Validation & Business Name",
  "title.dream": "Step 2: Dream",
  "title.purpose": "Step 3: Purpose",
  "title.bigwhy": "Step 4: Big Why",
  "title.role": "Step 5: Role",
  "title.entity": "Step 6: Entity",
  "title.strategy": "Step 7: Strategy",
  "title.targetgroup": "Step 8: Target Group",
  "title.productsservices": "Step 9: Products and Services",
  "title.rulesofthegame": "Step 10: Rules of the game",
  "title.presentation": "Step 11: Presentation",
  prestartWelcome: PRESTART_WELCOME_DEFAULT,
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
  "step0.carddesc": "Just to set the context, we'll start with the basics.",
  "step0.question.initial":
    "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?",
  "step0.readiness.statement.existing": "You have a {0} called {1}.",
  "step0.readiness.statement.starting": "You want to start a {0} called {1}.",
  "step0.readiness.suffix": "Are you ready to start with the first step: the Dream?",
  "stepLabel.validation": "Validation",
  "sectionTitle.step_0": "Validation & Business Name",
  uiSubtitle: "Use The Business Strategy Canvas Builder widget to continue (not the chat box)",
  uiUseWidgetToContinue: "Use The Business Strategy Canvas Builder widget to continue (not the chat box).",
  btnGoToNextStep: "Go to next step",
  byText: "A business model by:",
  startHint: "Click Start to begin.",
  inputPlaceholder: "Type your answer here (use The Business Strategy Canvas Builder widget, not the chat box)…",
  thinking: "Thinking…",
  btnStart: "Start the process with Validation & Business Name",
  btnDreamConfirm: "I'm happy with this formulation, continue to step 3 Purpose",
  wordingChoiceHeading: "This is your input:",
  wordingChoiceInterpretedListHeading: "This is what I took from your input:",
  wordingChoiceGroupedCompareUserLabel: "This is your compact wording:",
  wordingChoiceGroupedCompareSuggestionLabel: "This is my suggestion:",
  wordingChoiceGroupedCompareInstruction: "Choose the version that fits best for the remaining difference.",
  wordingChoiceGroupedCompareRetainedHeading: "These points already stay in the final list:",
  wordingChoiceSuggestionLabel: "This would be my suggestion:",
  wordingChoiceInstruction: "Please click what suits you best.",
  "wording.choice.context.default": "Please choose the wording that fits best.",
  "wording.feedback.user_pick.ack.default": "You chose your own wording, and that's okay.",
  "wording.feedback.user_pick.reason.default": "This keeps your original meaning while staying aligned with this step.",
  "generic.choicePrompt.shareOrOption": "Share your thoughts or choose an option",
  "invariant.prompt.ask.default": "Share your thoughts or choose an option.",
  "dreamBuilder.startExercise": "Start the exercise",
  "dreamBuilder.question.base":
    "Looking 5 to 10 years ahead, which major opportunities or threats do you see, and which positive changes do you hope for? Formulate them as clear statements.",
  "dreamBuilder.question.more":
    "What else do you see changing in the future, positive or negative? Let your imagination run free and formulate them as clear statements.",
  "dreamBuilder.switchSelf.headline": "Continue with the Dream Exercise.",
  "dreamBuilder.switchSelf.body.helper": "Take a moment to write a draft of your dream. I'll help you refine it if needed.",
  "dreamBuilder.switchSelf.body.intro": "That's a great way to start. Writing your own dream helps clarify what really matters to you and your business.",
  "dreamBuilder.statements.title": "Your Dream statements",
  "dreamBuilder.statements.count": "N statements out of a minimum of 20 so far",
  "dreamBuilder.statements.empty": "No statements yet.",
  "dream.intro.body":
    "Vision comes from the Greek word visio, meaning \"to see.\" A true visionary sees a future before others can see it. They feel it. They dream it. That is why this step is called Dream. A Dream is a vivid picture of the future you want to create. It describes a world that is better, fairer, healthier, simpler, or more inspiring because your organization exists.\n\nIt is not a revenue target, a strategy, or a hidden pitch for a product or service. A real Dream is human. It should touch people and help them feel why it matters. Focus on the change you want to see in the world and the effect you want to have on people's lives, not on the tools or the execution. Write a first version of your Dream. It doesn't have to be perfect. It just has to be real.",
  "purpose.intro.body":
    "We’re now going to work on defining the purpose of {0}. Where the Dream sets the direction, what you want to change in the world, Purpose becomes the engine: why this change truly matters to you and to {0}. Purpose is the deeper reason you get up every day for this company, even when things are tough or when there is no immediate result in sight.\n\nWithout Purpose, the Dream remains a nice idea; without a Dream, Purpose becomes a feeling without a destination. Purpose is not about outcomes like money, growth, or recognition; those are results, not Purpose. We are looking for the foundation that drives {0}, the belief or value that connects everything beneath the Dream. This not only helps you stay on course, but also keeps {0} human and resilient, especially under pressure.",
  btnSwitchToSelfDream: "Switch back to self-formulate the dream",
  sendTitle: "Send",
  errorMessage: "Something went wrong while processing your message. Please try again.",
  "error.unknownAction": "We could not process this choice. Please refresh and try again.",
  optionsDisplayError: "We can't safely display these options right now. Please try again.",
  scoringIntro1: "You now have more than 20 statements, so I've clustered them for you. You can still edit and add statements, but please give them a score.",
  scoringIntro2: "Please score each statement from 1 to 10 based on how important it is for your Dream (1 = low, 10 = very important).",
  scoringIntro3: "The average per cluster updates immediately while you type.",
  scoringDreamQuestion: "You can see above, based on your scores, which topics matter most to you. Do you now have a clearer idea of what your Dream could be about, and can you say something about it? Or would you prefer that I formulate a Dream for you based on what you find important?",
  btnScoringContinue: "Formulate my dream for me based on what I find important.",
  scoringFilled: "N/M",
  scoringAvg: "Average: X",
  "scoring.avg.empty": "—",
  "scoring.input.placeholder": "0",
  purposeInstructionHint: "Answer the questions, formulate your own Purpose, or choose an option",
  "autosuggest.prefix.template": "Based on your input I suggest the following {0}:",
  "autosuggest.prompt.generic":
    "Please propose a concrete formulation for this step based on the known context.",
  "autosuggest.prompt.dream":
    "Please propose one clear Dream sentence for this business based on the known context. Keep it concise and ready to confirm.",
  "autosuggest.prompt.purpose":
    "Please propose one clear Purpose sentence for this business based on the known context. Keep it concise and ready to confirm.",
  "autosuggest.prompt.bigwhy":
    "Please propose one concise Big Why sentence for this business based on the known context. Keep it meaningful and ready to confirm.",
  "autosuggest.prompt.role":
    "Please propose one clear Role sentence for this business based on the known context. Keep it concise and ready to confirm.",
  "autosuggest.prompt.entity":
    "Please propose one clear Entity sentence for this business based on the known context. Keep it concise and ready to confirm.",
  "autosuggest.prompt.strategy":
    "Please draft a strategy for this business with at least 4 concise strategic focus points, one per line, based on the known context.",
  "autosuggest.prompt.targetgroup":
    "Please propose one clear target group formulation for this business based on the known context. Keep it concise and ready to confirm.",
  "autosuggest.prompt.productsservices":
    "Please draft products and services for this business with at least 3 concrete bullet items, based on the known context.",
  "autosuggest.prompt.rulesofthegame":
    "Please draft rules of the game for this business with at least 3 distinct bullet rules, based on the known context.",
  "autosuggest.repair.prompt.strategy":
    "Please provide a finalized strategy draft with at least 4 distinct strategic focus points, one per line, based on known context.",
  "autosuggest.repair.prompt.productsservices":
    "Please provide a finalized products and services draft with at least 3 concrete bullet items based on known context.",
  "autosuggest.repair.prompt.rulesofthegame":
    "Please provide a finalized rules of the game draft with at least 3 distinct and concrete rules in bullet form based on known context.",
  "offtopic.redirect.template": "Let's continue with the {0} of {1}.",
  "offtopic.current.template": "The current {0} of {1} is.",
  "productsservices.current.heading.single_product": "The current product of {0} is",
  "productsservices.current.heading.single_service": "The current service of {0} is",
  "productsservices.current.heading.single_mixed": "The current offering of {0} is",
  "productsservices.current.heading.plural_products": "The current products of {0} are",
  "productsservices.current.heading.plural_services": "The current services of {0} are",
  "productsservices.current.heading.plural_mixed": "The current products and services of {0} are",
  "productsservices.classifier.product.tokens": "product|products|app|apps|platform|software|tool|tools|module|modules|template|templates",
  "productsservices.classifier.service.tokens": "service|services|consulting|advisory|coaching|support|maintenance|strategy|branding|design|development|training|workshop|workshops",
  "strategy.focuspoints.count.template": "You now have {0} focus points within your strategy. I advise you to formulate at least 4 but maximum 7 focus points.",
  "strategy.focuspoints.warning.template": "I strongly advice you to only add a maximum of 7 focus points. can I consolidate this for you?",
  "rulesofthegame.count.template":
    "You now have {0} Rules of the Game. I advise you to formulate at least {1} and at most {2} Rules of the Game.",
  "rulesofthegame.current.template": "Your current Rules of the Game for {0} are:",
  "rules.policy.overflow.rationale":
    "More than 5 Rules of the Game makes this feel like a handbook. Keep it short and practical.",
  "rules.policy.external.rationale":
    "Rules of the Game should describe how we work together internally, not external promises or market claims.",
  "rules.policy.choice.rationale": "Choose what fits best: your input or my consolidated suggestion.",
  "rules.policy.internal.suggestion.generic":
    "We define and follow one clear internal work agreement for this topic.",
  "rules.policy.internal.suggestion.pricing":
    "We apply pricing rules consistently and transparently in every collaboration.",
  "rules.proceed.block.prefix": "You cannot continue yet.",
  "rules.proceed.block.reason.min.template":
    "At least {0} valid Rules of the Game are required; you currently have {1}.",
  "rules.proceed.block.reason.max.template":
    "You currently have {0} Rules of the Game; reduce this to at most {1}.",
  "rules.proceed.block.reason.external":
    "At least one visible rule is an external promise or market claim. Rules of the Game must describe how you work together internally.",
  "rules.proceed.block.reason.pending_choice":
    "There is still an open wording choice. First resolve one definitive set of Rules of the Game.",
  "rules.proceed.block.reason.missing_accepted_output":
    "The visible rules are not yet accepted as the current set.",
  "rules.proceed.block.question.min.template":
    "Add enough internal rules to reach at least {0} valid Rules of the Game.",
  "rules.proceed.block.question.max.template":
    "Reduce this to at most {0} Rules of the Game by merging overlap or removing non-essential rules.",
  "rules.proceed.block.question.external":
    "Rewrite only the external promise or market-claim rule or rules into internal collaboration rules.",
  "rules.proceed.block.question.pending_choice":
    "Send the one definitive set of Rules of the Game you want to keep.",
  "rules.proceed.block.question.missing_accepted_output":
    "Send the definitive set of 3 to 5 Rules of the Game you want to confirm.",
  "strategy.current.template": "Your current Strategy for {0} is:",
  "contract.headline.strategy.moreFocus": "What more do you focus on within your strategy?",
  "contract.headline.define": "Define",
  "contract.headline.refine": "Refine",
  "contract.headline.define.withOptions": "Define your {0} for {1} or choose an option.",
  "contract.headline.define.withoutOptions": "Define your {0} for {1}.",
  "contract.headline.refine.withOptions": "Refine your {0} for {1} or choose an option.",
  "contract.headline.refine.withoutOptions": "Refine your {0} for {1}.",
  "contract.headline.withOptions": "{0} your {1} for {2} or choose an option.",
  "contract.headline.withoutOptions": "{0} your {1} for {2}.",
  "contract.recap.noOutput": "We have not yet defined the {0}.",
  "recap.label.venture": "Venture",
  "recap.label.name": "Name",
  "recap.label.status": "Status",
  "transient.rate_limited": "Please wait a moment and try again.",
  "transient.timeout": "This is taking longer than usual. Please try again.",
  "transient.connection_failed": "Connection to the app host failed. Please try again.",
  "transient.connecting": "Connecting to the app host...",
  "hydration.retry.title": "We could not load the app state.",
  "hydration.retry.body": "Please retry to continue.",
  "hydration.retry.action": "Retry",
  "error.session_upgrade.title": "This session needs to be restarted.",
  "error.session_upgrade.body": "Please start a new session to continue.",
  "error.contract.title": "The app state is invalid.",
  "error.contract.body": "Please refresh or start a new session.",
  "error.generic.title": "Something went wrong.",
  "error.generic.body": "Please refresh and try again.",
  "dev.error.prefix": "[ui_error]",
  "dev.error.unknown": "unknown error",
  "dev.error.unhandled_rejection": "unhandled rejection",
  "media.image.alt": "Image",
  "wordingChoice.chooseVersion": "Choose this version",
  "wordingChoice.useInputFallback": "Use this input",
  "bigwhy.tooLong.message":
    "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version.",
  "bigwhy.tooLong.question": "Can you rewrite it in 28 words or fewer?",
  "scoring.categoryFallback": "Category {0}",
  "scoring.aria.scoreInput": "Score 1 to 10",
  "presentation.ready": "Your presentation is ready.",
  "presentation.error": "Presentation generation failed. Please check that the template exists and try again.",
  "meta.benProfile.paragraph1":
    "My name is Ben Steenstra (1973). I am a Dutch serial entrepreneur, executive coach, author, and public speaker, and I help people grow their businesses while staying grounded in what feels truly meaningful for them.",
  "meta.benProfile.paragraph2":
    "I combine practical strategy frameworks with coaching to turn big ideas into clear, actionable plans.",
  "meta.benProfile.paragraph3":
    "I have applied this model worldwide in many countries, including with organizations such as Samsung, HTC, LG, New Black, and Fresh and Rebel and many more.",
  "meta.benProfile.paragraph4":
    "For more information, to read my articles, view my movies, or to instantly book an appointment, visit my website: {0}.",
  "motivation.opener":
    "I am not here to make you sound impressive. I am here to help you say what is true.\nBecause when you lead, there are days you carry everything. Pressure, pace, expectations. And in that noise, even a strong founder can lose the thread.\nThis canvas brings you back to the thread. The part that matters. The reason you can stand behind. The words that feel real. Real words create real momentum.",
  "motivation.provenLine":
    "This is a proven model used worldwide, including by Samsung, HTC, LG, New Black, and Fresh 'n Rebel.",
  "motivation.continuePrompt": "Give me one honest sentence. Not perfect. Just true.",
  "motivation.continueTemplate":
    "What we are doing now is protecting your motivation by making \"{0}\" clear in words you can actually carry into real decisions.",
  "motivation.essencePrefix": "Essence so far: \"{0}\"",
  "meta.modelCredibility.body":
    "This is a practical, step-by-step canvas model that turns ideas into clear choices and real trade-offs.",
  "meta.topic.toolAudience.body":
    "This Canvas Builder is designed for founders, entrepreneurs, and startups who want a clear and actionable strategy. It also supports SMEs and scale-ups refining a product, market positioning, or growth plan. It is suitable for national and internationally operating companies that need alignment across teams and markets. It is also useful for C-level leaders and leadership teams who want to validate, recalibrate, or realign strategic direction. Finally, it supports advisors, consultants, accelerators, and innovation teams who want a structured way to turn discussions into a clear strategic output.",
  "meta.topic.stepSkipNotSupported.body":
    "This process is designed to build a complete end result step by step. The final output depends on every step to generate a complete and coherent business canvas for your company. Skipping steps is therefore not supported in this process.",
  "meta.topic.stepPointless.body":
    "I understand you may not see the value of this step right now. However, the most successful companies can answer every part of this process, because strategy becomes clear when nothing important is left unstated. Please give it another try. Once you see the final result, the connection between the steps and the importance of each one will likely make more sense.",
  "meta.topic.stepBackNotSupported.body":
    "This is a linear process. Once a step is completed, you cannot go back during the flow. Do not worry. At the end, when you generate your presentation, you will be able to review each step and make changes before building the final deck.",
  "meta.topic.canvasValue.body":
    "Successful entrepreneurs and leaders stay focused on what truly matters. Everything else is execution and day-to-day operations. This canvas gives you a clear overview of the core of your business, including what it is, who it serves, why it wins, and what it needs to succeed. That creates clarity and direction. It can also strengthen motivation during difficult moments, because the purpose and drivers behind the business are made explicit. With this canvas as a foundation, you can steer and develop tactical and operational work, such as marketing plans, business development priorities, and financial forecasting, more effectively.",
  "meta.topic.sessionStorage.body":
    "We store the output of each step only while your session remains open. If you close the widget, the information is permanently deleted. The only data we retain from the session is token usage for internal review and insights.",
  "meta.topic.presentationMediaNotSupported.body":
    "Unfortunately, it is not yet possible to include images or logos in the presentation. We are working hard to make this possible in the future.",
  "meta.topic.noStartingPoint.body":
    "This Canvas Builder is designed to turn an idea or an existing direction into concrete strategic choices and a coherent story. It works best when you already have an initial direction, even if it is still rough. If you have no starting point at all or no clear problem area yet, it is usually better to explore a first idea first and then use this process to sharpen and structure it.",
  "ppt.heading.purpose": "Purpose",
  "ppt.heading.role": "Role",
  "ppt.heading.strategy": "Strategy",
  "ppt.heading.entity": "Entity",
  "ppt.heading.dream": "Dream",
  "ppt.heading.targetgroup": "Target Group",
  "ppt.heading.productsservices": "Products and Services",
  "ppt.heading.rulesofthegame": "Rules of the Game",
  "concept.why": "Why",
  "entity.suggestion.template": "What do you think of the wording:\n{0}",
  "offtopic.companyFallback": "my future company",
  "offtopic.step.dream": "Dream",
  "offtopic.step.purpose": "Purpose",
  "offtopic.step.bigwhy": "Big Why",
  "offtopic.step.role": "Role",
  "offtopic.step.entity": "Entity",
  "offtopic.step.strategy": "Strategy",
  "offtopic.step.targetgroup": "Target Group",
  "offtopic.step.productsservices": "Products and Services",
  "offtopic.step.rulesofthegame": "Rules of the game",
  "offtopic.step.presentation": "Presentation",
  "sectionTitle.dream": "Your Dream",
  "sectionTitle.purposeOf": "The Purpose of {0}",
  "sectionTitle.purposeOfFuture": "The Purpose of my future company",
  "sectionTitle.bigwhyOf": "The Big Why of {0}",
  "sectionTitle.bigwhyOfFuture": "The Big Why of my future company",
  "sectionTitle.roleOf": "The Role of {0}",
  "sectionTitle.roleOfFuture": "The Role of my future company",
  "sectionTitle.entityOf": "The Entity of {0}",
  "sectionTitle.entityOfFuture": "The Entity of my future company",
  "sectionTitle.strategyOf": "The Strategy of {0}",
  "sectionTitle.strategyOfFuture": "The Strategy of my future company",
  "sectionTitle.targetgroupOf": "The Target Group of {0}",
  "sectionTitle.targetgroupOfFuture": "The Target Group of my future company",
  "sectionTitle.productsservicesOf": "The Products and Services of {0}",
  "sectionTitle.productsservicesOfFuture": "The Products and Services of my future company",
  "sectionTitle.rulesofthegameOf": "The Rules of the game of {0}",
  "sectionTitle.rulesofthegameOfFuture": "The Rules of the game of my future company",
  "sectionTitle.presentation": "Create your Presentation",
};

function buildMenuLabelUiDefaults(): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [menuId, codesRaw] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const safeActionCodes = Array.isArray(codesRaw)
      ? codesRaw.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    const labelKeys = Array.isArray(MENU_LABEL_KEYS[menuId])
      ? MENU_LABEL_KEYS[menuId]
      : [];
    if (safeActionCodes.length === 0) continue;
    for (let i = 0; i < safeActionCodes.length; i += 1) {
      const actionCode = safeActionCodes[i];
      const key = String(labelKeys[i] || "").trim() || labelKeyForMenuAction(menuId, actionCode, i);
      const label = String(MENU_LABEL_DEFAULTS[key] || "").trim();
      if (!key || !label) continue;
      next[key] = label;
    }
  }
  return next;
}

export const UI_STRINGS_WITH_MENU_KEYS: Record<string, string> = {
  ...UI_STRINGS_DEFAULT,
  ...buildMenuLabelUiDefaults(),
};

export const UI_STRINGS_KEYS = Object.keys(UI_STRINGS_WITH_MENU_KEYS);
export const UI_STRINGS_SCHEMA_VERSION = "2026-03-07-ui-i18n-v6_catalog";

function buildCriticalUiKeysStep0(): string[] {
  const keySet = new Set<string>([
    "title.step_0",
    "stepLabel.validation",
    "sectionTitle.step_0",
    "uiSubtitle",
    "uiUseWidgetToContinue",
    "startHint",
    "inputPlaceholder",
    "btnStart",
    "btnGoToNextStep",
    "prestartWelcome",
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
    "prestart.loading",
    "step0.carddesc",
    "step0.question.initial",
    "step0.readiness.statement.existing",
    "step0.readiness.statement.starting",
    "step0.readiness.suffix",
    "transient.rate_limited",
    "transient.timeout",
    "transient.connection_failed",
    "transient.connecting",
    "hydration.retry.title",
    "hydration.retry.body",
    "hydration.retry.action",
    "error.session_upgrade.title",
    "error.session_upgrade.body",
    "error.contract.title",
    "error.contract.body",
    "error.generic.title",
    "error.generic.body",
  ]);
  for (const key of UI_STRINGS_KEYS) {
    if (key.startsWith("menuLabel.STEP0_")) keySet.add(key);
  }
  return [...keySet].filter((key) => UI_STRINGS_KEYS.includes(key));
}

export const CRITICAL_UI_KEYS_STEP0 = buildCriticalUiKeysStep0();

export const CRITICAL_UI_KEYS_INTERACTIVE_BASE: string[] = [
  "byText",
  "uiSubtitle",
  "uiUseWidgetToContinue",
  "inputPlaceholder",
  "btnGoToNextStep",
  "sendTitle",
  "transient.rate_limited",
  "transient.timeout",
  "transient.connection_failed",
  "transient.connecting",
  "hydration.retry.title",
  "hydration.retry.body",
  "hydration.retry.action",
  "error.session_upgrade.title",
  "error.session_upgrade.body",
  "error.contract.title",
  "error.contract.body",
  "error.generic.title",
  "error.generic.body",
].filter((key) => UI_STRINGS_KEYS.includes(key));

const STEP_TITLE_KEYS: Record<string, string> = {
  step_0: "title.step_0",
  dream: "title.dream",
  purpose: "title.purpose",
  bigwhy: "title.bigwhy",
  role: "title.role",
  entity: "title.entity",
  strategy: "title.strategy",
  targetgroup: "title.targetgroup",
  productsservices: "title.productsservices",
  rulesofthegame: "title.rulesofthegame",
  presentation: "title.presentation",
};

export function criticalUiKeysForStep(stepIdRaw: string): string[] {
  const stepId = String(stepIdRaw || "").trim().toLowerCase();
  if (stepId === "step_0") return CRITICAL_UI_KEYS_STEP0;
  const titleKey = STEP_TITLE_KEYS[stepId];
  const keys = new Set<string>(CRITICAL_UI_KEYS_INTERACTIVE_BASE);
  if (titleKey && UI_STRINGS_KEYS.includes(titleKey)) keys.add(titleKey);
  return [...keys];
}

export const UI_STRINGS_SOURCE_EN: Record<string, string> = UI_STRINGS_WITH_MENU_KEYS;
