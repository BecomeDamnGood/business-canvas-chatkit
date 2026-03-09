import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepStateUpdateHelpers } from "./run_step_state_update.js";
import { parseListItems } from "./run_step_wording_heuristics.js";
import { applyDreamRuntimePolicy } from "../steps/dream_runtime_policy.js";

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
    applyDreamRuntimePolicy: ({ specialist }) => ({ specialist, canStage: true }),
    applyRulesRuntimePolicy: ({ specialist }) => ({ specialist }),
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

test("applyStateUpdate stores strategy provisional value from statements when strategy text is missing", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: { current_step: "strategy" } as any,
    decision: { current_step: "strategy", specialist_to_call: "StrategySpecialist" } as any,
    specialistResult: {
      strategy: "",
      refined_formulation: "",
      statements: [
        "Focus op enterprise-opdrachten",
        "Inzetten op langdurige samenwerkingen",
        "Overpresteren via netwerkprojecten",
        "Prioriteit voor investeringsbereidheid",
      ],
    },
    showSessionIntroUsed: "false",
  });
  const value = String((next as any).provisional_by_step?.strategy || "");
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.startsWith("• ")));
});

test("applyStateUpdate stores products/services provisional value from statements when text is missing", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: { current_step: "productsservices" } as any,
    decision: { current_step: "productsservices", specialist_to_call: "ProductsAndServices" } as any,
    specialistResult: {
      productsservices: "",
      refined_formulation: "",
      statements: [
        "AI-compatible websites en apps",
        "AI-tools en ondersteuning",
        "Branding",
        "Strategie",
      ],
    },
    showSessionIntroUsed: "false",
  });
  const value = String((next as any).provisional_by_step?.productsservices || "");
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.startsWith("• ")));
});

test("applyStateUpdate skips role staging for framing intro values", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: { current_step: "role" } as any,
    decision: { current_step: "role", specialist_to_call: "RoleSpecialist" } as any,
    specialistResult: {
      role: "Hier zijn drie korte voorbeelden van een Rol voor Mindd:.",
      refined_formulation: "Hier zijn drie korte voorbeelden van een Rol voor Mindd:.",
    },
    showSessionIntroUsed: "false",
  });
  assert.equal(String((next as any).provisional_by_step?.role || ""), "");
});

test("applyStateUpdate stages Dream when runtime policy only requests repair for a shape-valid Dream line", () => {
  const withProvisionalValue = (state: any, stepId: string, value: string) => {
    const next = { ...(state || {}) };
    const map = next.provisional_by_step && typeof next.provisional_by_step === "object"
      ? { ...next.provisional_by_step }
      : {};
    map[stepId] = String(value || "").trim();
    next.provisional_by_step = map;
    return next;
  };
  const helpers = createRunStepStateUpdateHelpers({
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
    applyDreamRuntimePolicy,
    applyRulesRuntimePolicy: ({ specialist }) => ({ specialist }),
    setDreamRuntimeMode: () => {},
    getDreamRuntimeMode: () => "self",
  });

  const canonical = "Mindd droomt van een wereld waarin mensen keuzes maken dankzij AI.";
  const next = helpers.applyStateUpdate({
    prev: { current_step: "dream" } as any,
    decision: { current_step: "dream", specialist_to_call: "DreamSpecialist" } as any,
    specialistResult: {
      dream: canonical,
      refined_formulation: canonical,
    },
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).provisional_by_step?.dream || ""), canonical);
  assert.equal(String((next as any).last_specialist_result?.__dream_policy_can_stage || ""), "true");
  assert.equal(String((next as any).last_specialist_result?.__dream_policy_requires_repair || ""), "true");
});

test("applyStateUpdate still skips Dream staging when the candidate is not a valid Dream line shape", () => {
  const withProvisionalValue = (state: any, stepId: string, value: string) => {
    const next = { ...(state || {}) };
    const map = next.provisional_by_step && typeof next.provisional_by_step === "object"
      ? { ...next.provisional_by_step }
      : {};
    map[stepId] = String(value || "").trim();
    next.provisional_by_step = map;
    return next;
  };
  const helpers = createRunStepStateUpdateHelpers({
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
    applyDreamRuntimePolicy,
    applyRulesRuntimePolicy: ({ specialist }) => ({ specialist }),
    setDreamRuntimeMode: () => {},
    getDreamRuntimeMode: () => "self",
  });

  const malformedSummary = [
    "Over 5 tot 10 jaar zullen meer mensen verlangen naar werk dat een positieve invloed heeft op het leven van anderen.",
    "Steeds meer mensen zullen streven naar het bouwen van iets dat hun eigen leven overstijgt en blijvende waarde heeft voor de samenleving.",
  ].join(" ");
  const next = helpers.applyStateUpdate({
    prev: { current_step: "dream" } as any,
    decision: { current_step: "dream", specialist_to_call: "DreamSpecialist" } as any,
    specialistResult: {
      dream: malformedSummary,
      refined_formulation: malformedSummary,
    },
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).provisional_by_step?.dream || ""), "");
  assert.equal(String((next as any).last_specialist_result?.__dream_policy_can_stage || ""), "false");
  assert.equal(String((next as any).last_specialist_result?.__dream_policy_requires_repair || ""), "true");
});

test("applyStateUpdate skips purpose staging for framing intro values", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: { current_step: "purpose" } as any,
    decision: { current_step: "purpose", specialist_to_call: "PurposeSpecialist" } as any,
    specialistResult: {
      purpose: "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.",
      refined_formulation: "",
    },
    showSessionIntroUsed: "false",
  });
  assert.equal(String((next as any).provisional_by_step?.purpose || ""), "");
});
