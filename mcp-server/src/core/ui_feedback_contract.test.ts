import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeUiFeedbackContractSource,
  parseRetainedInstruction,
  resolveWordingChoiceFeedbackSource,
  synthesizeUiFeedbackContractFromWordingChoice,
} from "./ui_feedback_contract.js";

test("parseRetainedInstruction splits retained heading, bullets, and final instruction", () => {
  const parsed = parseRetainedInstruction([
    "Deze punten blijven al in de definitieve lijst:",
    "• Punt 1",
    "• Punt 2",
    "",
    "Kies de versie die het beste past.",
  ].join("\n"));

  assert.deepEqual(parsed, {
    retainedHeading: "Deze punten blijven al in de definitieve lijst:",
    retainedItems: ["Punt 1", "Punt 2"],
    instructionText: "Kies de versie die het beste past.",
  });
});

test("synthesizeUiFeedbackContractFromWordingChoice prefers feedback_reason_text and parses retained compare instruction", () => {
  const contract = synthesizeUiFeedbackContractFromWordingChoice(
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      feedback_reason_text: "Dream Builder vraagt hier om een bredere maatschappelijke verschuiving.",
      compare_feedback: {
        text: "Dit oude fallback-veld mag niet leidend zijn.",
      },
      user_label: "Jouw compacte formulering",
      suggestion_label: "Mijn suggestie",
      user_items: ["I want to help people solve a problem they truly care about."],
      suggestion_items: ["Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen."],
      instruction: [
        "Deze punten blijven al in de definitieve lijst:",
        "• Eerder punt 1",
        "• Eerder punt 2",
        "",
        "Kies de versie die het beste past bij het resterende verschil.",
      ].join("\n"),
    },
    { require_wording_pick: true }
  );

  assert.deepEqual(contract, {
    version: "2026-03-16.feedback_contract.v1",
    kind: "grouped_list_compare",
    mode: "list",
    rationale: "Dream Builder vraagt hier om een bredere maatschappelijke verschuiving.",
    current_label: "Jouw compacte formulering",
    suggested_label: "Mijn suggestie",
    current_items: ["I want to help people solve a problem they truly care about."],
    suggested_items: ["Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen."],
    retained_heading: "Deze punten blijven al in de definitieve lijst:",
    retained_items: ["Eerder punt 1", "Eerder punt 2"],
    instruction: "Kies de versie die het beste past bij het resterende verschil.",
  });
});

test("resolveWordingChoiceFeedbackSource backfills missing compare fields from specialist wording-choice state", () => {
  const resolved = resolveWordingChoiceFeedbackSource(
    {
      enabled: true,
      mode: "text",
      user_text: "",
      suggestion_text: "",
      user_items: [],
      suggestion_items: [],
    },
    {
      wording_choice_user_normalized: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
      wording_choice_agent_current:
        "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.",
    }
  );

  assert.equal(
    String(resolved.user_text || ""),
    "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden."
  );
  assert.equal(
    String(resolved.suggestion_text || ""),
    "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden."
  );
});

test("normalizeUiFeedbackContractSource backfills single-value compare current_value from specialist wording state", () => {
  const normalized = normalizeUiFeedbackContractSource(
    {
      version: "2026-03-16.feedback_contract.v1",
      kind: "single_value_compare",
      mode: "text",
      rationale:
        "Je benoemt een probleem, maar de Droom vraagt om een positief toekomstbeeld.",
      current_label: "Dit is jouw input",
      suggested_label: "Dit zou mijn suggestie zijn",
      current_value: "",
      suggested_value:
        "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.",
      instruction: "Klik alsjeblieft wat het beste bij je past.",
    },
    {
      wording_choice_user_normalized:
        "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
    }
  );

  assert.equal(String(normalized?.kind || ""), "single_value_compare");
  assert.equal(
    String(normalized?.current_value || ""),
    "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden."
  );
});
