import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRuntimeStateHelpers } from "./run_step_runtime_state_helpers.js";
import { canonicalizeComparableText, parseListItems } from "./run_step_wording_heuristics.js";

function buildHelpers() {
  const defaults: Record<string, string> = {
    "offtopic.current.template": "JE HUIDIGE {0} VOOR {1} IS",
    "offtopic.step.strategy": "STRATEGIE",
    "offtopic.step.rulesofthegame": "SPELREGELS",
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

  assert.match(output, /JE HUIDIGE SPELREGELS VOOR Mindd IS:/);
  assert.equal((output.match(/^• /gm) || []).length, 3);
});
