import test from "node:test";
import assert from "node:assert/strict";

import { finalizeResponseContractInternals } from "./turn_contract.js";
import { createPendingInteractionState } from "../core/state.js";
import {
  readCompareContractFailureReason,
  shouldSuppressMainCardForCompare,
  shouldSuppressPromptForCompare,
} from "../../ui/lib/ui_render.js";

type Fixture = {
  name: string;
  response: Record<string, unknown>;
  expected: Record<string, unknown>;
};

function compareRuntime(overrides: Record<string, unknown>) {
  const kind = String(overrides.kind || "").trim() === "list_compare" ? "list_compare" : "text_compare";
  return createPendingInteractionState({
    id: String(overrides.id || ""),
    kind,
    render_model: {
      mode: kind === "list_compare" ? "list" : "text",
      instruction: String(overrides.compare_instruction || overrides.instruction || ""),
      feedback_reason_text: String(overrides.feedback_reason_text || ""),
      user_label: String(overrides.user_label || ""),
      suggestion_label: String(overrides.suggestion_label || ""),
      user_text: String(overrides.user_text || ""),
      suggestion_text: String(overrides.suggestion_text || ""),
      user_items: Array.isArray(overrides.user_items) ? overrides.user_items : [],
      suggestion_items: Array.isArray(overrides.suggestion_items) ? overrides.suggestion_items : [],
      ...(Array.isArray(overrides.units) ? { units: overrides.units as any } : {}),
      ...(typeof overrides.retained_heading !== "undefined"
        ? { retained_heading: String(overrides.retained_heading || "") }
        : {}),
      ...(Array.isArray(overrides.retained_items) ? { retained_items: overrides.retained_items as any } : {}),
    },
  } as any);
}

function finalizeFixture(response: Record<string, unknown>): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
  const specialist =
    cloned.specialist && typeof cloned.specialist === "object"
      ? (cloned.specialist as Record<string, unknown>)
      : {};
  const state =
    cloned.state && typeof cloned.state === "object"
      ? (cloned.state as Record<string, unknown>)
      : {};
  const pendingInteractionState =
    state.pending_interaction_state ||
    specialist.pending_interaction_state ||
    {};
  cloned.state = {
    ...state,
    pending_interaction_state: pendingInteractionState,
  };
  if (specialist.pending_interaction_state) {
    const { pending_interaction_state: _pendingInteractionState, ...rest } = specialist;
    cloned.specialist = rest;
  }
  return finalizeResponseContractInternals(cloned as any, {
    applyUiClientActionContract: () => {},
    labelKeysForActionCodes: () => [],
    onUiParityError: () => {},
    attachRegistryPayload: (payload) => payload,
  }) as Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((value) => String(value || "").trim()).filter(Boolean) : [];
}

function extractProof(result: Record<string, unknown>): Record<string, unknown> {
  const ui = toRecord(result.ui);
  const state = toRecord(result.state);
  const error = toRecord(result.error);
  const view = toRecord(ui.view);
  const pending = toRecord(ui.pending_interaction);
  const renderModel = toRecord(pending.render_model);
  const dreamBuilderContract = toRecord(ui.dream_builder_contract);
  const dreamBuilderCompare = toRecord(dreamBuilderContract.compare);
  const actionContract = toRecord(ui.action_contract);
  const content = toRecord(ui.content);
  const compareFailureReason = readCompareContractFailureReason(ui);
  const pendingCompareActive = shouldSuppressMainCardForCompare(ui);
  const dreamBuilderCompareActive =
    String(dreamBuilderContract.phase || "").trim() === "compare" &&
    (
      String(dreamBuilderCompare.kind || "").trim() === "batch_rewrite_compare" ||
      String(dreamBuilderCompare.kind || "").trim() === "overlap_merge_compare"
    );
  const compareActive = pendingCompareActive || dreamBuilderCompareActive;
  const visibleCard =
    String(error.type || "").trim() === "contract_warning" || compareFailureReason
      ? "contract_failure"
      : compareActive
        ? "compare"
        : Object.keys(content).length > 0
          ? "semantic"
          : "empty";
  const effectiveUserLabel = String(renderModel.user_label || dreamBuilderCompare.current_label || "");
  const effectiveSuggestionLabel = String(renderModel.suggestion_label || dreamBuilderCompare.suggested_label || "");
  const effectiveUserItems =
    normalizeStringArray(renderModel.user_items).length > 0
      ? normalizeStringArray(renderModel.user_items)
      : normalizeStringArray(dreamBuilderCompare.current_items);
  const effectiveSuggestionItems =
    normalizeStringArray(renderModel.suggestion_items).length > 0
      ? normalizeStringArray(renderModel.suggestion_items)
      : normalizeStringArray(dreamBuilderCompare.suggested_items);
  const actionContractRoles = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>).map((action) => String(action.role || ""))
    : [];

  return {
    ok: result.ok === true,
    error_type: String(error.type || ""),
    reason_code: String(state.reason_code || ""),
    view_variant: String(view.variant || ""),
    visible_card: visibleCard,
    main_card_suppressed: compareActive,
    compare_failure_reason: compareFailureReason || "",
    prompt_hidden: dreamBuilderCompareActive || shouldSuppressPromptForCompare({
      compareActive,
    }),
    pending_kind: String(pending.kind || ""),
    pending_status: String(pending.status || ""),
    allowed_roles: Array.isArray(pending.allowed_actions)
      ? (pending.allowed_actions as Array<Record<string, unknown>>).map((action) => String(action.role || ""))
      : dreamBuilderCompareActive
        ? actionContractRoles
        : [],
    user_label: effectiveUserLabel,
    suggestion_label: effectiveSuggestionLabel,
    user_text: String(renderModel.user_text || ""),
    suggestion_text: String(renderModel.suggestion_text || ""),
    user_items: effectiveUserItems,
    suggestion_items: effectiveSuggestionItems,
    has_feedback_contract: Object.prototype.hasOwnProperty.call(ui, "feedback_contract"),
    has_compare: Object.prototype.hasOwnProperty.call(ui, "compare"),
  };
}

