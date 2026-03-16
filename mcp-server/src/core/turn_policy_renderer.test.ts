import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultState } from "./state.js";
import { renderFreeTextTurnPolicy } from "./turn_policy_renderer.js";
import { buildUiContractId } from "./ui_contract_id.js";

test("strategy wording-pick render always appends canonical bullet context and never exposes consolidate action", () => {
  const statements = [
    "Focus op het ontwikkelen van concepten die mensen inspireren tot zelfontplooiing",
    "Selectief zijn in het aannemen van opdrachten die aansluiten bij de eigen waarden",
    "Kwaliteit en diepgang altijd boven snelheid of volume stellen",
    "Samenwerken met klanten die passen bij de waarden en energie van Mindd",
  ];

  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { strategy: statements.join("\n") };
  (state as any).provisional_source_by_step = { strategy: "wording_pick" };

  const specialist = {
    action: "ASK",
    message:
      "De huidige strategie van Mindd is. Focus op het ontwikkelen van concepten die mensen inspireren tot zelfontplooiing Selectief zijn in het aannemen van opdrachten die aansluiten bij de eigen waarden Kwaliteit en diepgang altijd boven snelheid of volume stellen Samenwerken met klanten die passen bij de waarden en energie van Mindd",
    question: "Waar focus je nog meer op binnen je strategie?",
    strategy: statements.join("\n"),
    refined_formulation: statements.join("\n"),
    statements,
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist,
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /- Focus op het ontwikkelen van concepten/i);
  assert.match(message, /- Selectief zijn in het aannemen/i);
  assert.match(message, /- Kwaliteit en diepgang altijd boven snelheid/i);
  assert.match(message, /- Samenwerken met klanten die passen bij de waarden/i);
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_STRATEGY_CONSOLIDATE"),
    false,
    "bundel/consolidate mag niet in strategy menu verschijnen"
  );
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_STRATEGY_CONFIRM_SATISFIED"),
    true,
    "bevestig/ga door actie moet beschikbaar blijven bij 4 focuspunten"
  );
});

test("strategy confirm render exposes consolidate action when focus points overflow", () => {
  const statements = [
    "Focus op het ontwikkelen van concepten die mensen inspireren tot zelfontplooiing",
    "Selectief zijn in het aannemen van opdrachten die aansluiten bij de eigen waarden",
    "Kwaliteit en diepgang altijd boven snelheid of volume stellen",
    "Samenwerken met klanten die passen bij de waarden en energie van Mindd",
    "Ruimte houden voor experiment en vernieuwing in elk traject",
    "Meetbare strategische impact als vast onderdeel van elk voorstel",
    "Voorkeur geven aan langdurige samenwerkingen boven losse projecten",
    "Expliciet kiezen voor klanten met maatschappelijke relevantie",
  ];

  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { strategy: statements.join("\n") };
  (state as any).provisional_source_by_step = { strategy: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("strategy", "valid_output", "STRATEGY_MENU_CONFIRM"),
      question: "Klopt deze strategie voor Mindd?",
      message: statements.join("\n"),
      strategy: statements.join("\n"),
      refined_formulation: statements.join("\n"),
      statements,
    },
    previousSpecialist: {},
  });

  assert.equal(
    rendered.uiActionCodes.includes("ACTION_STRATEGY_CONSOLIDATE"),
    true,
    "bundel/consolidate moet beschikbaar zijn bij meer dan 7 focuspunten"
  );
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_STRATEGY_REFINE_EXPLAIN_MORE"),
    false,
    "refine/explain-more moet verborgen blijven terwijl consolidate actief is"
  );
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_STRATEGY_CONFIRM_SATISFIED"),
    true,
    "bevestig/ga door moet beschikbaar blijven in het confirm-menu"
  );
});

test("strategy pending wording-choice render does not append canonical context block", () => {
  const state = getDefaultState();
  const statements = [
    "Focus op enterprise klanten met complexe transformatievraagstukken",
    "Focus op langdurige strategische samenwerkingen met beslissers",
  ];
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { strategy: statements.join("\n") };
  (state as any).provisional_source_by_step = { strategy: "user_input" };

  const specialist = {
    action: "ASK",
    wording_choice_pending: "true",
    wording_choice_mode: "list",
    wording_choice_target_field: "strategy",
    wording_choice_user_items: statements,
    wording_choice_suggestion_items: [...statements, "Focus op meetbare waarderealisatie per traject"],
    message:
      "Dit is je input:\n- Focus op enterprise klanten met complexe transformatievraagstukken\n- Focus op langdurige strategische samenwerkingen met beslissers\n\nDit is mijn suggestie:\n- Focus op enterprise klanten met complexe transformatievraagstukken\n- Focus op langdurige strategische samenwerkingen met beslissers\n- Focus op meetbare waarderealisatie per traject",
    question: "",
    refined_formulation: statements.join("\n"),
    strategy: statements.join("\n"),
    statements,
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist,
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(message.includes("You now have"), false);
  assert.equal(message.includes("Your current Strategy for"), false);
  assert.equal(message.includes("Kies de versie") || message.includes("Dit is mijn suggestie"), true);
});

test("strategy examples render exposes choose-one action instead of the legacy refine-only menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).__ui_phase_by_step = {
    strategy: buildUiContractId("strategy", "ASK", "STRATEGY_MENU_EXAMPLES"),
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("strategy", "ASK", "STRATEGY_MENU_EXAMPLES"),
      message: [
        "HERE ARE THREE EXAMPLE STRATEGIES FOR MINDD:",
        "",
        "EXAMPLE 1",
        "- Focus on long-term partnerships",
        "- Prioritize depth over volume",
        "- Select clients that match the mission",
        "- Invest in strategic learning",
      ].join("\n"),
      question: "Which example feels closest, and what would you change to make it fit?",
      refined_formulation: "",
      strategy: "",
      is_offtopic: false,
    },
    previousSpecialist: {
      ui_contract_id: buildUiContractId("strategy", "ASK", "STRATEGY_MENU_EXAMPLES"),
    },
  });

  assert.deepEqual(rendered.uiActionCodes, ["ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME"]);
});

test("stuck support questions mode suppresses step buttons for eligible steps", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).__step_support_mode_by_step = { purpose: "stuck_questions" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: [
        "Ik merk dat deze stap nog niet helder voelt.",
        "",
        "- Welke overtuiging onder deze droom raakt je het meest?",
        "- Welke menselijke behoefte wil je hier beschermen?",
        "- Waar zou je ook voor blijven staan als het lastig wordt?",
      ].join("\n"),
      question: "",
      purpose: "",
      refined_formulation: "",
      feedback_reason_text: "",
      step_support_state: "stuck",
      is_offtopic: false,
      wants_recap: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
  });

  assert.deepEqual(rendered.uiActionCodes, []);
});

test("strategy wording-choice picker suppresses the normal step question", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      message: "Kies de beste formulering voor het resterende verschil.",
      question: "Waar focus je nog meer op binnen je strategie?",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_variant: "grouped_list_units",
      wording_choice_target_field: "strategy",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["Recurring revenue through retainers"],
          suggestion_items: ["Build recurring revenue with implementation retainers"],
          user_text: "Recurring revenue through retainers",
          suggestion_text: "Build recurring revenue with implementation retainers",
          resolution: "",
          confidence: "fallback",
        },
      ],
      wording_choice_compare_segments: [{ kind: "unit", unit_id: "unit_1" }],
      wording_choice_user_items: ["Recurring revenue through retainers"],
      wording_choice_suggestion_items: ["Build recurring revenue with implementation retainers"],
    },
    previousSpecialist: {},
  });

  assert.equal(String((rendered.specialist as any).question || ""), "");
});

test("strategy render strips model-owned English summary lines and keeps runtime-owned canonical context", () => {
  const state = getDefaultState();
  const statements = [
    "Focus op enterprise klanten met complexe transformatievraagstukken",
    "Focus op langdurige strategische samenwerkingen met beslissers",
  ];
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { strategy: statements.join("\n") };
  (state as any).provisional_source_by_step = { strategy: "user_input" };

  const specialist = {
    action: "ASK",
    message: [
      "I've reformulated your input into valid strategy focus choices:",
      "",
      "<strong>So far we have these 2 strategic focus points:</strong>",
      `- ${statements[0]}`,
      `- ${statements[1]}`,
      "",
      "If you want to sharpen or adjust these, let me know.",
    ].join("\n"),
    question: "Is er nog meer waar je altijd op wilt focussen?",
    refined_formulation: statements.join("\n"),
    strategy: statements.join("\n"),
    statements,
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist,
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(/so far we have these/i.test(message), false);
  assert.equal(/i['’]?ve reformulated your input/i.test(message), false);
  assert.equal(/if you want to sharpen or adjust these/i.test(message), false);
  assert.match(message, /You now have 2 focus points within your strategy/i);
  assert.match(message, /Your current Strategy for Mindd is:/i);
});

test("productsservices summary list keeps confirm action available before final commit", () => {
  const state = getDefaultState();
  (state as any).current_step = "productsservices";
  (state as any).active_specialist = "ProductsServices";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = {
    productsservices: "Branding\nStrategie\nDesign\nWebsites",
  };
  (state as any).provisional_source_by_step = {
    productsservices: "user_input",
  };

  const specialist = {
    action: "ASK",
    message:
      "Dit is wat je volgens jouw input aanbiedt aan je klanten:\n\n- Branding\n- Strategie\n- Design\n- Websites\n\nIs dit alles wat Mindd aanbiedt of is er meer?",
    question: "",
    refined_formulation: "",
    productsservices: "",
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "productsservices",
    state,
    specialist,
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_PRODUCTSSERVICES_CONFIRM"),
    true,
    "bevestig/ga door actie moet beschikbaar zijn zodra de products/services-lijst zichtbaar is"
  );
});

test("known-facts recap renders strategy as bullets from run-on sentence text", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).business_name = "Mindd";
  (state as any).strategy_final =
    "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten. Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant. Overpresteren in projecten die via het bestaande netwerk binnenkomen. Prioriteit geven aan klanten met substantiële investeringsbereidheid.";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      question: "Ga verder met strategie",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /strategy\s*:/i);
  assert.match(message, /•\s*Focussen op opdrachten voor grote ondernemingen/i);
  assert.match(message, /•\s*Altijd inzetten op langdurige samenwerkingen/i);
  assert.match(message, /•\s*Overpresteren in projecten die via het bestaande netwerk binnenkomen/i);
  assert.match(message, /•\s*Prioriteit geven aan klanten met substantiële investeringsbereidheid/i);
});

