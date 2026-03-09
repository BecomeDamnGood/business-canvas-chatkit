import test from "node:test";
import assert from "node:assert/strict";
import {
  BIGWHY_MAX_WORDS,
  buildActionCodeStepTransitions,
  countWords,
  pickBigWhyCandidate,
  resolveRequiredFinalValue,
} from "./run_step_runtime_action_routing_policy.js";

test("countWords counts normalized tokens", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("  one   two\nthree "), 3);
});

test("pickBigWhyCandidate prefers bigwhy over refined_formulation", () => {
  assert.equal(
    pickBigWhyCandidate({ bigwhy: "  Keep this  ", refined_formulation: "Fallback" }),
    "Keep this"
  );
  assert.equal(
    pickBigWhyCandidate({ bigwhy: "", refined_formulation: "  Use this  " }),
    "Use this"
  );
});

test("buildActionCodeStepTransitions maps deterministic proceed actions", () => {
  const transitions = buildActionCodeStepTransitions({
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
  });
  assert.equal(transitions.ACTION_STEP0_READY_START, "dream");
  assert.equal(transitions.ACTION_RULES_CONFIRM_ALL, "presentation");
});

test("resolveRequiredFinalValue returns empty values for unknown step id", () => {
  assert.deepEqual(
    resolveRequiredFinalValue({
      stepId: "unknown_step",
      previousSpecialist: {},
      state: {},
      provisionalValue: "",
      step0Id: "step_0",
      presentationStepId: "presentation",
    }),
    { field: "", value: "" }
  );
});

test("resolveRequiredFinalValue prioritizes provisional and step-specific fallback chain", () => {
  const step0 = resolveRequiredFinalValue({
    stepId: "step_0",
    previousSpecialist: { step_0: "prev value" },
    state: { step_0_final: "state value" },
    provisionalValue: "provisional value",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(step0, { field: "step_0_final", value: "provisional value" });

  const presentation = resolveRequiredFinalValue({
    stepId: "presentation",
    previousSpecialist: { presentation_brief: "brief value", refined_formulation: "refined value" },
    state: { presentation_brief_final: "state value" },
    provisionalValue: "",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(presentation, { field: "presentation_brief_final", value: "brief value" });
});

test("resolveRequiredFinalValue skips framing provisional value for role", () => {
  const resolved = resolveRequiredFinalValue({
    stepId: "role",
    previousSpecialist: { role: "Mindd is de gids die ondernemers helpt keuzes te maken." },
    state: { role_final: "" },
    provisionalValue: "Hier zijn drie korte voorbeelden van een Rol voor Mindd:.",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(resolved, {
    field: "role_final",
    value: "Mindd is de gids die ondernemers helpt keuzes te maken.",
  });
});

test("resolveRequiredFinalValue skips framing provisional value for purpose", () => {
  const resolved = resolveRequiredFinalValue({
    stepId: "purpose",
    previousSpecialist: { purpose: "Mindd helpt ondernemers heldere strategische keuzes te maken." },
    state: { purpose_final: "" },
    provisionalValue: "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(resolved, {
    field: "purpose_final",
    value: "Mindd helpt ondernemers heldere strategische keuzes te maken.",
  });
});

test("resolveRequiredFinalValue falls back to canonical ui content for single-value confirm steps", () => {
  const cases = [
    {
      stepId: "dream",
      stateField: "dream_final",
      canonical: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
    },
    {
      stepId: "purpose",
      stateField: "purpose_final",
      canonical: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
    },
    {
      stepId: "bigwhy",
      stateField: "bigwhy_final",
      canonical: "Mensen verdienen helderheid wanneer ingewikkelde keuzes op hun pad komen.",
    },
    {
      stepId: "role",
      stateField: "role_final",
      canonical: "Mindd is de gids die complexe informatie omzet in richting.",
    },
    {
      stepId: "entity",
      stateField: "entity_final",
      canonical: "Mindd is een strategische partner voor complexe groeivraagstukken.",
    },
    {
      stepId: "targetgroup",
      stateField: "targetgroup_final",
      canonical: "Technische mkb-bedrijven met complexe proposities en lange aankooptrajecten.",
    },
  ] as const;

  for (const current of cases) {
    const resolved = resolveRequiredFinalValue({
      stepId: current.stepId,
      previousSpecialist: {
        ui_content: {
          canonical_text: current.canonical,
        },
      },
      state: { [current.stateField]: "" },
      provisionalValue: "",
      step0Id: "step_0",
      presentationStepId: "presentation",
    });
    assert.deepEqual(resolved, {
      field: current.stateField,
      value: current.canonical,
    });
  }
});

test("BIGWHY_MAX_WORDS remains stable for routing checks", () => {
  assert.equal(BIGWHY_MAX_WORDS, 28);
});
