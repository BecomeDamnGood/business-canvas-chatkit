/**
 * Minimal regression test: glossary intent constraints (dev-only).
 * Ensures GLOBAL_GLOSSARY and composed prompt contain the required concept rules.
 * Does not call the LLM; only checks that the single source of truth encodes the intents.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  GLOBAL_GLOSSARY,
  CANONICAL_STEP_IDS,
  composeInstructionsWithGlossary,
  getGlossaryPrefix,
} from "./glossary.js";

describe("glossary", () => {
  it("exports canonical step IDs including purpose, dream, role, entity, strategy, bigwhy, rulesofthegame", () => {
    const ids = [...CANONICAL_STEP_IDS];
    assert.ok(ids.includes("step_0"));
    assert.ok(ids.includes("dream"));
    assert.ok(ids.includes("purpose"));
    assert.ok(ids.includes("bigwhy"));
    assert.ok(ids.includes("role"));
    assert.ok(ids.includes("entity"));
    assert.ok(ids.includes("strategy"));
    assert.ok(ids.includes("rulesofthegame"));
    assert.ok(ids.includes("presentation"));
  });

  it("purpose: forbids goal/objective concept for purpose", () => {
    assert.ok(
      /purpose.*meaning|sense-making|existential/.test(GLOBAL_GLOSSARY),
      "purpose defined as meaning/sense-making"
    );
    assert.ok(
      /NEVER.*goal|target|objective/.test(GLOBAL_GLOSSARY) ||
        /goal.*target.*objective.*purpose/.test(GLOBAL_GLOSSARY),
      "purpose must not be conflated with goal/objective"
    );
  });

  it("organisation: avoids organisation when meaning is enterprise/business", () => {
    assert.ok(
      /business|enterprise/.test(GLOBAL_GLOSSARY),
      "glossary mentions business/enterprise"
    );
    assert.ok(
      /organization|organisation/.test(GLOBAL_GLOSSARY) &&
        /NEVER.*organization|when.*meaning.*business/.test(GLOBAL_GLOSSARY),
      "glossary forbids organisation for business/enterprise meaning"
    );
  });

  it("dream: maps to vision/aspiration concept", () => {
    assert.ok(
      /dream.*vision|vision.*dream|aspirational/.test(GLOBAL_GLOSSARY),
      "dream tied to vision/aspiration"
    );
  });

  it("role: maps to mission concept", () => {
    assert.ok(
      /role.*mission|mission.*business/.test(GLOBAL_GLOSSARY),
      "role tied to mission"
    );
  });

  it("big_why: framed as deep driver", () => {
    assert.ok(
      /big_why|big why|deep driver|importance behind/.test(GLOBAL_GLOSSARY),
      "big_why framed as deep driver"
    );
  });

  it("rules_of_the_game: internal operating rules", () => {
    assert.ok(
      /rules_of_the_game|rules of the game/.test(GLOBAL_GLOSSARY),
      "rules_of_the_game present"
    );
    assert.ok(
      /internal.*rules|operating principles|everyone follows.*inside/.test(GLOBAL_GLOSSARY),
      "rules described as internal operating rules"
    );
  });

  it("distinction: purpose ≠ big_why ≠ role", () => {
    assert.ok(
      /purpose.*big_why|purpose.*role|Distinctions|never conflate/.test(GLOBAL_GLOSSARY) ||
        (GLOBAL_GLOSSARY.includes("purpose") && GLOBAL_GLOSSARY.includes("big_why") && GLOBAL_GLOSSARY.includes("role")),
      "glossary enforces purpose vs big_why vs role distinction"
    );
  });

  it("composeInstructionsWithGlossary prepends glossary to any instructions", () => {
    const stepOnly = "You are the Dream specialist.";
    const composed = composeInstructionsWithGlossary(stepOnly);
    assert.ok(composed.startsWith("## CANVAS TERM GLOSSARY"), "composed starts with glossary");
    assert.ok(composed.includes(stepOnly), "composed includes step instructions");
    assert.ok(composed.indexOf(stepOnly) > composed.indexOf("---"), "step instructions come after glossary block");
  });

  it("getGlossaryPrefix includes self-check rule", () => {
    const prefix = getGlossaryPrefix();
    assert.ok(prefix.includes("Before returning your JSON"), "prefix includes self-check rule");
    assert.ok(prefix.includes("verify you did not use disallowed"), "prefix includes verification");
  });
});
