import test from "node:test";
import assert from "node:assert/strict";

import { RECAP_INSTRUCTION, createRunStepRuntimeStateHelpers } from "./run_step_runtime_state_helpers.js";
import { canonicalizeComparableText, parseListItems } from "./run_step_compare_heuristics.js";
import { createCompareRuntimeState } from "./compare_runtime.js";

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

test("RECAP_INSTRUCTION marks presentation as a persistent recap context", () => {
  assert.match(RECAP_INSTRUCTION, /CURRENT_STEP_ID=presentation/);
  assert.match(RECAP_INSTRUCTION, /do NOT restate the full recap in message/i);
});

test("compareSelectionMessage normalizes explicit strategy selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = [
    "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten",
    "Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant",
    "Overpresteren in projecten die via het bestaande netwerk binnenkomen",
    "Prioriteit geven aan klanten met substantiële investeringsbereidheid",
    "Gratis demo's en mock-ups uitsluitend inzetten als strategisch middel om langdurige samenwerkingen te initiëren",
  ].join(" ");

  const output = helpers.compareSelectionMessage(
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
      provisional_source_by_step: { entity: "compare_pick" },
      last_specialist_result: {
        compare_runtime: createCompareRuntimeState({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          target_field: "entity",
          suggestion_text: "Mindd is een digitale innovatiepartner voor mkb-bedrijven.",
        }),
      },
    } as any,
    "entity"
  ) as any;

  assert.equal(
    String((next.provisional_by_step || {}).entity || ""),
    "Mindd is een digitale innovatiepartner voor mkb-bedrijven."
  );
  assert.equal(String((next.provisional_source_by_step || {}).entity || ""), "compare_pick");
  assert.equal(String((next.last_specialist_result || {}).compare_runtime || ""), "");
});

test("compareSelectionMessage normalizes explicit products/services selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = "AI-compatible websites en apps AI-tools en ondersteuning Branding Strategie";

  const output = helpers.compareSelectionMessage(
    "productsservices",
    { business_name: "Mindd" } as any,
    "ProductsAndServices",
    runOn
  );

  assert.match(output, /Dit is wat je volgens jouw input aan Mindd klanten biedt:/);
  assert.equal((output.match(/^• /gm) || []).length, 4);
});

test("compareSelectionMessage keeps a products/services item with internal commas intact", () => {
  const helpers = buildHelpers();
  const output = helpers.compareSelectionMessage(
    "productsservices",
    { business_name: "Mindd" } as any,
    "ProductsAndServices",
    "Traditionele communicatiediensten (zoals DTP, posters, campagnes)"
  );

  assert.equal((output.match(/^• /gm) || []).length, 1);
  assert.match(output, /• Traditionele communicatiediensten \(zoals DTP, posters, campagnes\)/);
});

test("compareSelectionMessage normalizes explicit rules selection to bullets", () => {
  const helpers = buildHelpers();
  const runOn = "We leveren op afspraken We communiceren direct We kiezen kwaliteit boven snelheid";

  const output = helpers.compareSelectionMessage(
    "rulesofthegame",
    { business_name: "Mindd" } as any,
    "RulesOfTheGame",
    runOn
  );

  assert.match(output, /DE SPELREGELS VAN Mindd:/);
  assert.equal((output.match(/^• /gm) || []).length, 3);
});

test("compareSelectionMessage uses localized plural rules heading outside Dutch", () => {
  const helpers = buildHelpers();
  const output = helpers.compareSelectionMessage(
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
      compare_runtime: createCompareRuntimeState({
        kind: "text_compare",
        mode: "text",
        status: "pending",
        pending_text_intent: "feedback_on_suggestion",
        pending_text_anchor: "suggestion",
        pending_text_seed_source: "previous_suggestion",
        pending_text_feedback_text: "Dit klinkt nog te algemeen.",
        pending_text_presentation_mode: "canonical",
      }),
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
  assert.deepEqual(parsed.compare_runtime, createCompareRuntimeState({
    kind: "text_compare",
    mode: "text",
    status: "pending",
    pending_text_intent: "feedback_on_suggestion",
    pending_text_anchor: "suggestion",
    pending_text_seed_source: "previous_suggestion",
    pending_text_feedback_text: "Dit klinkt nog te algemeen.",
    pending_text_presentation_mode: "canonical",
  }));
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "debug_payload"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "ui_contract"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "scratchpad"), false);
  assert.match(block, /PENDING COMPARE FEEDBACK CONTRACT/i);
  assert.match(block, /rewrite the previous suggestion itself/i);
});

test("buildSpecialistContextBlock exposes current-turn stuck support classification for core steps", () => {
  const helpers = buildHelpers();
  const block = helpers.buildSpecialistContextBlock({
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    __current_turn_step_support_state: "stuck",
    __step_stuck_count_by_step: { rulesofthegame: 1 },
    __step_support_mode_by_step: { rulesofthegame: "normal" },
    last_specialist_result: {},
  } as any);

  assert.match(block, /current_turn_step_support_state: stuck/);
  assert.match(block, /current_step_stuck_count: 1/);
  assert.match(block, /current_step_support_mode: normal/);
});
