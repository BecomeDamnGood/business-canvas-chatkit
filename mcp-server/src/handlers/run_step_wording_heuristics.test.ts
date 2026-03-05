import test from "node:test";
import assert from "node:assert/strict";

import { parseListItems } from "./run_step_wording_heuristics.js";

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