test("known-facts recap keeps products/services and rules as bullet sections", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).business_name = "Mindd";
  (state as any).productsservices_final = "AI-compatibele websites en apps; AI-tools en -ondersteuning; Branding";
  (state as any).rulesofthegame_final =
    "Werk met duidelijke scope-afspraken. Lever iteratief en transparant op. Communiceer proactief bij risico's.";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      question: "Ga verder met spelregels",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /products.*services\s*:/i);
  assert.match(message, /•\s*AI-compatibele websites en apps/i);
  assert.match(message, /•\s*AI-tools en -ondersteuning/i);
  assert.match(message, /rules.*game\s*:/i);
  assert.match(message, /•\s*Werk met duidelijke scope-afspraken/i);
  assert.match(message, /•\s*Lever iteratief en transparant op/i);
});

test("known-facts recap keeps products/services items with internal commas as one bullet", () => {
  const state = getDefaultState();
  (state as any).current_step = "productsservices";
  (state as any).business_name = "Mindd";
  (state as any).productsservices_final = [
    "Traditionele communicatiediensten (zoals DTP, posters, campagnes)",
    "Strategisch bedrijfs- en communicatieadvies",
  ].join("\n");

  const rendered = renderFreeTextTurnPolicy({
    stepId: "productsservices",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      question: "Ga verder met producten en diensten",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /products.*services\s*:/i);
  assert.match(message, /•\s*Traditionele communicatiediensten \(zoals DTP, posters, campagnes\)/i);
  assert.equal(message.includes("• posters"), false);
  assert.equal(message.includes("• campagnes)"), false);
});

test("known-facts recap includes provisional rules when only statements-backed staging exists", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = {
    rulesofthegame:
      "• We bewaken kwaliteit.\n• We doen alles met plezier.\n• We maken de klant koning.\n• We geven minder uit dan er binnenkomt.\n• We zijn punctueel.",
  };
  (state as any).provisional_source_by_step = {
    rulesofthegame: "user_input",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      question: "Ga verder met spelregels",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /rules.*game\s*:/i);
  assert.match(message, /•\s*We bewaken kwaliteit/i);
  assert.match(message, /•\s*We maken de klant koning/i);
});

test("known-facts recap output is markup-free for user-facing text", () => {
  const state = getDefaultState();
  (state as any).current_step = "presentation";
  (state as any).business_name = "Mindd";
  (state as any).strategy_final =
    "<strong>Strategie:</strong> Focus op enterprise-opdrachten. Bouw langdurige samenwerkingen.";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "presentation",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      message: "<strong>Dit mag niet zichtbaar zijn</strong>",
      question: "",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.doesNotMatch(message, /<[^>]+>/);
});

test("presentation recap requests keep the existing recap visible without rendering a second recap block", () => {
  const state = getDefaultState();
  const recap =
    "This is what you said:\n\nDream: Build calm around complex choices.\n\nPurpose: Turn complexity into clarity.";
  (state as any).current_step = "presentation";
  (state as any).active_specialist = "Presentation";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { presentation: recap };
  (state as any).provisional_source_by_step = { presentation: "user_input" };
  (state as any).ui_strings = {
    "presentation.recapVisibleFeedback":
      "The summary is already visible on screen. Tell me what to adjust, or create the presentation.",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "presentation",
    state,
    specialist: {
      action: "ASK",
      wants_recap: true,
      user_intent: "RECAP_REQUEST",
      meta_topic: "RECAP",
      message: "This should be replaced",
      question: "",
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.match(message, /The summary is already visible on screen/i);
  assert.equal(message.split("This is what you said:").length - 1, 1);
  assert.equal(message.split("Dream: Build calm around complex choices.").length - 1, 1);
});

test("rulesofthegame does not expose confirm when fewer than 3 rules are accepted", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = {
    rulesofthegame: "• We communiceren proactief.\n• We komen afspraken na.",
  };
  (state as any).provisional_source_by_step = {
    rulesofthegame: "user_input",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "So far we have these 2 Rules of the Game.",
      question: "",
      refined_formulation: "• We communiceren proactief.\n• We komen afspraken na.",
      rulesofthegame: "• We communiceren proactief.\n• We komen afspraken na.",
      statements: [
        "We communiceren proactief.",
        "We komen afspraken na.",
      ],
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.contractId, "rulesofthegame:incomplete_output:RULES_MENU_ASK_EXPLAIN");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), false);
  assert.match(message, /you now have 2 rules of the game/i);
  assert.match(message, /at least 3 and at most 5 rules of the game/i);
  assert.match(message, /current rules of the game.*mindd.*are:/i);
});

test("rulesofthegame exposes confirm when 3 accepted internal rules are available", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = {
    rulesofthegame:
      "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
  };
  (state as any).provisional_source_by_step = {
    rulesofthegame: "user_input",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "So far we have these 3 Rules of the Game.",
      question: "",
      refined_formulation:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
      rulesofthegame:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
      statements: [
        "We communiceren proactief.",
        "We werken met duidelijke scope.",
        "We nemen eigenaarschap.",
      ],
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.contractId, "rulesofthegame:valid_output:RULES_MENU_CONFIRM");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), true);
  assert.match(message, /you now have 3 rules of the game/i);
  assert.match(message, /current rules of the game.*mindd.*are:/i);
});

test("rulesofthegame overflow renders pending-choice context and suppresses confirm menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "Kies wat je wilt gebruiken: jouw input of mijn suggestie.",
      question: "",
      refined_formulation: "",
      rulesofthegame: "",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_target_field: "rulesofthegame",
      wording_choice_user_items: [
        "We communiceren proactief.",
        "We leveren op tijd.",
        "We zijn transparant over risico's.",
        "We nemen eigenaarschap.",
        "We werken met duidelijke scope.",
        "We borgen kwaliteit onder druk.",
      ],
      wording_choice_suggestion_items: [
        "We communiceren proactief.",
        "We leveren op tijd.",
        "We nemen eigenaarschap.",
        "We werken met duidelijke scope.",
        "We borgen kwaliteit onder druk.",
      ],
      statements: [
        "We communiceren proactief.",
        "We leveren op tijd.",
        "We zijn transparant over risico's.",
        "We nemen eigenaarschap.",
        "We werken met duidelijke scope.",
        "We borgen kwaliteit onder druk.",
      ],
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.contractId, "rulesofthegame:incomplete_output:RULES_MENU_ASK_EXPLAIN");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), false);
});

test("rulesofthegame keeps confirm available for accepted 3-5 rule sets even when wording is externally framed", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";
  (state as any).provisional_by_step = {
    rulesofthegame: "• Gratis is gratis voor iedereen.\n• We komen afspraken na.\n• We communiceren proactief.",
  };
  (state as any).provisional_source_by_step = {
    rulesofthegame: "user_input",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "So far we have these 3 Rules of the Game.",
      question: "",
      refined_formulation: "• Gratis is gratis voor iedereen.\n• We komen afspraken na.\n• We communiceren proactief.",
      rulesofthegame: "• Gratis is gratis voor iedereen.\n• We komen afspraken na.\n• We communiceren proactief.",
      statements: [
        "Gratis is gratis voor iedereen.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.contractId, "rulesofthegame:valid_output:RULES_MENU_CONFIRM");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), true);
});

test("rulesofthegame confirm render strips stale compare feedback contracts from prior wording states", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = {
    rulesofthegame:
      "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
  };
  (state as any).provisional_source_by_step = {
    rulesofthegame: "user_input",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "So far we have these 3 Rules of the Game.",
      question: "",
      refined_formulation:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
      rulesofthegame:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
      statements: [
        "We communiceren proactief.",
        "We werken met duidelijke scope.",
        "We nemen eigenaarschap.",
      ],
      ui_feedback_contract: {
        kind: "grouped_list_compare",
        mode: "list",
        rationale: "Stale compare contract should not survive into confirm state.",
        current_items: ["Oude regel"],
        suggested_items: ["Nieuwe regel"],
      },
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.contractId, "rulesofthegame:valid_output:RULES_MENU_CONFIRM");
  assert.equal((rendered.specialist as Record<string, unknown>).ui_feedback_contract, undefined);
  assert.match(String((rendered.specialist as Record<string, unknown>).message || ""), /current rules of the game/i);
});

