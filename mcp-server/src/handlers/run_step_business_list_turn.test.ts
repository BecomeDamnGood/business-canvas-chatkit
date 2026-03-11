import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBusinessListTurnResolution,
  readBusinessListReferenceItems,
  resolveBusinessListTurn,
} from "./run_step_business_list_turn.js";

const STEP_CASES = [
  {
    stepId: "strategy",
    field: "strategy",
    items: ["Recurring revenue", "Operational simplicity", "Enterprise clients only"],
    replacement: "Operational simplicity with reusable delivery systems",
    rewritten: "Operational simplicity for enterprise environments with reusable delivery systems",
  },
  {
    stepId: "productsservices",
    field: "productsservices",
    items: ["AI audits", "Implementation guidance", "Branding"],
    replacement: "Strategic branding systems",
    rewritten: "AI audits for operational bottlenecks in B2B service teams",
  },
  {
    stepId: "rulesofthegame",
    field: "rulesofthegame",
    items: ["We communicate proactively.", "We protect quality under pressure.", "We keep commitments."],
    replacement: "We protect quality before convenience.",
    rewritten: "We communicate proactively before uncertainty grows.",
  },
] as const;

test("readBusinessListReferenceItems prefers visible statements from the last specialist result", () => {
  const items = readBusinessListReferenceItems(
    {
      current_step: "strategy",
      provisional_by_step: {
        strategy: "• Older item",
      },
      last_specialist_result: {
        statements: ["Recurring revenue", "Operational simplicity"],
      },
      strategy_final: "• Final item",
    } as any,
    "strategy"
  );

  assert.deepEqual(items, ["Recurring revenue", "Operational simplicity"]);
});

test("strategy first free-text input without reference items stays an add turn", () => {
  const firstInput = [
    "Altijd investeren in de nieuwste AI-technologieen die relevant zijn voor onze klanten",
    "Prototyping en MVP's bouwen als show what we can do for you",
  ].join("\n");
  const resolution = resolveBusinessListTurn({
    stepId: "strategy",
    userMessage: firstInput,
    referenceItems: [],
  });

  assert.equal(resolution.kind, "add");
  if (resolution.kind !== "add") throw new Error("expected add resolution");
  assert.equal(resolution.routePrompt, firstInput);
});

test("business-list mutation routing only activates once reference items exist", () => {
  const userMessage = 'verwijder "Operational simplicity"';
  const withoutReferenceItems = resolveBusinessListTurn({
    stepId: "strategy",
    userMessage,
    referenceItems: [],
  });
  const withReferenceItems = resolveBusinessListTurn({
    stepId: "strategy",
    userMessage,
    referenceItems: ["Recurring revenue", "Operational simplicity"],
  });

  assert.equal(withoutReferenceItems.kind, "add");
  assert.equal(withReferenceItems.kind, "remove");
});

for (const stepCase of STEP_CASES) {
  test(`${stepCase.stepId} remove commands resolve to list mutation instead of append`, () => {
    const targetItem = stepCase.items[1];
    const resolution = resolveBusinessListTurn({
      stepId: stepCase.stepId,
      userMessage: `verwijder "${targetItem}"`,
      referenceItems: stepCase.items,
    });

    assert.equal(resolution.kind, "remove");
    if (resolution.kind !== "remove") throw new Error("expected remove resolution");
    const normalized = applyBusinessListTurnResolution({
      stepId: stepCase.stepId,
      resolution,
      specialistResult: {
        action: "ASK",
        message: "Done.",
        question: "What else?",
        refined_formulation: `${stepCase.items.join("\n")}\nverwijder "${targetItem}"`,
        [stepCase.field]: `${stepCase.items.join("\n")}\nverwijder "${targetItem}"`,
        statements: [...stepCase.items, `verwijder "${targetItem}"`],
      },
    });

    assert.deepEqual((normalized as Record<string, unknown>).statements, [
      stepCase.items[0],
      stepCase.items[2],
    ]);
  });

  test(`${stepCase.stepId} replace commands resolve to targeted list mutation instead of append`, () => {
    const targetItem = stepCase.items[2];
    const resolution = resolveBusinessListTurn({
      stepId: stepCase.stepId,
      userMessage: `vervang "${targetItem}" door "${stepCase.replacement}"`,
      referenceItems: stepCase.items,
    });

    assert.equal(resolution.kind, "edit");
    if (resolution.kind !== "edit") throw new Error("expected edit resolution");
    assert.equal(resolution.operation, "replace");
    const normalized = applyBusinessListTurnResolution({
      stepId: stepCase.stepId,
      resolution,
      specialistResult: {
        action: "ASK",
        message: "Done.",
        question: "What else?",
        refined_formulation: `${stepCase.items.join("\n")}\n${stepCase.replacement}`,
        [stepCase.field]: `${stepCase.items.join("\n")}\n${stepCase.replacement}`,
        statements: [...stepCase.items, stepCase.replacement],
      },
    });

    assert.deepEqual((normalized as Record<string, unknown>).statements, [
      stepCase.items[0],
      stepCase.items[1],
      stepCase.replacement,
    ]);
  });

  test(`${stepCase.stepId} edit commands keep item-level rewrite anchored to the existing list`, () => {
    const resolution = resolveBusinessListTurn({
      stepId: stepCase.stepId,
      userMessage: "maak deze bullet specifieker",
      referenceItems: [stepCase.items[0]],
    });

    assert.equal(resolution.kind, "edit");
    if (resolution.kind !== "edit") throw new Error("expected edit resolution");
    assert.equal(resolution.operation, "rewrite");
    const normalized = applyBusinessListTurnResolution({
      stepId: stepCase.stepId,
      resolution,
      specialistResult: {
        action: "ASK",
        message: "Sharpened.",
        question: "Anything else?",
        refined_formulation: stepCase.rewritten,
        [stepCase.field]: stepCase.rewritten,
        statements: [stepCase.rewritten],
      },
    });

    assert.deepEqual((normalized as Record<string, unknown>).statements, [stepCase.rewritten]);
  });

  test(`${stepCase.stepId} ambiguous edit commands keep the current list unchanged`, () => {
    const resolution = resolveBusinessListTurn({
      stepId: stepCase.stepId,
      userMessage: "pas deze bullet aan",
      referenceItems: stepCase.items,
    });

    assert.equal(resolution.kind, "clarify");
    if (resolution.kind !== "clarify") throw new Error("expected clarify resolution");
    const normalized = applyBusinessListTurnResolution({
      stepId: stepCase.stepId,
      resolution,
      specialistResult: {
        action: "ASK",
        message: "Which one do you mean?",
        question: "Please quote the exact item.",
        refined_formulation: stepCase.rewritten,
        [stepCase.field]: stepCase.rewritten,
        statements: [stepCase.rewritten],
      },
    });

    assert.deepEqual((normalized as Record<string, unknown>).statements, stepCase.items);
  });
}