const fixtures: Fixture[] = [
  {
    name: "dream_self_compare_text_mode",
    response: {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "Je huidige droom is nog te algemeen en mist concreet menselijk effect.",
          user_text: "Wij willen bedrijven helpen groeien.",
          suggestion_text: "Mindd droomt van bedrijven die vanuit betekenis echte verandering brengen.",
        }),
        compare_instruction: "Choose the version that fits best.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive" },
      },
    },
    expected: {
      visible_card: "compare",
      main_card_suppressed: true,
      pending_kind: "text_compare",
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "This is your input:",
      suggestion_label: "This would be my suggestion:",
      view_variant: "",
    },
  },
  {
    name: "dream_self_compare_after_rewrite_backfill",
    response: {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text:
            "Je input benoemt het probleem van verkeerde voorlichting, maar een Droom vraagt om een positief toekomstbeeld met duidelijk menselijk effect.",
          user_label: "Dit is jouw input:",
          suggestion_label: "Dit zou mijn suggestie zijn:",
          user_text: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
          suggestion_text:
            "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.",
        }),
        compare_instruction: "Klik alsjeblieft wat het beste bij je past.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive" },
      },
    },
    expected: {
      visible_card: "compare",
      user_label: "Dit is jouw input:",
      suggestion_label: "Dit zou mijn suggestie zijn:",
      user_text: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
      pending_kind: "text_compare",
    },
  },
  {
    name: "dream_builder_compare",
    response: {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "dream:interactive:builder_compare",
        view: { mode: "interactive", variant: "dream_builder_refine" },
        dream_builder_contract: {
          version: "2026-03-17.dream_builder_contract.v2",
          phase: "compare",
          compare: {
            kind: "overlap_merge_compare",
            current_label: "Keep both statements",
            suggested_label: "Merge into one statement",
            current_items: ["Statement one", "Statement two"],
            suggested_items: ["Merged statement"],
            instruction: "Choose the version that fits best.",
          },
        },
      },
    },
    expected: {
      visible_card: "compare",
      pending_kind: "",
      user_label: "Keep both statements",
      suggestion_label: "Merge into one statement",
      user_items: ["Statement one", "Statement two"],
      suggestion_items: ["Merged statement"],
    },
  },
  {
    name: "strategy_grouped_compare",
    response: {
      ok: true,
      current_step_id: "strategy",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "list_compare",
          status: "pending",
          feedback_reason_text: "Ik heb de resterende strategische keuze scherper gemaakt.",
          user_label: "Jouw compacte formulering",
          suggestion_label: "Mijn suggestie",
          user_items: ["Operational simplicity"],
          suggestion_items: ["Operational focus"],
        }),
        compare_instruction: "Choose the version that fits best for the remaining difference.",
      },
      state: {
        started: "true",
        current_step: "strategy",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "strategy:interactive:refine",
        view: { mode: "interactive" },
      },
    },
    expected: {
      visible_card: "compare",
      pending_kind: "list_compare",
      user_items: ["Operational simplicity"],
      suggestion_items: ["Operational focus"],
    },
  },
  {
    name: "purpose_single_value_compare",
    response: {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "Je huidige formulering blijft te breed en laat de bijdrage nog niet duidelijk zien.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_text: "We want to do something good.",
          suggestion_text: "We exist to make complex choices understandable.",
        }),
        compare_instruction: "Choose the wording that fits best.",
      },
      state: {
        started: "true",
        current_step: "purpose",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "purpose:interactive:refine",
        view: { mode: "interactive" },
      },
    },
    expected: {
      visible_card: "compare",
      user_label: "Your input",
      suggestion_label: "My suggestion",
      pending_kind: "text_compare",
    },
  },
  {
    name: "resolved_after_choose_user",
    response: {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "purpose",
      },
      ui: {
        contract_id: "purpose:interactive:resolved",
        view: { mode: "interactive" },
        content: {
          kind: "single_value",
          heading: "JOUW GEKOZEN FORMULERING",
          canonical_text: "We want to do something good.",
        },
      },
    },
    expected: {
      visible_card: "semantic",
      main_card_suppressed: false,
      pending_kind: "",
      has_feedback_contract: false,
      has_compare: false,
    },
  },
  {
    name: "resolved_after_choose_suggestion",
    response: {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "purpose",
      },
      ui: {
        contract_id: "purpose:interactive:resolved",
        view: { mode: "interactive" },
        content: {
          kind: "single_value",
          heading: "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE BESTAANSREDEN VOOR",
          canonical_text: "We exist to make complex choices understandable.",
        },
      },
    },
    expected: {
      visible_card: "semantic",
      main_card_suppressed: false,
      pending_kind: "",
      has_feedback_contract: false,
      has_compare: false,
    },
  },
  {
    name: "malformed_compare_server_heals",
    response: {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "Deze suggestie maakt de droom scherper.",
          user_text: "Wij willen bedrijven helpen groeien.",
          suggestion_text: "Mindd droomt van bedrijven die vanuit betekenis echte verandering brengen.",
        }),
        compare_instruction: "Choose the version that fits best.",
      },
      state: {
        started: "true",
        current_step: "dream",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive" },
      },
    },
    expected: {
      ok: true,
      visible_card: "compare",
      error_type: "",
      reason_code: "",
    },
  },
];