test("entity no-output render ignores stale refine phase menu and falls back to intro menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "entity";
  (state as any).active_specialist = "Entity";
  (state as any).business_name = "Mindd";
  (state as any).__ui_phase_by_step = {
    entity: buildUiContractId("entity", "valid_output", "ENTITY_MENU_EXAMPLE"),
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "ASK",
      message: "Ik kan dit verder toelichten.",
      question: "",
      refined_formulation: "",
      entity: "",
      is_offtopic: false,
    },
    previousSpecialist: {
      ui_contract_id: buildUiContractId("entity", "valid_output", "ENTITY_MENU_EXAMPLE"),
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.contractId, "entity:no_output:ENTITY_MENU_INTRO");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_ENTITY_INTRO_FORMULATE",
    "ACTION_ENTITY_INTRO_EXPLAIN_MORE",
  ]);
  assert.equal(rendered.uiActionCodes.includes("ACTION_ENTITY_EXAMPLE_REFINE"), false);
});

test("targetgroup no-output render ignores stale postrefine phase menu and falls back to intro menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "targetgroup";
  (state as any).active_specialist = "TargetGroup";
  (state as any).business_name = "Mindd";
  (state as any).__ui_phase_by_step = {
    targetgroup: buildUiContractId("targetgroup", "valid_output", "TARGETGROUP_MENU_POSTREFINE"),
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "targetgroup",
    state,
    specialist: {
      action: "ASK",
      message: "Ik kan dit verder toelichten.",
      question: "",
      refined_formulation: "",
      targetgroup: "",
      is_offtopic: false,
    },
    previousSpecialist: {
      ui_contract_id: buildUiContractId("targetgroup", "valid_output", "TARGETGROUP_MENU_POSTREFINE"),
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.contractId, "targetgroup:no_output:TARGETGROUP_MENU_INTRO");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE",
    "ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS",
  ]);
  assert.equal(rendered.uiActionCodes.includes("ACTION_TARGETGROUP_POSTREFINE_CONFIRM"), false);
});

test("entity valid output uses current-value heading after wording pick and suppresses duplicate free text", () => {
  const state = getDefaultState();
  const canonical = "Mindd is een digitale innovatiepartner voor mkb-bedrijven.";
  (state as any).current_step = "entity";
  (state as any).active_specialist = "Entity";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { entity: canonical };
  (state as any).provisional_source_by_step = { entity: "wording_pick" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "ASK",
      message: canonical,
      question: "",
      refined_formulation: "",
      entity: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /current.*entity.*mindd.*is:/i);
  assert.match(message, /Mindd is een digitale innovatiepartner voor mkb-bedrijven\./i);
  assert.equal(message.split(canonical).length - 1, 1);
  assert.equal(String((rendered.specialist as any).__suppress_refined_append || ""), "true");
  assert.equal(String(uiContent.kind || ""), "single_value");
  assert.match(String(uiContent.heading || ""), /current.*entity.*mindd.*is:/i);
  assert.equal(String(uiContent.canonical_text || ""), canonical);
  assert.equal(String(uiContent.support_text || ""), "");
});

test("dream valid output from user-input summary uses autosuggest heading instead of current-value heading", () => {
  const state = getDefaultState();
  const canonical =
    "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.";
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { dream: canonical };
  (state as any).provisional_source_by_step = { dream: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Ik heb je input herschreven naar een inspirerend toekomstbeeld.",
      question: "",
      refined_formulation: canonical,
      dream: canonical,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const feedbackContract = (rendered.specialist as any).ui_feedback_contract as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.equal(String(feedbackContract.kind || ""), "single_value_canonical_suggestion");
  assert.equal(
    String(feedbackContract.heading || ""),
    "Based on your input I suggest the following Dream:"
  );
  assert.doesNotMatch(String(feedbackContract.heading || ""), /current.*dream.*mindd.*is:/i);
  assert.equal(String(feedbackContract.suggested_value || ""), canonical);
});

test("single-value valid output from user input keeps autosuggest heading until wording pick or final commit", () => {
  const cases = [
    {
      stepId: "purpose",
      field: "purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      specialistLabel: "Purpose",
      expectedHeading: "Based on your input I suggest the following Purpose:",
    },
    {
      stepId: "bigwhy",
      field: "bigwhy",
      canonical:
        "Mensen verdienen eerlijke informatie zodat zij zelfstandig keuzes kunnen maken die hun leven verrijken.",
      specialistLabel: "BigWhy",
      expectedHeading: "Based on your input I suggest the following Big Why:",
    },
    {
      stepId: "role",
      field: "role",
      canonical: "Mindd verbindt complexe informatie met menselijke besluitkracht.",
      specialistLabel: "Role",
      expectedHeading: "Based on your input I suggest the following Role:",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.specialistLabel;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [current.stepId]: current.canonical };
    (state as any).provisional_source_by_step = { [current.stepId]: "user_input" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        message: "Vrije feedback die niet in de suggest-view mag blijven staan.",
        question: "",
        refined_formulation: "",
        [current.field]: "",
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const feedbackContract = (rendered.specialist as any).ui_feedback_contract as Record<string, unknown>;
    assert.equal(rendered.status, "valid_output");
    assert.equal(String(feedbackContract.kind || ""), "single_value_canonical_suggestion");
    assert.equal(String(feedbackContract.heading || ""), current.expectedHeading);
    assert.equal(String(feedbackContract.suggested_value || ""), current.canonical);
  }
});

test("purpose semantic intro chrome stays hidden outside the actual intro screen", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "I can ask three questions to help you define the Purpose.",
      question: "What deeper reason makes this business matter to you?",
      ui_contract_id: buildUiContractId("purpose", "ASK", "PURPOSE_MENU_POST_ASK"),
    },
    previousSpecialist: {},
  });

  assert.equal(String((rendered.specialist as any).ui_show_step_intro_chrome || ""), "");
  assert.equal(rendered.contractId, "purpose:no_output:PURPOSE_MENU_POST_ASK");
});

test("purpose semantic intro chrome stays hidden for refine states", () => {
  const state = getDefaultState();
  const canonical = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: canonical,
      question: "",
      purpose: canonical,
      refined_formulation: canonical,
    },
    previousSpecialist: {},
  });

  assert.equal(String((rendered.specialist as any).ui_show_step_intro_chrome || ""), "");
  assert.equal(rendered.contractId, "purpose:valid_output:PURPOSE_MENU_REFINE");
});

test("purpose semantic intro chrome stays hidden while wording-choice is pending", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "Kies welke formulering je wilt gebruiken.",
      question: "",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "purpose",
      wording_choice_user_raw: "Ik wil iets goeds doen.",
      wording_choice_user_normalized: "Ik wil iets goeds doen.",
      wording_choice_agent_current: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    },
    previousSpecialist: {},
  });

  assert.equal(String((rendered.specialist as any).ui_show_step_intro_chrome || ""), "");
});

test("targetgroup valid output keeps a single canonical heading/value block", () => {
  const state = getDefaultState();
  const canonical = "Innovatieve mkb-bedrijven met complexe digitaliseringsvraagstukken.";
  (state as any).current_step = "targetgroup";
  (state as any).active_specialist = "TargetGroup";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { targetgroup: canonical };
  (state as any).provisional_source_by_step = { targetgroup: "wording_pick" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "targetgroup",
    state,
    specialist: {
      action: "ASK",
      message: "Helder, die doelgroepkeuze is concreet.",
      question: "",
      refined_formulation: "",
      targetgroup: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /current.*target group.*mindd.*is:/i);
  assert.doesNotMatch(message, /helder, die doelgroepkeuze is concreet/i);
  assert.match(message, /Innovatieve mkb-bedrijven met complexe digitaliseringsvraagstukken\./i);
  assert.equal(message.split(canonical).length - 1, 1);
  assert.equal(String((rendered.specialist as any).__suppress_refined_append || ""), "true");
});

test("single-value confirm steps render exactly one canonical heading/value block in valid output", () => {
  const cases = [
    {
      stepId: "purpose",
      field: "purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      specialistLabel: "Purpose",
    },
    {
      stepId: "bigwhy",
      field: "bigwhy",
      canonical:
        "Mensen verdienen eerlijke informatie zodat zij zelfstandig keuzes kunnen maken die hun leven verrijken.",
      specialistLabel: "BigWhy",
    },
    {
      stepId: "role",
      field: "role",
      canonical: "Mindd verbindt complexe informatie met menselijke besluitkracht.",
      specialistLabel: "Role",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.specialistLabel;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [current.stepId]: current.canonical };
    (state as any).provisional_source_by_step = { [current.stepId]: "wording_pick" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        message: "Vrije feedback die niet in de confirm-view mag blijven staan.",
        question: "",
        refined_formulation: "",
        [current.field]: "",
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const message = String((rendered.specialist as any).message || "");
    const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
    assert.equal(rendered.status, "valid_output");
    assert.match(message, /current.*mindd.*is:/i);
    assert.doesNotMatch(message, /vrije feedback/i);
    assert.equal(message.split(current.canonical).length - 1, 1);
    assert.equal(String((rendered.specialist as any).__suppress_refined_append || ""), "true");
    assert.equal(String(uiContent.kind || ""), "single_value");
    assert.equal(String(uiContent.canonical_text || ""), current.canonical);
    assert.ok(String(uiContent.heading || "").trim().length > 0);
  }
});

test("single-value valid output keeps feedback reason above canonical block when present", () => {
  const state = getDefaultState();
  const canonical = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "wording_pick" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "Dat is een goed beginpunt.",
      question: "",
      refined_formulation: canonical,
      purpose: canonical,
      feedback_reason_text: "Ik heb AI niet als kern opgenomen omdat je Droom effect-gericht blijft.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /ik heb ai niet als kern opgenomen/i);
  assert.match(message, /current.*mindd.*is:/i);
  assert.equal(message.split(canonical).length - 1, 1);
  assert.doesNotMatch(
    String(uiContent.feedback_reason_text || ""),
    /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i
  );
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    /ik heb ai niet als kern opgenomen omdat je droom effect-gericht blijft/i
  );
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});

test("single-value valid output infers feedback reason from multi-sentence purpose reformulation message", () => {
  const state = getDefaultState();
  const canonical = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message:
        "Je beschrijving is nog te algemeen en mist een duidelijk menselijk effect. Ik heb de formulering aangescherpt zodat direct voelbaar wordt waarom Mindd bestaat.",
      question: "",
      refined_formulation: canonical,
      purpose: canonical,
      feedback_reason_text: "Je beschrijving is nog te algemeen en mist een duidelijk menselijk effect.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /je beschrijving is nog te algemeen/i);
  assert.match(message, /based on your input i suggest the following purpose:/i);
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    /je beschrijving is nog te algemeen en mist een duidelijk menselijk effect/i
  );
  assert.doesNotMatch(
    String(uiContent.feedback_reason_text || ""),
    /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i
  );
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});

