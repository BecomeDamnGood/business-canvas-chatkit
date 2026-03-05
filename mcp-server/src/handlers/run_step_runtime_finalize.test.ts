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

