import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepStateUpdateHelpers } from "./run_step_state_update.js";
import { parseListItems } from "./run_step_compare_heuristics.js";
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

test("applyStateUpdate stores rules provisional value from statements when rules text is missing", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: { current_step: "rulesofthegame" } as any,
    decision: { current_step: "rulesofthegame", specialist_to_call: "RulesOfTheGame" } as any,
    specialistResult: {
      rulesofthegame: "",
      refined_formulation: "",
      statements: [
        "We bewaken kwaliteit.",
        "We doen alles met plezier.",
        "We maken de klant koning.",
        "We geven minder uit dan er binnenkomt.",
        "We zijn punctueel.",
      ],
    },
    showSessionIntroUsed: "false",
  });
  const value = String((next as any).provisional_by_step?.rulesofthegame || "");
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 5);
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

test("applyStateUpdate canonicalizes presentation recap into section blocks with bullets", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: {
      current_step: "presentation",
      step_0_final: "Venture: consultancy | Name: Mindd | Status: existing",
      dream_final: "Build calm around complex choices.",
      bigwhy_final: "Create calm through honest communication.",
      strategy_final: "• Focus on trusted advisory\n• Win on clarity",
      productsservices_final: "• Strategy sessions\n• Decision frameworks",
      rulesofthegame_final: "• Tell the truth\n• Keep it practical",
    } as any,
    decision: { current_step: "presentation", specialist_to_call: "Presentation" } as any,
    specialistResult: {
      presentation_brief:
        "This is what you said: Dream: Build calm around complex choices. Strategy: Focus on trusted advisory and win on clarity.",
      refined_formulation: "",
    },
    showSessionIntroUsed: "false",
  });

  const value = String((next as any).provisional_by_step?.presentation || "");
  assert.match(value, /^This is what you said:/);
  assert.match(value, /\n\nVenture:\nconsultancy\n\nName:\nMindd\n\nDream:\nBuild calm around complex choices\./);
  assert.match(value, /\n\nBig Why:\nCreate calm through honest communication\./);
  assert.match(value, /\n\nStrategy:\n• Focus on trusted advisory\n• Win on clarity/);
  assert.match(value, /\n\nProducts and Services:\n• Strategy sessions\n• Decision frameworks/);
  assert.match(value, /\n\nRules of the Game:\n• Tell the truth\n• Keep it practical/);
  assert.equal(String((next as any).last_specialist_result?.presentation_brief || ""), value);
});

test("applyStateUpdate canonicalizes presentation recap with Dutch localized headings", () => {
  const helpers = buildHelpers();
  const next = helpers.applyStateUpdate({
    prev: {
      current_step: "presentation",
      ui_strings: {
        "presentation.recapIntro": "Dit is wat je zei:",
        "recap.label.venture": "Type bedrijf",
        "recap.label.name": "Naam",
        "ppt.heading.bigwhy": "Grote Waarom",
      },
      step_0_final: "Venture: agency | Name: Mindd | Status: existing",
      bigwhy_final: "Mensen verdienen toegang tot eerlijke verhalen.",
    } as any,
    decision: { current_step: "presentation", specialist_to_call: "Presentation" } as any,
    specialistResult: {
      presentation_brief: "flattened recap",
      refined_formulation: "",
    },
    showSessionIntroUsed: "false",
  });

  const value = String((next as any).provisional_by_step?.presentation || "");
  assert.match(value, /^Dit is wat je zei:/);
  assert.match(value, /\n\nType bedrijf:\nagency\n\nNaam:\nMindd/);
  assert.match(value, /\n\nGrote Waarom:\nMensen verdienen toegang tot eerlijke verhalen\./);
  assert.equal(value.includes("This is what you said:"), false);
  assert.equal(value.includes("grote waarom:"), false);
});