test("single-value valid output infers feedback reason from multi-sentence big why reformulation message", () => {
  const state = getDefaultState();
  const canonical = "Omdat mensen rust voelen wanneer complexe beslissingen eindelijk helder worden.";
  (state as any).current_step = "bigwhy";
  (state as any).active_specialist = "BigWhy";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { bigwhy: canonical };
  (state as any).provisional_source_by_step = { bigwhy: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "bigwhy",
    state,
    specialist: {
      action: "ASK",
      message:
        "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie. Ik heb hem compacter gemaakt zodat de diepere drijfveer direct voelbaar wordt.",
      question: "",
      refined_formulation: canonical,
      bigwhy: canonical,
      feedback_reason_text: "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /je grote waarom klinkt nog beschrijvend/i);
  assert.match(message, /based on your input i suggest the following big why:/i);
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    /je grote waarom klinkt nog beschrijvend en mist emotionele urgentie/i
  );
  assert.doesNotMatch(
    String(uiContent.feedback_reason_text || ""),
    /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i
  );
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});

test("bigwhy suggestions keep the follow-up menu and options headline from the server contract", () => {
  const state = getDefaultState();
  (state as any).current_step = "bigwhy";
  (state as any).active_specialist = "BigWhy";
  (state as any).business_name = "Mindd";
  (state as any).ui_strings = {
    "contract.headline.define.withOptions": "Definieer je {0} voor {1} of kies een optie.",
    "offtopic.step.bigwhy": "grote waarom",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS":
      "Stel 3 pittige vragen om de Grote Waarom te vinden.",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME": "Kies er één voor mij",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE":
      "Leg het belang van een Grote Waarom uit",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "bigwhy",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("bigwhy", "no_output", "BIGWHY_MENU_FROM_GIVE"),
      message: [
        "HIER ZIJN DRIE MOGELIJKE FORMULERINGEN VOOR DE GROTE WAAROM VAN MINDD:",
        "- Suggestie 1",
        "- Suggestie 2",
        "- Suggestie 3",
      ].join("\n"),
      question: "",
      refined_formulation: "",
      bigwhy: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.contractId, "bigwhy:no_output:BIGWHY_MENU_FROM_GIVE");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS",
    "ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME",
    "ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE",
  ]);
  assert.equal(
    String((rendered.specialist as any).question || ""),
    "Definieer je grote waarom voor Mindd of kies een optie."
  );
});

test("bigwhy follow-up menu survives current-value refinement states", () => {
  const state = getDefaultState();
  const canonical =
    "Omdat mensen richting vinden wanneer hun diepste overtuigingen eindelijk helder worden.";
  (state as any).current_step = "bigwhy";
  (state as any).active_specialist = "BigWhy";
  (state as any).business_name = "Mindd";
  (state as any).ui_strings = {
    "contract.headline.refine.withOptions": "Verfijn je {0} voor {1} of kies een optie.",
    "offtopic.step.bigwhy": "grote waarom",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS":
      "Stel 3 pittige vragen om de Grote Waarom te vinden.",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME": "Kies er één voor mij",
    "menuLabel.BIGWHY_MENU_FROM_GIVE.ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE":
      "Leg het belang van een Grote Waarom uit",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "bigwhy",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("bigwhy", "incomplete_output", "BIGWHY_MENU_FROM_GIVE"),
      message: "Op basis van je input stel ik de volgende grote waarom voor.",
      question: "",
      refined_formulation: canonical,
      bigwhy: canonical,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.contractId, "bigwhy:incomplete_output:BIGWHY_MENU_FROM_GIVE");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS",
    "ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME",
    "ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE",
  ]);
  assert.equal(
    String((rendered.specialist as any).question || ""),
    "Verfijn je grote waarom voor Mindd of kies een optie."
  );
});

