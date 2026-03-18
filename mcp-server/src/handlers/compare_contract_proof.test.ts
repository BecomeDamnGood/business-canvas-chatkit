import test from "node:test";
import assert from "node:assert/strict";

import { finalizeResponseContractInternals } from "./turn_contract.js";
import {
  readCompareContractFailureReason,
  shouldSuppressMainCardForWordingChoice,
  shouldSuppressPromptForWordingChoice,
} from "../../ui/lib/ui_render.js";

type Fixture = {
  name: string;
  response: Record<string, unknown>;
  expected: Record<string, unknown>;
};

function finalizeFixture(response: Record<string, unknown>): Record<string, unknown> {
  return finalizeResponseContractInternals(response as any, {
    applyUiClientActionContract: () => {},
    parseMenuFromContractIdForStep: () => "",
    labelKeysForMenuActionCodes: () => [],
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
  const feedback = toRecord(ui.feedback_contract);
  const content = toRecord(ui.content);
  const compareFailureReason = readCompareContractFailureReason(ui);
  const wordingChoiceActive = shouldSuppressMainCardForWordingChoice(ui, String(view.variant || ""));
  const visibleCard =
    String(error.type || "").trim() === "contract_warning" || compareFailureReason
      ? "contract_failure"
      : wordingChoiceActive
        ? "compare"
        : Object.keys(content).length > 0 || String(feedback.kind || "").trim() === "single_value_canonical_suggestion"
          ? "semantic"
          : "empty";

  return {
    ok: result.ok === true,
    error_type: String(error.type || ""),
    reason_code: String(state.reason_code || ""),
    view_variant: String(view.variant || ""),
    visible_card: visibleCard,
    main_card_suppressed: wordingChoiceActive,
    compare_failure_reason: compareFailureReason || "",
    prompt_hidden: shouldSuppressPromptForWordingChoice({
      uiViewVariant: String(view.variant || ""),
      wordingChoiceActive,
      requireWordingPick: toRecord(ui.flags).require_wording_pick === true,
    }),
    pending_kind: String(pending.kind || ""),
    pending_status: String(pending.status || ""),
    allowed_roles: Array.isArray(pending.allowed_actions)
      ? (pending.allowed_actions as Array<Record<string, unknown>>).map((action) => String(action.role || ""))
      : [],
    user_label: String(renderModel.user_label || ""),
    suggestion_label: String(renderModel.suggestion_label || ""),
    user_text: String(renderModel.user_text || ""),
    suggestion_text: String(renderModel.suggestion_text || ""),
    user_items: normalizeStringArray(renderModel.user_items),
    suggestion_items: normalizeStringArray(renderModel.suggestion_items),
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
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
        ui_action_wording_pick_user: "ACTION_WORDING_PICK_USER",
        ui_action_wording_pick_suggestion: "ACTION_WORDING_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive" },
        feedback_contract: {
          kind: "single_value_compare",
          mode: "text",
          current_value: "Wij willen bedrijven helpen groeien.",
          suggested_value: "Mindd droomt van bedrijven die vanuit betekenis echte verandering brengen.",
          instruction: "Choose the version that fits best.",
        },
      },
    },
    expected: {
      visible_card: "compare",
      main_card_suppressed: true,
      pending_kind: "wording_choice",
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
      user_label: "This is your input:",
      suggestion_label: "This would be my suggestion:",
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
        wording_choice_user_normalized: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
        wording_choice_agent_current:
          "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_wording_pick_user: "ACTION_WORDING_PICK_USER",
        ui_action_wording_pick_suggestion: "ACTION_WORDING_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive", variant: "wording_choice" },
        feedback_contract: {
          kind: "single_value_compare",
          mode: "text",
          current_label: "Dit is jouw input:",
          suggested_label: "Dit zou mijn suggestie zijn:",
          current_value: "",
          suggested_value:
            "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.",
          instruction: "Klik alsjeblieft wat het beste bij je past.",
        },
      },
    },
    expected: {
      visible_card: "compare",
      user_label: "Dit is jouw input:",
      suggestion_label: "Dit zou mijn suggestie zijn:",
      user_text: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
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
        ui_action_wording_pick_user: "ACTION_WORDING_PICK_USER",
        ui_action_wording_pick_suggestion: "ACTION_WORDING_PICK_SUGGESTION",
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
      pending_kind: "wording_choice",
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
      specialist: {},
      state: {
        started: "true",
        current_step: "strategy",
        ui_action_wording_pick_user: "ACTION_WORDING_PICK_USER",
        ui_action_wording_pick_suggestion: "ACTION_WORDING_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "strategy:interactive:refine",
        view: { mode: "interactive" },
        feedback_contract: {
          kind: "grouped_list_compare",
          mode: "list",
          current_label: "Jouw compacte formulering",
          suggested_label: "Mijn suggestie",
          current_items: ["Operational simplicity"],
          suggested_items: ["Operational focus"],
          instruction: "Choose the version that fits best for the remaining difference.",
        },
      },
    },
    expected: {
      visible_card: "compare",
      pending_kind: "wording_choice",
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
      specialist: {},
      state: {
        started: "true",
        current_step: "purpose",
        ui_action_wording_pick_user: "ACTION_WORDING_PICK_USER",
        ui_action_wording_pick_suggestion: "ACTION_WORDING_PICK_SUGGESTION",
      },
      ui: {
        contract_id: "purpose:interactive:refine",
        view: { mode: "interactive" },
        feedback_contract: {
          kind: "single_value_compare",
          mode: "text",
          current_label: "Your input",
          suggested_label: "My suggestion",
          current_value: "We want to do something good.",
          suggested_value: "We exist to make complex choices understandable.",
          instruction: "Choose the wording that fits best.",
        },
      },
    },
    expected: {
      visible_card: "compare",
      user_label: "Your input",
      suggestion_label: "My suggestion",
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
        feedback_contract: {
          kind: "single_value_canonical_suggestion",
          mode: "text",
          heading: "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE BESTAANSREDEN VOOR",
          suggested_value: "We exist to make complex choices understandable.",
        },
      },
    },
    expected: {
      visible_card: "semantic",
      main_card_suppressed: false,
      pending_kind: "",
    },
  },
  {
    name: "malformed_compare_fail_closed",
    response: {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
      },
      ui: {
        contract_id: "dream:interactive:refine",
        view: { mode: "interactive" },
        feedback_contract: {
          kind: "single_value_compare",
          mode: "text",
          current_value: "Wij willen bedrijven helpen groeien.",
          suggested_value: "Mindd droomt van bedrijven die vanuit betekenis echte verandering brengen.",
          instruction: "Choose the version that fits best.",
        },
      },
    },
    expected: {
      ok: false,
      visible_card: "contract_failure",
      error_type: "contract_warning",
      reason_code: "ui_pending_interaction_missing_for_compare",
    },
  },
];

for (const fixture of fixtures) {
  test(`compare golden fixture: ${fixture.name}`, () => {
    const finalized = finalizeFixture(fixture.response);
    const proof = extractProof(finalized);
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
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
      user_label: "This is your input:",
      suggestion_label: "This would be my suggestion:",
    },
    {
      name: "dream_self_compare_after_rewrite_backfill",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
      user_label: "Dit is jouw input:",
      suggestion_label: "Dit zou mijn suggestie zijn:",
    },
    {
      name: "dream_builder_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
      user_label: "Keep both statements",
      suggestion_label: "Merge into one statement",
    },
    {
      name: "strategy_grouped_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
      user_label: "Jouw compacte formulering",
      suggestion_label: "Mijn suggestie",
    },
    {
      name: "purpose_single_value_compare",
      visible_card: "compare",
      prompt_hidden: true,
      allowed_roles: ["wording_pick_user", "wording_pick_suggestion"],
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
      name: "malformed_compare_fail_closed",
      visible_card: "contract_failure",
      prompt_hidden: false,
      allowed_roles: [],
      user_label: "",
      suggestion_label: "",
    },
  ]);
});