test("applyStateUpdate preserves a structured edited presentation recap instead of resetting to finals", () => {
  const helpers = buildHelpers();
  const editedRecap = [
    "Dit is wat je zei:",
    "",
    "Type bedrijf:",
    "agency",
    "",
    "Naam:",
    "Mindd",
    "",
    "Producten en Diensten:",
    "• Strategisch bedrijfs- en communicatieadvies",
    "• Creatieve campagnes",
    "• DTP, posters en traditionele communicatiemiddelen",
  ].join("\n");

  const next = helpers.applyStateUpdate({
    prev: {
      current_step: "presentation",
      ui_strings: {
        "presentation.recapIntro": "Dit is wat je zei:",
        "recap.label.venture": "Type bedrijf",
        "recap.label.name": "Naam",
        "ppt.heading.productsservices": "Producten en Diensten",
      },
      step_0_final: "Venture: agency | Name: Mindd | Status: existing",
      productsservices_final: [
        "• DTP, posters en traditionele communicatiemiddelen",
        "• Creatieve campagnes",
        "• Strategisch bedrijfs- en communicatieadvies",
      ].join("\n"),
    } as any,
    decision: { current_step: "presentation", specialist_to_call: "Presentation" } as any,
    specialistResult: {
      presentation_brief: editedRecap,
      refined_formulation: editedRecap,
    },
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).provisional_by_step?.presentation || ""), editedRecap);
  assert.equal(String((next as any).last_specialist_result?.presentation_brief || ""), editedRecap);
});

test("applyPostSpecialistStateMutations dedupes DreamExplainer statements canonically", () => {
  const helpers = buildHelpers();
  const next = helpers.applyPostSpecialistStateMutations({
    prevState: {
      current_step: "dream",
      dream_builder_statements: [
        "Originele denkers zullen mismatches hebben met AI als het gaat om schoppen tegen bestaande denkbeelden, modellen en theorieën.",
      ],
      dream_scoring_statements: [],
    } as any,
    decision: { current_step: "dream", specialist_to_call: "DreamExplainer" } as any,
    specialistResult: {
      statements: [
        "Originele denkers zullen mismatches hebben met AI als het gaat om schoppen tegen bestaande denkbeelden, modellen en theorieën.",
        " Originele denkers zullen mismatches hebben met AI als het gaat om schoppen tegen bestaande denkbeelden, modellen en theorieën! ",
        "Nieuwe mismatches ontstaan waar mens en model elkaar uitdagen.",
      ],
    } as any,
    showSessionIntroUsed: "false",
  });

  assert.deepEqual((next as any).dream_builder_statements, [
    "Originele denkers zullen mismatches hebben met AI als het gaat om schoppen tegen bestaande denkbeelden, modellen en theorieën.",
    "Nieuwe mismatches ontstaan waar mens en model elkaar uitdagen.",
  ]);
});

test("applyPostSpecialistStateMutations preserves Dream Builder statements when DreamExplainer returns an empty statements array", () => {
  const helpers = buildHelpers();
  const existingStatements = [
    "Mensen zoeken steeds meer naar oplossingen voor problemen die hen echt aan het hart gaan.",
    "Gemeenschappen zullen zich vaker vormen rond gedeelde overtuigingen of bewegingen.",
  ];
  const next = helpers.applyPostSpecialistStateMutations({
    prevState: {
      current_step: "dream",
      dream_builder_statements: existingStatements,
      dream_scoring_statements: [],
    } as any,
    decision: { current_step: "dream", specialist_to_call: "DreamExplainer" } as any,
    specialistResult: {
      action: "REFINE",
      statements: [],
      refined_formulation: "Meer mensen zullen hun vertrouwen terug willen winnen in hoe informatie wordt gedeeld.",
    } as any,
    showSessionIntroUsed: "false",
  });

  assert.deepEqual((next as any).dream_builder_statements, existingStatements);
});

test("applyPostSpecialistStateMutations keeps committed Dream Builder statements stable while compare is pending", () => {
  const helpers = buildHelpers();
  const existingStatements = [
    "Bedrijven weerspiegelen steeds vaker de waarden en identiteit van hun oprichters.",
  ];
  const next = helpers.applyPostSpecialistStateMutations({
    prevState: {
      current_step: "dream",
      dream_builder_statements: existingStatements,
      dream_scoring_statements: [],
    } as any,
    decision: { current_step: "dream", specialist_to_call: "DreamExplainer" } as any,
    specialistResult: {
      action: "REFINE",
      __dream_builder_compare_pending: "true",
      statements: [
        ...existingStatements,
        "De waarden en identiteit van oprichters worden beter zichtbaar voor de buitenwereld.",
      ],
      __dream_builder_compare_current_items: [
        "Bedrijven weerspiegelen steeds vaker de waarden en identiteit van hun oprichters.",
        "De waarden en identiteit van oprichters worden beter zichtbaar voor de buitenwereld.",
      ],
      __dream_builder_compare_suggested_items: [
        "Bedrijven weerspiegelen steeds vaker zichtbaarder de waarden en identiteit van hun oprichters.",
      ],
    } as any,
    showSessionIntroUsed: "false",
  });

  assert.deepEqual((next as any).dream_builder_statements, existingStatements);
});
