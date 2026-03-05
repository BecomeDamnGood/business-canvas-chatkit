import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRuntimeTextHelpers } from "./run_step_runtime_finalize.js";

function buildTextHelpers(wordingSelectionMessage: (
  stepId: string,
  _state: any,
  _activeSpecialist?: string,
  _selectedValue?: string
) => string) {
  return createRunStepRuntimeTextHelpers({
    dreamStepId: "dream",
    parseMenuFromContractIdForStep: () => "",
    canonicalizeComparableText: (value: string) =>
      String(value || "")
        .toLowerCase()
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    wordingSelectionMessage,
    mergeListItems: (userItems: string[], suggestionItems: string[]) => [...userItems, ...suggestionItems],
    splitSentenceItems: (text: string) => String(text || "").split(/\n+/).filter(Boolean),
    sanitizePendingListMessage: (message: string) => String(message || ""),
    isWordingPanelCleanBodyV1Enabled: () => false,
    fieldForStep: (stepId: string) => {
      if (stepId === "bigwhy") return "bigwhy";
      if (stepId === "strategy") return "strategy";
      if (stepId === "productsservices") return "productsservices";
      if (stepId === "rulesofthegame") return "rulesofthegame";
      return "";
    },
    stripUnsupportedReformulationClaims: (message: string) => String(message || ""),
    tokenizeWords: (text: string) =>
      String(text || "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    compactWordingPanelBody: (message: string) => String(message || ""),
  });
}

test("buildTextForWidget uses formatted strategy body with bullets from wording selection", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "strategy") return "";
    return [
      "Je huidige strategie voor Mindd is:",
      "",
      "• Focus op enterprise-opdrachten",
      "• Inzetten op langdurige samenwerkingen",
      "• Overpresteren via netwerkprojecten",
      "• Prioriteit voor investeringsbereidheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_QUESTIONS:v1",
      message: "Korte toelichting.",
      refined_formulation:
        "Focus op enterprise-opdrachten Inzetten op langdurige samenwerkingen Overpresteren via netwerkprojecten Prioriteit voor investeringsbereidheid",
      strategy:
        "Focus op enterprise-opdrachten Inzetten op langdurige samenwerkingen Overpresteren via netwerkprojecten Prioriteit voor investeringsbereidheid",
    },
    state: {
      active_specialist: "Strategy",
      current_step: "strategy",
    } as any,
  });

  assert.match(output, /Je huidige strategie voor Mindd is:/);
  assert.match(output, /• Focus op enterprise-opdrachten/);
  assert.match(output, /• Prioriteit voor investeringsbereidheid/);
});

test("buildTextForWidget keeps products/services list formatting when heading+body are provided", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn",
      "• Strategische sessies",
      "• Leiderschapscoaching",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:ASK:PRODUCTSSERVICES_MENU_QUESTIONS:v1",
      message: "Context.",
      refined_formulation: "Strategische sessies Leiderschapscoaching",
      productsservices: "Strategische sessies Leiderschapscoaching",
    },
    state: {
      active_specialist: "ProductsAndServices",
      current_step: "productsservices",
    } as any,
  });

  assert.match(output, /De huidige producten en diensten van Mindd zijn/);
  assert.match(output, /• Strategische sessies/);
  assert.match(output, /• Leiderschapscoaching/);
});

test("buildTextForWidget keeps rules-of-the-game bullets when selecting suggestion", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "rulesofthegame") return "";
    return [
      "Je huidige spelregels voor Mindd is:",
      "",
      "• We leveren op afspraken",
      "• We spreken conflicten direct uit",
      "• We kiezen kwaliteit boven snelheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "rulesofthegame:ASK:RULESOFTHEGAME_MENU_QUESTIONS:v1",
      message: "Startpunt.",
      refined_formulation:
        "We leveren op afspraken We spreken conflicten direct uit We kiezen kwaliteit boven snelheid",
      rulesofthegame:
        "We leveren op afspraken We spreken conflicten direct uit We kiezen kwaliteit boven snelheid",
    },
    state: {
      active_specialist: "RulesOfTheGame",
      current_step: "rulesofthegame",
    } as any,
  });

  assert.match(output, /Je huidige spelregels voor Mindd is:/);
  assert.match(output, /• We leveren op afspraken/);
  assert.match(output, /• We kiezen kwaliteit boven snelheid/);
});

test("buildTextForWidget always shows current heading for Big Why when message only contains formulation", () => {
  const heading = "JE HUIDIGE GROTE WAAROM VOOR MINDD IS:";
  const formulation =
    "Mensen zouden altijd toegang moeten hebben tot eerlijke en volledige informatie, zodat zij zelfstandig en met vertrouwen keuzes kunnen maken die hun leven verrijken.";
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "bigwhy") return "";
    return [heading, "", formulation].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "bigwhy:ASK:BIGWHY_MENU_QUESTIONS:v1",
      message: formulation,
      refined_formulation: formulation,
      bigwhy: formulation,
    },
    state: {
      active_specialist: "BigWhy",
      current_step: "bigwhy",
    } as any,
  });

  assert.match(output, new RegExp(heading));
  assert.match(output, /Mensen zouden altijd toegang moeten hebben/);
});

test("buildTextForWidget avoids duplicate strategy bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "strategy") return "";
    return [
      "JE HUIDIGE STRATEGIE VOOR MINDD IS:",
      "",
      "• Focus op enterprise-opdrachten",
      "• Inzetten op langdurige samenwerkingen",
      "• Overpresteren via netwerkprojecten",
      "• Prioriteit voor investeringsbereidheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_QUESTIONS:v1",
      message: [
        "Tot nu toe hebben we deze 4 strategische focuspunten:",
        "",
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
      refined_formulation: [
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
      strategy: [
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
    },
    state: {
      active_specialist: "Strategy",
      current_step: "strategy",
    } as any,
  });

  assert.equal((output.match(/Focus op enterprise-opdrachten/g) || []).length, 1);
});

test("buildTextForWidget avoids duplicate products/services bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn:",
      "• AI-compatible websites en apps",
      "• AI-tools en ondersteuning",
      "• Branding",
      "• Strategie",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:ASK:PRODUCTSSERVICES_MENU_QUESTIONS:v1",
      message: [
        "Dit is wat je volgens jouw input aan je klanten biedt:",
        "",
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
      refined_formulation: [
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
      productsservices: [
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
    },
    state: {
      active_specialist: "ProductsAndServices",
      current_step: "productsservices",
    } as any,
  });

  assert.equal((output.match(/AI-tools en ondersteuning/g) || []).length, 1);
});

test("buildTextForWidget avoids duplicate rules bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "rulesofthegame") return "";
    return [
      "Je huidige spelregels voor Mindd is:",
      "",
      "• We leveren op afspraken",
      "• We spreken conflicten direct uit",
      "• We kiezen kwaliteit boven snelheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "rulesofthegame:ASK:RULESOFTHEGAME_MENU_QUESTIONS:v1",
      message: [
        "Tot nu toe hebben we deze spelregels scherp:",
        "",
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
      refined_formulation: [
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
      rulesofthegame: [
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
    },
    state: {
      active_specialist: "RulesOfTheGame",
      current_step: "rulesofthegame",
    } as any,
  });

  assert.equal((output.match(/We leveren op afspraken/g) || []).length, 1);
});
