import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyPendingWordingChoiceTextIntent,
  parseListItems,
  shouldTreatAsStepContributingInput,
} from "./run_step_wording_heuristics.js";
import {
  pickDualChoiceSuggestion,
  pickDreamSuggestionFromPreviousState,
  pickRoleSuggestionFromPreviousState,
} from "./run_step_wording_heuristics_defaults.js";

test("parseListItems splits run-on strategy style sentences into logical list items", () => {
  const input =
    "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant Overpresteren in projecten die via het bestaande netwerk binnenkomen Prioriteit geven aan klanten met substantiële investeringsbereidheid";
  const items = parseListItems(input);
  assert.equal(items.length, 4);
  assert.equal(items[0], "Focussen op opdrachten voor grote ondernemingen met complexe diensten of producten");
  assert.equal(items[1], "Altijd inzetten op langdurige samenwerkingen met interne ambassadeurs bij de klant");
  assert.equal(items[2], "Overpresteren in projecten die via het bestaande netwerk binnenkomen");
  assert.equal(items[3], "Prioriteit geven aan klanten met substantiële investeringsbereidheid");
});

test("parseListItems splits repeated sentence starters into list items", () => {
  const input =
    "We ontwikkelen AI-compatible websites en apps We leveren AI-tools en ondersteuning We verzorgen branding We bouwen strategie";
  const items = parseListItems(input);
  assert.equal(items.length, 4);
  assert.equal(items[0], "We ontwikkelen AI-compatible websites en apps");
  assert.equal(items[1], "We leveren AI-tools en ondersteuning");
  assert.equal(items[2], "We verzorgen branding");
  assert.equal(items[3], "We bouwen strategie");
});

test("shouldTreatAsStepContributingInput ignores process navigation utterances", () => {
  assert.equal(shouldTreatAsStepContributingInput("Ga door naar de volgende stap", "strategy"), false);
  assert.equal(
    shouldTreatAsStepContributingInput(
      "Focus op langdurige samenwerkingen met interne ambassadeurs bij de klant",
      "strategy"
    ),
    true
  );
});

test("classifyPendingWordingChoiceTextIntent defaults to suggestion accept unless explicit reject is present", () => {
  assert.equal(
    classifyPendingWordingChoiceTextIntent("Maak het korter en bondiger."),
    "accept_suggestion_default"
  );
  assert.equal(
    classifyPendingWordingChoiceTextIntent("Dat is niet wat ik bedoel."),
    "reject_suggestion_explicit"
  );
  assert.equal(
    classifyPendingWordingChoiceTextIntent("That's not what I meant."),
    "reject_suggestion_explicit"
  );
});

test("pickRoleSuggestionFromPreviousState skips examples intro framing lines", () => {
  const picked = pickRoleSuggestionFromPreviousState(
    { business_name: "Mindd" } as any,
    {
      message: [
        "Hier zijn drie korte voorbeelden van een Rol voor Mindd:.",
        "1. Mindd is de gids die ondernemers helpt hun visie om te zetten in concrete keuzes.",
        "2. Mindd is de uitdager die ondernemers confronteert met wat echt belangrijk is.",
        "3. Mindd is de versneller die ondernemers helpt sneller tot scherpe besluiten te komen.",
      ].join("\n"),
    } as any
  );
  assert.equal(
    picked,
    "Mindd is de gids die ondernemers helpt hun visie om te zetten in concrete keuzes."
  );
});

test("pickDreamSuggestionFromPreviousState skips examples intro framing lines", () => {
  const picked = pickDreamSuggestionFromPreviousState(
    { business_name: "Mindd" } as any,
    {
      message: [
        "Hier zijn drie korte voorbeelden van een Droom voor Mindd:.",
        "1. Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
        "2. Mindd droomt van een wereld waarin werk en betekenis samenkomen.",
        "3. Mindd droomt van een wereld waarin bedrijven groeien zonder hun waarden te verliezen.",
      ].join("\n"),
    } as any
  );
  assert.equal(
    picked,
    "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes."
  );
});

test("pickDualChoiceSuggestion ignores examples framing-only message for purpose", () => {
  const picked = pickDualChoiceSuggestion(
    "purpose",
    {
      message: "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.",
      purpose: "",
      refined_formulation: "",
    } as any,
    {} as any,
    ""
  );
  assert.equal(picked, "");
});
