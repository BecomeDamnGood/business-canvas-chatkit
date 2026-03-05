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
  assert.match(message, /<strong>.*strategy.*:<\/strong>/i);
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
  assert.match(message, /<strong>.*products.*services.*:<\/strong>/i);
  assert.match(message, /•\s*AI-compatibele websites en apps/i);
  assert.match(message, /•\s*AI-tools en -ondersteuning/i);
  assert.match(message, /<strong>.*rules.*game.*:<\/strong>/i);
  assert.match(message, /•\s*Werk met duidelijke scope-afspraken/i);
  assert.match(message, /•\s*Lever iteratief en transparant op/i);
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

test("entity valid output always renders canonical statement with current-context heading", () => {
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
  assert.equal(rendered.status, "valid_output");
  assert.match(message, /<strong>.*current.*entity.*mindd.*is:.*<\/strong>/i);
  assert.match(message, /Mindd is een digitale innovatiepartner voor mkb-bedrijven\./i);
  assert.equal(message.split(canonical).length - 1, 1);
});

test("targetgroup valid output appends canonical current-context block when missing in feedback", () => {
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
  assert.match(message, /<strong>.*current.*target group.*mindd.*is:.*<\/strong>/i);
  assert.match(message, /Innovatieve mkb-bedrijven met complexe digitaliseringsvraagstukken\./i);
});