test("choose-for-me suggestion menus publish explicit structured suggestion content for the widget", () => {
  const scenarios = [
    {
      stepId: "bigwhy",
      specialistLabel: "BigWhy",
      contractId: buildUiContractId("bigwhy", "no_output", "BIGWHY_MENU_FROM_GIVE"),
      message: [
        "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD",
        "",
        "- Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
        "- Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
        "- Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
      ].join("\n"),
      expectedHeading:
        "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD:",
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
    },
    {
      stepId: "purpose",
      specialistLabel: "Purpose",
      contractId: buildUiContractId("purpose", "no_output", "PURPOSE_MENU_EXAMPLES"),
      message: [
        "HIER ZIJN DRIE MOGELIJKE FORMULERINGEN VOOR DE BESTAANSREDEN VAN MINDD",
        "",
        "- Mindd bestaat om mensen te helpen complexe keuzes met rust en vertrouwen te maken.",
        "- Mindd bestaat om moeilijke informatie om te zetten in helderheid die mensen verder helpt.",
        "- Mindd bestaat om mensen richting te geven wanneer belangrijke beslissingen overweldigend voelen.",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen bestaansreden te schrijven.",
      ].join("\n"),
      expectedHeading: "HIER ZIJN DRIE MOGELIJKE FORMULERINGEN VOOR DE BESTAANSREDEN VAN MINDD:",
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen bestaansreden te schrijven.",
    },
    {
      stepId: "entity",
      specialistLabel: "Entity",
      contractId: buildUiContractId("entity", "no_output", "ENTITY_MENU_SUGGESTIONS"),
      message: [
        "HIER ZIJN DRIE MOGELIJKE ENTITY-FORMULERINGEN VOOR MINDD",
        "",
        "- Een strategisch communicatiebureau.",
        "- Een mensgerichte merkpartner.",
        "- Een creatieve veranderstudio.",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen Entity te schrijven.",
      ].join("\n"),
      expectedHeading: "HIER ZIJN DRIE MOGELIJKE ENTITY-FORMULERINGEN VOOR MINDD:",
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen Entity te schrijven.",
      expectedItems: [
        "Een strategisch communicatiebureau",
        "Een mensgerichte merkpartner",
        "Een creatieve veranderstudio",
      ],
    },
  ] as const;

  for (const scenario of scenarios) {
    const state = getDefaultState();
    (state as any).current_step = scenario.stepId;
    (state as any).active_specialist = scenario.specialistLabel;
    (state as any).business_name = "Mindd";
    (state as any).ui_strings = {
      "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
      [`offtopic.step.${scenario.stepId}`]:
        scenario.stepId === "bigwhy"
          ? "Grote Waarom"
          : scenario.stepId === "purpose"
            ? "bestaansreden"
            : "Entity",
    };

    const rendered = renderFreeTextTurnPolicy({
      stepId: scenario.stepId,
      state,
      specialist: {
        action: "ASK",
        ui_contract_id: scenario.contractId,
        message: scenario.message,
        suggestion_intro: scenario.expectedHeading.replace(/:\s*$/, ""),
        suggestion_items:
          scenario.expectedItems ||
          scenario.message
            .split("\n")
            .filter((line) => line.startsWith("- "))
            .map((line) => line.replace(/^- /, "")),
        suggestion_outro: scenario.expectedOutro,
        suggestion_item_style: "bullets",
        question: "",
        refined_formulation: "",
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
    assert.equal(String(uiContent.kind || ""), "structured_suggestions");
    assert.equal(String(uiContent.heading || ""), scenario.expectedHeading);
    assert.deepEqual(
      uiContent.items,
      scenario.expectedItems ||
        scenario.message
          .split("\n")
          .filter((line) => line.startsWith("- "))
          .map((line) => line.replace(/^- /, ""))
    );
    assert.equal(String(uiContent.outro || ""), scenario.expectedOutro);
    assert.equal(String(uiContent.item_style || ""), "bullets");
  }
});

test("choose-for-me suggestion menus render role and entity bullets from explicit specialist suggestion fields", () => {
  const scenarios = [
    {
      stepId: "role",
      specialistLabel: "Role",
      contractId: buildUiContractId("role", "no_output", "ROLE_MENU_EXAMPLES"),
      message: [
        "HIER ZIJN DRIE VOORBEELDEN VAN EEN ROL VOOR EEN AGENCY ALS MINDD.",
        "- Mindd verbindt merken en mensen zodat duurzame groei en wederzijds begrip ontstaan.",
        "- Mindd vertaalt merkwaarden naar menselijke ervaringen zodat echte verbinding mogelijk wordt.",
        "- Mindd fungeert als brug tussen merken en hun doelgroep zodat samenwerking betekenisvol en toekomstbestendig blijft.",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen Rol te schrijven.",
      ].join("\n"),
      expectedHeading: "HIER ZIJN DRIE VOORBEELDEN VAN EEN ROL VOOR EEN AGENCY ALS MINDD:",
      expectedItems: [
        "Mindd verbindt merken en mensen zodat duurzame groei en wederzijds begrip ontstaan.",
        "Mindd vertaalt merkwaarden naar menselijke ervaringen zodat echte verbinding mogelijk wordt.",
        "Mindd fungeert als brug tussen merken en hun doelgroep zodat samenwerking betekenisvol en toekomstbestendig blijft.",
      ],
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen Rol te schrijven.",
      stepLabel: "Rol",
    },
    {
      stepId: "entity",
      specialistLabel: "Entity",
      contractId: buildUiContractId("entity", "no_output", "ENTITY_MENU_SUGGESTIONS"),
      message: [
        "HIER ZIJN DRIE VOORBEELDEN VAN EEN ENTITEIT VOOR EEN AGENCY ZOALS MINDD.",
        "- Een strategisch positioneringsbureau",
        "- Een merkbelevingsstudio",
        "- Een creatieve groeipartner",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen Entiteit te schrijven.",
      ].join("\n"),
      expectedHeading: "HIER ZIJN DRIE VOORBEELDEN VAN EEN ENTITEIT VOOR EEN AGENCY ZOALS MINDD:",
      expectedItems: [
        "Een strategisch positioneringsbureau",
        "Een merkbelevingsstudio",
        "Een creatieve groeipartner",
      ],
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen Entiteit te schrijven.",
      stepLabel: "Entiteit",
    },
  ] as const;

  for (const scenario of scenarios) {
    const state = getDefaultState();
    (state as any).current_step = scenario.stepId;
    (state as any).active_specialist = scenario.specialistLabel;
    (state as any).business_name = "Mindd";
    (state as any).ui_strings = {
      "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
      [`offtopic.step.${scenario.stepId}`]: scenario.stepLabel,
    };

    const rendered = renderFreeTextTurnPolicy({
      stepId: scenario.stepId,
      state,
      specialist: {
        action: "ASK",
        ui_contract_id: scenario.contractId,
        message: scenario.message,
        suggestion_intro: scenario.expectedHeading.replace(/:\s*$/, ""),
        suggestion_items: scenario.expectedItems,
        suggestion_outro: scenario.expectedOutro,
        suggestion_item_style: "bullets",
        question: "",
        refined_formulation: "",
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
    assert.equal(String(uiContent.kind || ""), "structured_suggestions");
    assert.equal(String(uiContent.heading || ""), scenario.expectedHeading);
    assert.deepEqual(uiContent.items, scenario.expectedItems);
    assert.equal(String(uiContent.outro || ""), scenario.expectedOutro);
  }
});

test("choose-for-me suggestion menus require explicit specialist suggestion fields", () => {
  const state = getDefaultState();
  (state as any).current_step = "entity";
  (state as any).active_specialist = "Entity";
  (state as any).business_name = "Mindd";
  (state as any).ui_strings = {
    "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
    "offtopic.step.entity": "Entiteit",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("entity", "no_output", "ENTITY_MENU_SUGGESTIONS"),
      message: [
        "HIER ZIJN DRIE VOORBEELDEN VAN EEN ENTITEIT VOOR EEN AGENCY ZOALS MINDD.",
        "- Een strategisch positioneringsbureau",
        "- Een merkbelevingsstudio",
        "- Een creatieve groeipartner",
      ].join("\n"),
      question: "",
      refined_formulation: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(Object.prototype.hasOwnProperty.call((rendered.specialist as any) || {}, "ui_content"), false);
});

test("choose-for-me suggestion menus prefer explicit specialist suggestion fields over malformed message text", () => {
  const state = getDefaultState();
  (state as any).current_step = "entity";
  (state as any).active_specialist = "Entity";
  (state as any).business_name = "Mindd";
  (state as any).ui_strings = {
    "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
    "offtopic.step.entity": "Entiteit",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("entity", "no_output", "ENTITY_MENU_SUGGESTIONS"),
      message: [
        "HIER ZIJN DRIE VOORBEELDEN VAN EEN ENTITEIT VOOR EEN AGENCY ZOALS MINDD.",
        "- Ik hoop dat deze suggesties je inspireren om je eigen Entiteit te schrijven.",
      ].join("\n"),
      suggestion_intro: "HIER ZIJN DRIE VOORBEELDEN VAN EEN ENTITEIT VOOR EEN AGENCY ZOALS MINDD.",
      suggestion_items: [
        "Een strategisch positioneringsbureau",
        "Een merkbelevingsstudio",
        "Een creatieve groeipartner",
      ],
      suggestion_outro: "Ik hoop dat deze suggesties je inspireren om je eigen Entiteit te schrijven.",
      question: "",
      refined_formulation: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(String(uiContent.kind || ""), "structured_suggestions");
  assert.deepEqual(uiContent.items, [
    "Een strategisch positioneringsbureau",
    "Een merkbelevingsstudio",
    "Een creatieve groeipartner",
  ]);
});

test("strategy example menus recover a flat 15-bullet response into 3 multiline strategy blocks", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).active_specialist = "Strategy";
  (state as any).business_name = "Mindd";
  (state as any).ui_strings = {
    "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
    "offtopic.step.strategy": "strategie",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      ui_contract_id: buildUiContractId("strategy", "ASK", "STRATEGY_MENU_EXAMPLES"),
      message: [
        "HIER ZIJN DRIE VOORBEELDSTRATEGIEEN DIE PASSEN BIJ EEN TOONAANGEVEND POSITIONERINGSBUREAU ALS MINDD",
        "",
        "- Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "- Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "- Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "- Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        "- Werk alleen met klanten die groei vanuit wederzijds begrip nastreven",
        "- Focus op merken die openstaan voor co-creatie en gezamenlijke groei",
        "- Zet in op het bouwen van langdurige klantrelaties in plaats van losse opdrachten",
        "- Blijf selectief in het aannemen van projecten die passen bij de missie van Mindd",
        "- Investeer in kennisdeling en thought leadership binnen het vakgebied",
        "- Bescherm de kernwaarden van Mindd bij elke samenwerking",
        "- Kies voor diepgaande merkpositioneringstrajecten met impact op lange termijn",
        "- Werk samen met klanten die bereid zijn te investeren in duurzame groei",
        "- Zet in op het creëren van wederzijds begrip als basis voor elke opdracht",
        "- Prioriteer projecten die bijdragen aan de droom van echte verbinding tussen merken en mensen",
        "- Blijf trouw aan een premium en persoonlijke aanpak",
        "",
        "Ik hoop dat deze suggesties je inspireren om je eigen strategie te schrijven.",
      ].join("\n"),
      suggestion_intro: "HIER ZIJN DRIE VOORBEELDSTRATEGIEEN DIE PASSEN BIJ EEN TOONAANGEVEND POSITIONERINGSBUREAU ALS MINDD",
      suggestion_items: [
        [
          "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
          "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
          "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
          "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
          "Werk alleen met klanten die groei vanuit wederzijds begrip nastreven",
        ].join("\n"),
        [
          "Focus op merken die openstaan voor co-creatie en gezamenlijke groei",
          "Zet in op het bouwen van langdurige klantrelaties in plaats van losse opdrachten",
          "Blijf selectief in het aannemen van projecten die passen bij de missie van Mindd",
          "Investeer in kennisdeling en thought leadership binnen het vakgebied",
          "Bescherm de kernwaarden van Mindd bij elke samenwerking",
        ].join("\n"),
        [
          "Kies voor diepgaande merkpositioneringstrajecten met impact op lange termijn",
          "Werk samen met klanten die bereid zijn te investeren in duurzame groei",
          "Zet in op het creëren van wederzijds begrip als basis voor elke opdracht",
          "Prioriteer projecten die bijdragen aan de droom van echte verbinding tussen merken en mensen",
          "Blijf trouw aan een premium en persoonlijke aanpak",
        ].join("\n"),
      ],
      suggestion_outro: "Ik hoop dat deze suggesties je inspireren om je eigen strategie te schrijven.",
      suggestion_item_style: "blocks",
      question: "",
      refined_formulation: "",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(String(uiContent.kind || ""), "structured_suggestions");
  assert.equal(String(uiContent.item_style || ""), "blocks");
  assert.equal(Array.isArray(uiContent.items), true);
  assert.equal((uiContent.items as unknown[]).length, 3);
  assert.match(String((uiContent.items as unknown[])[0] || ""), /Richt je op langdurige samenwerkingen/i);
  assert.match(String((uiContent.items as unknown[])[1] || ""), /Focus op merken die openstaan voor co-creatie/i);
  assert.match(String((uiContent.items as unknown[])[2] || ""), /Kies voor diepgaande merkpositioneringstrajecten/i);
});

test("single-value valid output infers feedback reason across the single-value feedback family", () => {
  const scenarios = [
    {
      stepId: "dream",
      activeSpecialist: "Dream",
      field: "dream",
      canonical: "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.",
      message:
        "Je droom blijft nog te beschrijvend en mist een voelbaar toekomstbeeld. Ik heb hem aangescherpt zodat de ambitie direct menselijker en richtinggevender voelt.",
      expected: "Je droom blijft nog te beschrijvend en mist een voelbaar toekomstbeeld.",
    },
    {
      stepId: "purpose",
      activeSpecialist: "Purpose",
      field: "purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      message:
        "Je bestaansreden blijft nog te breed en laat de bijdrage van Mindd onvoldoende voelen. Ik heb de formulering aangescherpt zodat de betekenis concreter overkomt.",
      expected: "Je bestaansreden blijft nog te breed en laat de bijdrage van Mindd onvoldoende voelen.",
    },
    {
      stepId: "bigwhy",
      activeSpecialist: "BigWhy",
      field: "bigwhy",
      canonical: "Omdat mensen rust voelen wanneer complexe beslissingen eindelijk helder worden.",
      message:
        "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie. Ik heb hem compacter gemaakt zodat de diepere drijfveer direct voelbaar wordt.",
      expected: "Je grote waarom klinkt nog beschrijvend en mist emotionele urgentie.",
    },
    {
      stepId: "role",
      activeSpecialist: "Role",
      field: "role",
      canonical: "Mindd maakt complexe keuzes zichtbaar en hanteerbaar voor ambitieuze teams.",
      message:
        "Je rol blijft nog te algemeen en laat nog niet scherp zien welke bijdrage Mindd levert. Ik heb hem verfijnd zodat de positionerende rol duidelijker naar voren komt.",
      expected: "Je rol blijft nog te algemeen en laat nog niet scherp zien welke bijdrage Mindd levert.",
    },
    {
      stepId: "entity",
      activeSpecialist: "Entity",
      field: "entity",
      canonical: "Een strategisch creatief bureau",
      message:
        "Je entiteit blijft nog te generiek en geeft te weinig richting aan de positionering. Ik heb hem compacter gemaakt zodat het type organisatie directer herkenbaar wordt.",
      expected: "Je entiteit blijft nog te generiek en geeft te weinig richting aan de positionering.",
    },
    {
      stepId: "targetgroup",
      activeSpecialist: "TargetGroup",
      field: "targetgroup",
      canonical: "Mensen die complexe keuzes moeten maken in hun werk of leven.",
      message:
        "Je doelgroep blijft nog te breed en maakt de relevante spanning onvoldoende concreet. Ik heb hem aangescherpt zodat duidelijker wordt voor wie Mindd echt betekenisvol is.",
      expected: "Je doelgroep blijft nog te breed en maakt de relevante spanning onvoldoende concreet.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const state = getDefaultState();
    (state as any).current_step = scenario.stepId;
    (state as any).active_specialist = scenario.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [scenario.stepId]: scenario.canonical };
    (state as any).provisional_source_by_step = { [scenario.stepId]: "user_input" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: scenario.stepId,
      state,
      specialist: {
        action: "ASK",
        message: scenario.message,
        question: "",
        refined_formulation: scenario.canonical,
        [scenario.field]: scenario.canonical,
        feedback_reason_text: scenario.expected,
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
    assert.equal(rendered.status, "valid_output");
    assert.match(
      String(uiContent.feedback_reason_text || ""),
      new RegExp(scenario.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );
    assert.doesNotMatch(
      String(uiContent.feedback_reason_text || ""),
      /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i
    );
    assert.equal(String(uiContent.canonical_text || ""), scenario.canonical);
  }
});

test("single-value pending canonical wording hides canonical block, feedback reason, and stale ui content across steps", () => {
  const scenarios = [
    {
      stepId: "dream",
      activeSpecialist: "Dream",
      value: "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.",
    },
    {
      stepId: "purpose",
      activeSpecialist: "Purpose",
      value: "Mindd bestaat om complexe keuzes begrijpelijk te maken zodat mensen met vertrouwen kunnen handelen.",
    },
    {
      stepId: "bigwhy",
      activeSpecialist: "BigWhy",
      value: "Omdat mensen rust voelen wanneer complexe beslissingen eindelijk helder worden.",
    },
    {
      stepId: "role",
      activeSpecialist: "Role",
      value: "Mindd is de gids die complexe informatie vertaalt naar heldere keuzes.",
    },
    {
      stepId: "entity",
      activeSpecialist: "Entity",
      value: "Een strategisch reclamebureau voor complexe keuzes.",
    },
    {
      stepId: "targetgroup",
      activeSpecialist: "TargetGroup",
      value: "Technische mkb-bedrijven met complexe producten en lange aankooptrajecten.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const state = getDefaultState();
    (state as any).current_step = scenario.stepId;
    (state as any).active_specialist = scenario.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [scenario.stepId]: scenario.value };
    (state as any).provisional_source_by_step = { [scenario.stepId]: "wording_pick" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: scenario.stepId,
      state,
      specialist: {
        action: "ASK",
        message:
          "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.",
        question: "Wat vind je van deze formulering?",
        refined_formulation: "",
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_presentation: "canonical",
        wording_choice_agent_current: scenario.value,
        feedback_reason_text:
          "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.",
        ui_content: {
          kind: "single_value",
          heading: "stale",
          canonical_text: scenario.value,
        },
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const message = String((rendered.specialist as any).message || "");
    assert.equal(rendered.status, "valid_output");
    assert.equal(String((rendered.specialist as any).ui_content || ""), "");
    assert.doesNotMatch(message, /toekomstbeeld waarin mensen zich zekerder/i);
    assert.doesNotMatch(message, new RegExp(scenario.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("single-value valid output preserves feedback reason after user picks own wording", () => {
  const state = getDefaultState();
  const canonical = "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.";
  const feedbackReason =
    "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.";
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { dream: canonical };
  (state as any).provisional_source_by_step = { dream: "wording_pick" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: canonical,
      question: "",
      refined_formulation: canonical,
      dream: canonical,
      wording_choice_selected: "user",
      feedback_reason_text: feedbackReason,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /(helemaal prima|completely okay)/i);
  assert.match(message, /toekomstbeeld waarin mensen zich zekerder/i);
  assert.match(message, /the current dream of mindd is|je huidige droom voor mindd is/i);
  assert.equal(
    String(uiContent.support_text || ""),
    "Your own wording is completely okay."
  );
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    /toekomstbeeld waarin mensen zich zekerder/i
  );
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});

test("single-value valid output strips autosuggest framing after user picks own wording", () => {
  const state = getDefaultState();
  const canonical =
    "Mindd bestaat om bij te dragen aan een wereld waarin communicatie en verhalen authentiek, eerlijk en origineel zijn.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "wording_pick" };
  (state as any).ui_strings = {
    "autosuggest.prefix.template": "Op basis van je input stel ik de volgende {0} voor:",
    "ppt.heading.purpose": "Bestaansreden",
    "wording.feedback.user_pick.ack.default": "Je eigen formulering is helemaal prima.",
    "wording.feedback.user_pick.nudge.template":
      "Tegelijk helpt het om in gedachten te houden wat een sterke {0} meestal krachtiger maakt.",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: [
        "Op basis van je input stel ik de volgende bestaansreden voor:",
        "",
        "JE HUIDIGE BESTAANSREDEN VOOR MINDD IS",
        canonical,
      ].join("\n"),
      question: "",
      refined_formulation: canonical,
      purpose: canonical,
      wording_choice_selected: "user",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  const supportText = String(uiContent.support_text || "");
  assert.equal(rendered.status, "valid_output");
  assert.doesNotMatch(supportText, /op basis van je input stel ik de volgende bestaansreden voor/i);
  assert.match(supportText, /je eigen formulering is helemaal prima/i);
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});

test("single-value valid output falls back to user-pick feedback when the explicit reason is generic", () => {
  const state = getDefaultState();
  const canonical =
    "Mindd bestaat om bij te dragen aan een wereld waarin communicatie en verhalen authentiek, eerlijk en origineel zijn.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "wording_pick" };
  (state as any).ui_strings = {
    "wording.feedback.user_pick.ack.default": "Je eigen formulering is helemaal prima.",
    "wording.feedback.user_pick.nudge.template":
      "Tegelijk helpt het om in gedachten te houden wat een sterke {0} meestal krachtiger maakt.",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: canonical,
      question: "",
      refined_formulation: canonical,
      purpose: canonical,
      wording_choice_selected: "user",
      feedback_reason_text: "Ik denk dat ik begrijp wat je bedoelt.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(String(uiContent.support_text || ""), "Je eigen formulering is helemaal prima.");
  assert.doesNotMatch(
    String(uiContent.feedback_reason_text || ""),
    /ik denk dat ik begrijp wat je bedoelt/i
  );
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    /keep in mind what makes this step strong|this keeps your original meaning while staying aligned with this step|dit behoudt je oorspronkelijke betekenis/i
  );
});

test("dream single-value content strips duplicated leading feedback sentence from support text", () => {
  const state = getDefaultState();
  const canonical = "Mindd droomt van een wereld waarin mensen met plezier en vertrouwen hun aankopen doen.";
  const feedbackReason =
    "De huidige droom klinkt nog wat vlak en mist een sprankje inspiratie.";
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { dream: canonical };
  (state as any).provisional_source_by_step = { dream: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: [
        feedbackReason,
        `${feedbackReason} Ik heb het beeld versterkt door te benadrukken dat mensen niet alleen zeker en vertrouwd willen kopen, maar vooral willen genieten van het plezier en de voldoening van hun keuzes.`,
        "JE HUIDIGE DROOM VOOR MINDD IS",
        canonical,
      ].join("\n\n"),
      question: "",
      refined_formulation: canonical,
      dream: canonical,
      feedback_reason_text: feedbackReason,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.doesNotMatch(
    String(uiContent.feedback_reason_text || ""),
    /(ik denk dat ik begrijp wat je bedoelt|i think i understand what you mean)/i
  );
  assert.match(
    String(uiContent.feedback_reason_text || ""),
    new RegExp(feedbackReason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  );
  assert.equal(
    String(uiContent.support_text || ""),
    "Ik heb het beeld versterkt door te benadrukken dat mensen niet alleen zeker en vertrouwd willen kopen, maar vooral willen genieten van het plezier en de voldoening van hun keuzes."
  );
});

test("pending canonical single-value message strips duplicated leading feedback sentence across steps", () => {
  const cases = [
    {
      stepId: "purpose",
      activeSpecialist: "Purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      feedbackReason: "De huidige bestaansreden klinkt nog te algemeen.",
      explanation:
        "Ik heb hem aangescherpt zodat duidelijker wordt welke betekenis Mindd voor mensen wil hebben.",
    },
    {
      stepId: "role",
      activeSpecialist: "Role",
      canonical: "Mindd verbindt complexe informatie met menselijke besluitkracht.",
      feedbackReason: "De huidige rol klinkt nog te abstract.",
      explanation:
        "Ik heb hem concreter gemaakt zodat direct voelbaar wordt wat Mindd voor mensen doet.",
    },
    {
      stepId: "entity",
      activeSpecialist: "Entity",
      canonical: "Mindd is een digitale innovatiepartner voor mkb-bedrijven.",
      feedbackReason: "De huidige omschrijving klinkt nog te breed.",
      explanation:
        "Ik heb hem specifieker gemaakt zodat het type organisatie meteen duidelijker wordt.",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [current.stepId]: current.canonical };
    (state as any).provisional_source_by_step = { [current.stepId]: "wording_pick" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        message: [current.feedbackReason, `${current.feedbackReason} ${current.explanation}`].join("\n\n"),
        question: "Wat vind je van deze formulering?",
        refined_formulation: "",
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_presentation: "canonical",
        wording_choice_agent_current: current.canonical,
        feedback_reason_text: current.feedbackReason,
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const message = String((rendered.specialist as any).message || "");
    assert.equal(
      (message.match(new RegExp(current.feedbackReason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
      0
    );
    assert.match(
      message,
      new RegExp(current.explanation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );
    assert.doesNotMatch(
      message,
      new RegExp(current.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );
  }
});

test("dream builder_refine keeps confirm action for user-driven current-value refinements", () => {
  const state = getDefaultState();
  const canonical = "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes durven maken.";
  (state as any).current_step = "dream";
  (state as any).active_specialist = "DreamExplainer";
  (state as any).business_name = "Mindd";
  (state as any).__dream_runtime_mode = "builder_refine";
  (state as any).provisional_by_step = { dream: canonical };
  (state as any).provisional_source_by_step = { dream: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Ik heb de Droom inspirerender gemaakt.",
      question: "Wat vind je van deze versie?",
      refined_formulation: canonical,
      dream: canonical,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(rendered.contractId, "dream:valid_output:DREAM_EXPLAINER_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.includes("ACTION_DREAM_EXPLAINER_REFINE_CONFIRM"), true);
});

test("dream valid output keeps confirm available when staged canonical Dream still carries refine feedback", () => {
  const state = getDefaultState();
  const canonical =
    "de Hand droomt van een wereld waarin mensen zich zelfverzekerd en uniek kunnen uitdrukken door stijlvolle accessoires die hun persoonlijkheid versterken.";
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "de Hand";
  (state as any).provisional_by_step = { dream: canonical };
  (state as any).provisional_source_by_step = { dream: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Je droom is nu nog te algemeen en gebruikt een absolute zoals 'iedereen'.",
      question: "",
      refined_formulation: canonical,
      dream: canonical,
      __dream_policy_requires_repair: "true",
      __dream_policy_can_stage: "true",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(rendered.contractId, "dream:valid_output:DREAM_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"), true);
});

test("dream render ignores malformed accepted builder summaries as current dream", () => {
  const state = getDefaultState();
  const malformedSummary = [
    "Over 5 tot 10 jaar zullen meer mensen verlangen naar werk dat een positieve invloed heeft op het leven van anderen.",
    "Steeds meer mensen zullen streven naar het bouwen van iets dat hun eigen leven overstijgt en blijvende waarde heeft voor de samenleving.",
    "Vrijheid in tijd en keuzes zal voor mensen wereldwijd een steeds belangrijker thema worden.",
    "Mensen zullen in de toekomst meer waarde hechten aan trots kunnen zijn op hun werk en hun bijdrage aan de samenleving.",
  ].join(" ");

  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { dream: malformedSummary };
  (state as any).provisional_source_by_step = { dream: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: [
        "De droom is het toekomstbeeld dat richting geeft aan alles wat je met je bedrijf wilt bereiken.",
        "Een inspirerende droom helpt om keuzes te maken, motiveert jou en anderen, en zorgt dat je bedrijf meer is dan alleen producten of diensten verkopen.",
      ].join("\n\n"),
      question: "Schrijf een eerste versie van je droom.",
      refined_formulation: "",
      dream: "",
      suggest_dreambuilder: "false",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.confirmEligible, false);
  assert.doesNotMatch(message, /je huidige droom voor mindd is/i);
  assert.doesNotMatch(
    message,
    /over 5 tot 10 jaar zullen meer mensen verlangen naar werk dat een positieve invloed heeft/i
  );
});

test("single-value confirm steps keep confirm actions for user-driven current-value refinements", () => {
  const cases = [
    {
      stepId: "purpose",
      field: "purpose",
      activeSpecialist: "Purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      confirmAction: "ACTION_PURPOSE_REFINE_CONFIRM",
      contractId: "purpose:valid_output:PURPOSE_MENU_REFINE",
    },
    {
      stepId: "bigwhy",
      field: "bigwhy",
      activeSpecialist: "BigWhy",
      canonical: "Mensen verdienen rust en helderheid wanneer ingewikkelde keuzes op hun pad komen.",
      confirmAction: "ACTION_BIGWHY_REFINE_CONFIRM",
      contractId: "bigwhy:valid_output:BIGWHY_MENU_REFINE",
    },
    {
      stepId: "role",
      field: "role",
      activeSpecialist: "Role",
      canonical: "Mindd vertaalt complexe informatie naar richtinggevende keuzes.",
      confirmAction: "ACTION_ROLE_REFINE_CONFIRM",
      contractId: "role:valid_output:ROLE_MENU_REFINE",
    },
    {
      stepId: "entity",
      field: "entity",
      activeSpecialist: "Entity",
      canonical: "Mindd is een strategische partner voor complexe groeivraagstukken.",
      confirmAction: "ACTION_ENTITY_EXAMPLE_CONFIRM",
      contractId: "entity:valid_output:ENTITY_MENU_EXAMPLE",
    },
    {
      stepId: "targetgroup",
      field: "targetgroup",
      activeSpecialist: "TargetGroup",
      canonical: "Technische mkb-bedrijven met complexe proposities en lange aankooptrajecten.",
      confirmAction: "ACTION_TARGETGROUP_POSTREFINE_CONFIRM",
      contractId: "targetgroup:valid_output:TARGETGROUP_MENU_POSTREFINE",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [current.stepId]: current.canonical };
    (state as any).provisional_source_by_step = { [current.stepId]: "user_input" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        message: "Ik heb dit scherper geformuleerd.",
        question: "",
        refined_formulation: current.canonical,
        [current.field]: current.canonical,
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    assert.equal(rendered.status, "valid_output");
    assert.equal(rendered.confirmEligible, true);
    assert.equal(rendered.contractId, current.contractId);
    assert.equal(rendered.uiActionCodes.includes(current.confirmAction), true);
  }
});

test("single-value current-value refinement uses its own state without wording-choice pending", () => {
  const state = getDefaultState();
  const canonical = "Mindd bestaat om complexe keuzes begrijpelijk en menselijk te maken.";
  (state as any).current_step = "purpose";
  (state as any).active_specialist = "Purpose";
  (state as any).business_name = "Mindd";
  (state as any).purpose_final = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  (state as any).provisional_by_step = { purpose: canonical };
  (state as any).provisional_source_by_step = { purpose: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: [
        "Ik heb je formulering compacter gemaakt.",
        "",
        "Ik heb de toon van de droom lichter gemaakt, zodat het toegankelijker en minder zwaar aanvoelt.",
        "",
        "Op basis van je input stel ik de volgende bestaansreden voor",
      ].join("\n"),
      question: "",
      refined_formulation: canonical,
      purpose: canonical,
      feedback_reason_text: "Ik heb je formulering compacter gemaakt.",
      current_value_refinement_pending: "true",
      current_value_refinement_target_field: "purpose",
      current_value_refinement_feedback_text: "Ik heb je formulering compacter gemaakt.",
      current_value_refinement_anchor_value: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.uiActionCodes.includes("ACTION_PURPOSE_REFINE_CONFIRM"), true);
  assert.equal(String((rendered.specialist as any).ui_content || ""), "");
  assert.equal(
    String((rendered.specialist as any).ui_feedback_contract?.suggested_value || ""),
    canonical
  );
  assert.match(
    String((rendered.specialist as any).ui_feedback_contract?.support_text || ""),
    /Ik heb de toon van de droom lichter gemaakt/i
  );
  assert.match(
    String((rendered.specialist as any).ui_feedback_contract?.heading || ""),
    /Based on your input|Op basis van je input/i
  );
  assert.doesNotMatch(
    String((rendered.specialist as any).message || ""),
    /Purpose of Mindd is|jouw huidige bestaansreden/i
  );
  assert.doesNotMatch(
    String((rendered.specialist as any).message || ""),
    /Ik heb de toon van de droom lichter gemaakt/i
  );
  assert.equal(String((rendered.specialist as any).wording_choice_pending || ""), "");
});

test("single-value autosuggest contracts use the specialist suggestion instead of the provisional raw input across the family", () => {
  const cases = [
    {
      stepId: "purpose",
      field: "purpose",
      activeSpecialist: "Purpose",
      contractId: "purpose:valid_output:PURPOSE_MENU_REFINE",
      rawInput: "dit gaat over iets als zorgzaamheid",
      suggestion: "Mindd bestaat om mensen rust en zorgzaamheid te bieden bij lastige keuzes.",
    },
    {
      stepId: "bigwhy",
      field: "bigwhy",
      activeSpecialist: "BigWhy",
      contractId: "bigwhy:valid_output:BIGWHY_MENU_REFINE",
      rawInput: "dit gaat over iets als zorgzaamheid",
      suggestion: "Mensen verdienen rust en zorgzaamheid wanneer ingewikkelde keuzes hun leven raken.",
    },
    {
      stepId: "role",
      field: "role",
      activeSpecialist: "Role",
      contractId: "role:valid_output:ROLE_MENU_REFINE",
      rawInput: "dit gaat over iets als zorgzaamheid",
      suggestion: "Mindd vertaalt zorgzaamheid naar heldere keuzes voor mensen en teams.",
    },
    {
      stepId: "entity",
      field: "entity",
      activeSpecialist: "Entity",
      contractId: "entity:valid_output:ENTITY_MENU_EXAMPLE",
      rawInput: "dit gaat over iets als zorgzaamheid",
      suggestion: "een strategisch bureau voor zorgzame keuzes",
    },
    {
      stepId: "targetgroup",
      field: "targetgroup",
      activeSpecialist: "TargetGroup",
      contractId: "targetgroup:valid_output:TARGETGROUP_MENU_POSTREFINE",
      rawInput: "dit gaat over iets als zorgzaamheid",
      suggestion: "Mensen en teams die behoefte hebben aan rust en richting bij belangrijke keuzes.",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any).provisional_by_step = { [current.stepId]: current.rawInput };
    (state as any).provisional_source_by_step = { [current.stepId]: "user_input" };

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        message: "",
        question: "",
        refined_formulation: current.suggestion,
        [current.field]: current.suggestion,
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    assert.equal(rendered.contractId, current.contractId);
    assert.equal(String((rendered.specialist as any).ui_content || ""), "");
    assert.equal(
      String((rendered.specialist as any).ui_feedback_contract?.suggested_value || ""),
      current.suggestion
    );
    assert.notEqual(
      String((rendered.specialist as any).ui_feedback_contract?.suggested_value || ""),
      current.rawInput
    );
  }
});

test("single-value current-value refinement drops generic editorial feedback boilerplate", () => {
  const state = getDefaultState();
  const canonical = "een toonaangevend positioneringsbureau voor merkverbinding";
  (state as any).current_step = "entity";
  (state as any).active_specialist = "Entity";
  (state as any).business_name = "Mindd";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "REFINE",
      message:
        "Je huidige formulering is duidelijk, maar kan krachtiger door een extra scherpte of uniek element toe te voegen dat Mindd direct onderscheidt.",
      question: "",
      refined_formulation: canonical,
      entity: canonical,
      feedback_reason_text:
        "De huidige entiteit is helder, maar mist nog een onderscheidend of krachtig element dat Mindd uniek en direct herkenbaar maakt.",
      current_value_refinement_pending: "true",
      current_value_refinement_target_field: "entity",
      current_value_refinement_feedback_text:
        "De huidige entiteit is helder, maar mist nog een onderscheidend of krachtig element dat Mindd uniek en direct herkenbaar maakt.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const feedbackContract = (rendered.specialist as any).ui_feedback_contract as Record<string, unknown>;
  assert.equal(String(feedbackContract.kind || ""), "single_value_canonical_suggestion");
  assert.equal(String(feedbackContract.suggested_value || ""), canonical);
  assert.equal(String(feedbackContract.support_text || ""), "");
  assert.equal(String(feedbackContract.rationale || ""), "");
  assert.equal(String((rendered.specialist as any).message || ""), "");
});

test("presentation accepted provisional remains valid output without synthetic confirm action", () => {
  const state = getDefaultState();
  const canonical = [
    "This is what you said:",
    "",
    "Dream: Mindd helpt complexe keuzes vertalen naar heldere keuzes.",
    "",
    "Strategy:",
    "• Focus op trusted advisory",
    "• Win op helderheid",
  ].join("\n");
  (state as any).current_step = "presentation";
  (state as any).active_specialist = "Presentation";
  (state as any).business_name = "Mindd";
  (state as any).provisional_by_step = { presentation: canonical };
  (state as any).provisional_source_by_step = { presentation: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "presentation",
    state,
    specialist: {
      action: "ASK",
      message: "Dit is een sterkere briefing voor je presentatie.",
      question: "",
      refined_formulation: canonical,
      presentation_brief: canonical,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(rendered.contractId, "presentation:valid_output:PRESENTATION_MENU_ASK");
  assert.equal(rendered.uiActionCodes.includes("ACTION_PRESENTATION_MAKE"), true);
});

test("presentation valid output switches CTA menu after assets already exist", () => {
  const state = getDefaultState();
  const canonical = [
    "This is what you said:",
    "",
    "Dream:",
    "Mindd helpt complexe keuzes vertalen naar heldere keuzes.",
    "",
    "Products and Services:",
    "• Strategy",
    "• Delivery",
  ].join("\n");
  (state as any).current_step = "presentation";
  (state as any).active_specialist = "Presentation";
  (state as any).business_name = "Mindd";
  (state as any).presentation_asset_pdf_url = "https://cdn.example.com/mindd.pdf";
  (state as any).presentation_asset_png_url = "https://cdn.example.com/mindd.png";
  (state as any).provisional_by_step = { presentation: canonical };
  (state as any).provisional_source_by_step = { presentation: "user_input" };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "presentation",
    state,
    specialist: {
      action: "ASK",
      message: "I reordered the presentation summary.",
      question: "",
      refined_formulation: canonical,
      presentation_brief: canonical,
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  assert.equal(rendered.contractId, "presentation:valid_output:PRESENTATION_MENU_RECREATE");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_PRESENTATION_MAKE"]);
  assert.equal(rendered.uiActions[0]?.label, "Recreate my presentation");
});

test("recap render suppresses duplicate single-value cards across accepted-output steps", () => {
  const cases = [
    {
      stepId: "dream",
      activeSpecialist: "Dream",
      finalField: "dream_final",
      specialistField: "dream",
      canonical: "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.",
    },
    {
      stepId: "purpose",
      activeSpecialist: "Purpose",
      finalField: "purpose_final",
      specialistField: "purpose",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    },
    {
      stepId: "bigwhy",
      activeSpecialist: "BigWhy",
      finalField: "bigwhy_final",
      specialistField: "bigwhy",
      canonical: "Mensen verdienen rust en helderheid wanneer ingewikkelde keuzes op hun pad komen.",
    },
    {
      stepId: "role",
      activeSpecialist: "Role",
      finalField: "role_final",
      specialistField: "role",
      canonical: "Mindd is de gids die complexe informatie omzet in richting.",
    },
    {
      stepId: "entity",
      activeSpecialist: "Entity",
      finalField: "entity_final",
      specialistField: "entity",
      canonical: "Mindd is een strategische partner voor complexe groeivraagstukken.",
    },
    {
      stepId: "targetgroup",
      activeSpecialist: "TargetGroup",
      finalField: "targetgroup_final",
      specialistField: "targetgroup",
      canonical: "Technische mkb-bedrijven met complexe proposities en lange aankooptrajecten.",
    },
  ] as const;

  for (const current of cases) {
    const state = getDefaultState();
    (state as any).current_step = current.stepId;
    (state as any).active_specialist = current.activeSpecialist;
    (state as any).business_name = "Mindd";
    (state as any)[current.finalField] = current.canonical;

    const rendered = renderFreeTextTurnPolicy({
      stepId: current.stepId,
      state,
      specialist: {
        action: "ASK",
        wants_recap: true,
        message: "Hier is je recap.",
        question: "",
        refined_formulation: current.canonical,
        [current.specialistField]: current.canonical,
        is_offtopic: false,
      },
      previousSpecialist: {},
    });

    const message = String((rendered.specialist as any).message || "");
    assert.equal(message.split(current.canonical).length - 1, 1);
    assert.equal(String((rendered.specialist as any).__suppress_refined_append || ""), "true");
    assert.equal("ui_content" in ((rendered.specialist as any) || {}), false);
  }
});
