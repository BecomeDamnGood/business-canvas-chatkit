import test from "node:test";
import assert from "node:assert/strict";

import {
  parseRetainedInstruction,
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
