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

test("rulesofthegame does not expose confirm when fewer than 3 rules are accepted", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  (state as any).active_specialist = "RulesOfTheGame";
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

  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.contractId, "rulesofthegame:incomplete_output:RULES_MENU_ASK_EXPLAIN");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), false);
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

test("rulesofthegame keeps external rules out of valid_output confirm state", () => {
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

  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.uiActionCodes.includes("ACTION_RULES_CONFIRM_ALL"), false);
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

test("entity valid output uses suggestion heading SSOT and suppresses duplicate current-context framing", () => {
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
  assert.match(message, /^what do you think of the wording$/im);
  assert.doesNotMatch(message, /current.*entity.*mindd.*is:/i);
  assert.match(message, /Mindd is een digitale innovatiepartner voor mkb-bedrijven\./i);
  assert.equal(message.split(canonical).length - 1, 1);
  assert.equal(String((rendered.specialist as any).__suppress_refined_append || ""), "true");
  assert.equal(String(uiContent.kind || ""), "single_value");
  assert.equal(String(uiContent.heading || ""), "What do you think of the wording");
  assert.equal(String(uiContent.canonical_text || ""), canonical);
  assert.equal(String(uiContent.support_text || ""), "");
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
  assert.equal(String(uiContent.feedback_reason_text || ""), "Ik heb AI niet als kern opgenomen omdat je Droom effect-gericht blijft.");
  assert.equal(String(uiContent.canonical_text || ""), canonical);
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

test("single-value valid output suppresses stale feedback reason after user picks own wording", () => {
  const state = getDefaultState();
  const canonical = "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.";
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
      feedback_reason_text:
        "Ik heb het herschreven naar een toekomstbeeld waarin mensen zich zekerder en gerust voelen bij hun keuzes.",
      is_offtopic: false,
    },
    previousSpecialist: {},
  });

  const message = String((rendered.specialist as any).message || "");
  const uiContent = (rendered.specialist as any).ui_content as Record<string, unknown>;
  assert.equal(rendered.status, "valid_output");
  assert.doesNotMatch(message, /toekomstbeeld waarin mensen zich zekerder/i);
  assert.equal(String(uiContent.feedback_reason_text || ""), "");
  assert.equal(String(uiContent.canonical_text || ""), canonical);
});
