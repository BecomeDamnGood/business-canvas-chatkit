import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRuntimeStateHelpers } from "./run_step_runtime_state_helpers.js";
import { canonicalizeComparableText, parseListItems } from "./run_step_wording_heuristics.js";

function buildHelpers() {
  const defaults: Record<string, string> = {
    "offtopic.current.template": "JE HUIDIGE {0} VOOR {1} IS",
    "offtopic.step.strategy": "STRATEGIE",
    "offtopic.step.rulesofthegame": "SPELREGELS",
    "sectionTitle.rulesofthegameOf": "DE SPELREGELS VAN {0}",
    "productsservices.current.heading.plural_mixed": "Dit is wat je volgens jouw input aan {0} klanten biedt",
    "productsservices.classifier.product.tokens": "website|websites|app|apps|tool|tools",
    "productsservices.classifier.service.tokens": "ondersteuning|strategie|branding|advies",
  };
  return createRunStepRuntimeStateHelpers({
    step0Id: "step0",
    dreamStepId: "dream",
    purposeStepId: "purpose",
    bigwhyStepId: "bigwhy",
    roleStepId: "role",
    entityStepId: "entity",
    strategyStepId: "strategy",
    targetgroupStepId: "targetgroup",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    presentationStepId: "presentation",
    dreamExplainerSpecialist: "DreamExplainer",
    parseStep0Final: () => null,
    parseListItems,
    canonicalizeComparableText,
    getFinalsSnapshot: () => ({}),
    uiDefaultString: (key: string, fallback?: string) => String(defaults[key] || fallback || ""),
  });
}

test("wordingSelectionMessage normalizes explicit strategy selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = [
    "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten",
    "Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant",
    "Overpresteren in projecten die via het bestaande netwerk binnenkomen",
    "Prioriteit geven aan klanten met substantiële investeringsbereidheid",
    "Gratis demo's en mock-ups uitsluitend inzetten als strategisch middel om langdurige samenwerkingen te initiëren",
  ].join(" ");

  const output = helpers.wordingSelectionMessage(
    "strategy",
    { business_name: "Mindd" } as any,
    "Strategy",
    runOn
  );

  assert.match(output, /JE HUIDIGE STRATEGIE VOOR Mindd IS:/);
  assert.equal((output.match(/^• /gm) || []).length, 5);
});

test("clearStepInteractiveState clears wording metadata but keeps provisional step content", () => {
  const helpers = buildHelpers();
  const next = helpers.clearStepInteractiveState(
    {
      current_step: "entity",
      provisional_by_step: { entity: "Mindd is een digitale innovatiepartner voor mkb-bedrijven." },
      provisional_source_by_step: { entity: "wording_pick" },
      last_specialist_result: {
        wording_choice_pending: "true",
        wording_choice_target_field: "entity",
        wording_choice_agent_current: "Mindd is een digitale innovatiepartner voor mkb-bedrijven.",
      },
    } as any,
    "entity"
  ) as any;

  assert.equal(
    String((next.provisional_by_step || {}).entity || ""),
    "Mindd is een digitale innovatiepartner voor mkb-bedrijven."
  );
  assert.equal(String((next.provisional_source_by_step || {}).entity || ""), "wording_pick");
  assert.equal(String((next.last_specialist_result || {}).wording_choice_pending || ""), "false");
  assert.equal(String((next.last_specialist_result || {}).wording_choice_agent_current || ""), "");
});

test("wordingSelectionMessage normalizes explicit products/services selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = "AI-compatible websites en apps AI-tools en ondersteuning Branding Strategie";

  const output = helpers.wordingSelectionMessage(
    "productsservices",
    { business_name: "Mindd" } as any,
    "ProductsAndServices",
    runOn
  );

  assert.match(output, /Dit is wat je volgens jouw input aan Mindd klanten biedt:/);
  assert.equal((output.match(/^• /gm) || []).length, 4);
});