for (const fixture of fixtures) {
  test(`compare golden fixture: ${fixture.name}`, () => {
    const finalized = finalizeFixture(fixture.response);
    const proof = extractProof(finalized);
    assert.equal(proof.has_feedback_contract, false, `${fixture.name}: feedback_contract leaked`);
    assert.equal(proof.has_compare, false, `${fixture.name}: compare leaked`);
    for (const [key, expectedValue] of Object.entries(fixture.expected)) {
      assert.deepEqual(proof[key], expectedValue, `${fixture.name}: ${key}`);
    }
  });
}

test("GitHub reference pack preserves compare visibility behavior at the widget boundary", () => {
  const referenceProof = fixtures.map((fixture) => ({
    name: fixture.name,
    proof: extractProof(finalizeFixture(fixture.response)),
  }));

  const outwardBehavior = referenceProof.map(({ name, proof }) => ({
    name,
    visible_card: proof.visible_card,
    prompt_hidden: proof.prompt_hidden,
    allowed_roles: proof.allowed_roles,
    user_label: proof.user_label,
    suggestion_label: proof.suggestion_label,
  }));

  assert.deepEqual(outwardBehavior, [
    {
      name: "dream_self_compare_text_mode",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "This is your input:",
      suggestion_label: "This would be my suggestion:",
    },
    {
      name: "dream_self_compare_after_rewrite_backfill",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "Dit is jouw input:",
      suggestion_label: "Dit zou mijn suggestie zijn:",
    },
    {
      name: "dream_builder_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "Keep both statements",
      suggestion_label: "Merge into one statement",
    },
    {
      name: "strategy_grouped_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "Jouw compacte formulering",
      suggestion_label: "Mijn suggestie",
    },
    {
      name: "purpose_single_value_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "Your input",
      suggestion_label: "My suggestion",
    },
    {
      name: "resolved_after_choose_user",
      visible_card: "semantic",
      prompt_hidden: false,
      allowed_roles: [],
      user_label: "",
      suggestion_label: "",
    },
    {
      name: "resolved_after_choose_suggestion",
      visible_card: "semantic",
      prompt_hidden: false,
      allowed_roles: [],
      user_label: "",
      suggestion_label: "",
    },
    {
      name: "malformed_compare_server_heals",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["compare_pick_user", "compare_pick_suggestion"],
      user_label: "This is your input:",
      suggestion_label: "This would be my suggestion:",
    },
  ]);
});
