import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepStateUpdateHelpers } from "./run_step_state_update.js";
import { parseListItems } from "./run_step_wording_heuristics.js";

function buildHelpers() {
  const withProvisionalValue = (state: any, stepId: string, value: string) => {
    const next = { ...(state || {}) };
    const map = next.provisional_by_step && typeof next.provisional_by_step === "object"
      ? { ...next.provisional_by_step }
      : {};
    map[stepId] = String(value || "").trim();
    next.provisional_by_step = map;
    return next;
  };

  return createRunStepStateUpdateHelpers({
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
    dreamSpecialist: "DreamSpecialist",
    dreamExplainerSpecialist: "DreamExplainer",
    withProvisionalValue,
    parseListItems,
    postProcessRulesOfTheGame: (statements: string[]) => ({ finalRules: statements }),
    buildRulesOfTheGameBullets: (rules: string[]) => rules.map((line) => `• ${line}`).join("\n"),
    setDreamRuntimeMode: () => {},
    getDreamRuntimeMode: () => "self",
  });
}

test("applyStateUpdate stores strategy as bullet lines for run-on list input", () => {
  const helpers = buildHelpers();
  const runOn =
    "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant Overpresteren in projecten die via het bestaande netwerk binnenkomen Prioriteit geven aan klanten met substantiële investeringsbereidheid";
  const next = helpers.applyStateUpdate({
    prev: { current_step: "strategy" } as any,
    decision: { current_step: "strategy", specialist_to_call: "StrategySpecialist" } as any,
    specialistResult: { strategy: runOn, refined_formulation: runOn },
    showSessionIntroUsed: "false",
  });
  const value = String((next as any).provisional_by_step?.strategy || "");
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.startsWith("• ")));
});

test("applyStateUpdate stores products/services as bullet lines for run-on list input", () => {
  const helpers = buildHelpers();
  const runOn =
    "We ontwikkelen AI-compatible websites en apps We leveren AI-tools en ondersteuning We verzorgen branding We bouwen strategie";
  const next = helpers.applyStateUpdate({
    prev: { current_step: "productsservices" } as any,
    decision: { current_step: "productsservices", specialist_to_call: "ProductsAndServices" } as any,
    specialistResult: { productsservices: runOn, refined_formulation: runOn },
    showSessionIntroUsed: "false",
  });
  const value = String((next as any).provisional_by_step?.productsservices || "");
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.length >= 3);
  assert.ok(lines.every((line) => line.startsWith("• ")));
});