test("wordingSelectionMessage normalizes explicit rules selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = "We leveren op afspraken We communiceren direct We kiezen kwaliteit boven snelheid";

  const output = helpers.wordingSelectionMessage(
    "rulesofthegame",
    { business_name: "Mindd" } as any,
    "RulesOfTheGame",
    runOn
  );

  assert.match(output, /DE SPELREGELS VAN Mindd:/);
  assert.equal((output.match(/^• /gm) || []).length, 3);
});

test("wordingSelectionMessage uses localized plural rules heading outside Dutch", () => {
  const helpers = buildHelpers();
  const output = helpers.wordingSelectionMessage(
    "rulesofthegame",
    {
      business_name: "Mindd",
      ui_strings_lang: "es",
      ui_strings: {
        "sectionTitle.rulesofthegameOf": "Las Reglas del juego de {0}",
      },
    } as any,
    "RulesOfTheGame",
    "Cumplimos acuerdos; Comunicamos riesgos a tiempo; Trabajamos con alcance claro"
  );

  assert.match(output, /Las Reglas del juego de Mindd:/);
  assert.equal((output.match(/^• /gm) || []).length, 3);
});

test("buildSpecialistContextBlock skips invalid framed provisional values", () => {
  const helpers = buildHelpers();
  const block = helpers.buildSpecialistContextBlock({
    current_step: "role",
    provisional_by_step: {
      role: "Hier zijn drie korte voorbeelden van een Rol voor Mindd:.",
    },
    last_specialist_result: {},
  } as any);

  assert.doesNotMatch(block, /role_final:/i);
  assert.match(block, /\(none yet\)/i);
});

test("buildSpecialistContextBlock skips invalid framed provisional values for purpose", () => {
  const helpers = buildHelpers();
  const block = helpers.buildSpecialistContextBlock({
    current_step: "purpose",
    provisional_by_step: {
      purpose: "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.",
    },
    last_specialist_result: {},
  } as any);

  assert.doesNotMatch(block, /purpose_final:/i);
  assert.match(block, /\(none yet\)/i);
});

test("buildSpecialistContextBlock whitelists last_specialist_result payload", () => {
  const helpers = buildHelpers();
  const block = helpers.buildSpecialistContextBlock({
    current_step: "targetgroup",
    last_specialist_result: {
      action: "REFINE",
      message: "Mogelijke segmenten",
      question: "Klopt dit?",
      refined_formulation: "B2B software scale-ups",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
      statements: ["Segment 1", "Segment 2"],
      targetgroup: "B2B software scale-ups",
      pending_suggestion_intent: "feedback_on_suggestion",
      pending_suggestion_anchor: "suggestion",
      pending_suggestion_seed_source: "previous_suggestion",
      pending_suggestion_feedback_text: "Dit klinkt nog te algemeen.",
      pending_suggestion_presentation_mode: "canonical",
      debug_payload: { giant: "blob" },
      ui_contract: "should_not_leak",
      scratchpad: "remove me",
    },
  } as any);

  const match = block.match(/last_specialist_result_json:\s*(\{[\s\S]*\})$/m);
  assert.ok(match, "context block must include JSON snapshot");
  const parsed = JSON.parse(String(match?.[1] || "{}")) as Record<string, unknown>;
  assert.equal(parsed.action, "REFINE");
  assert.equal(parsed.targetgroup, "B2B software scale-ups");
  assert.deepEqual(parsed.statements, ["Segment 1", "Segment 2"]);
  assert.equal(parsed.pending_suggestion_intent, "feedback_on_suggestion");
  assert.equal(parsed.pending_suggestion_anchor, "suggestion");
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "debug_payload"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "ui_contract"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "scratchpad"), false);
  assert.match(block, /PENDING SUGGESTION CONTRACT/i);
  assert.match(block, /rewrite the previous suggestion itself/i);
});
