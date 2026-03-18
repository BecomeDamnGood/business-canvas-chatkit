import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepUiPayloadHelpers } from "./run_step_ui_payload.js";

function buildHelpers() {
  return createRunStepUiPayloadHelpers({
    shouldLogLocalDevDiagnostics: () => false,
    pickPrompt: () => "",
    buildTextForWidget: ({ specialist }) => String(specialist.__canonical_text || "").trim(),
    deriveBootstrapContract: () => ({ waiting: false, ready: true, retry_hint: false, phase: "ready" }),
    deriveUiViewPayload: (variant) => (variant === "default" ? null : { variant }),
    sanitizeWidgetActionCodes: (actionCodes) => actionCodes,
    buildRenderedActionsFromMenu: () => [],
    buildQuestionTextFromActions: (prompt) => String(prompt || ""),
    sanitizeEscapeInWidget: (specialist) => specialist,
    isWidgetSuppressedEscapeMenuId: () => false,
    enforcePromptInvariants: ({ specialist }) => specialist,
    isUiI18nV2Enabled: () => false,
    isMenuLabelKeysV1Enabled: () => false,
    isUiI18nV3LangBootstrapEnabled: () => false,
    isUiLocaleMetaV1Enabled: () => false,
    isUiLangSourceResolverV1Enabled: () => false,
    isUiStrictNonEnPendingV1Enabled: () => false,
    isUiStep0LangResetGuardV1Enabled: () => false,
    isUiBootstrapStateV1Enabled: () => false,
    isUiPendingNoFallbackTextV1Enabled: () => false,
    isUiStartTriggerLangResolveV1Enabled: () => false,
    isUiLocaleReadyGateV1Enabled: () => false,
    isUiNoPendingTextSuppressV1Enabled: () => false,
    isUiBootstrapWaitRetryV1Enabled: () => false,
    isUiBootstrapEventParityV1Enabled: () => false,
    isUiBootstrapPollActionV1Enabled: () => false,
    isUiWaitShellV2Enabled: () => false,
    isUiTranslationFastModelV1Enabled: () => false,
    isUiI18nCriticalKeysV1Enabled: () => false,
  });
}

test("attachRegistryPayload emits explicit dream-builder ownership contract for empty canonical body", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        dream_builder_statements: ["One", "Two", "Three", "Four", "Five"],
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      __canonical_text: "",
      message: "Duplicate narrative that should not own the body.",
    }
  );

  assert.equal(payload.text, "");
  assert.equal(payload.ui?.view?.variant, "dream_builder_collect");
  assert.equal(payload.ui?.view?.dream_builder_body_mode, "none");
  assert.equal(payload.ui?.view?.dream_builder_statements_visible, true);
});

test("attachRegistryPayload marks short canonical dream-builder coaching text as support_only", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "Dat is een goed beginpunt.",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        __dream_runtime_mode: "builder_collect",
        dream_builder_statements: ["One", "Two", "Three", "Four", "Five"],
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_MENU_REFINE:v1",
      suggest_dreambuilder: "false",
      __canonical_text: "Dat is een goed beginpunt.",
      message: "Dat is een goed beginpunt.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "dream_builder_collect");
  assert.equal(payload.ui?.view?.dream_builder_body_mode, "support_only");
  assert.equal(payload.ui?.view?.dream_builder_statements_visible, true);
});

test("attachRegistryPayload keeps statements visible while dream-builder scoring is active", () => {
  const helpers = buildHelpers();
  const statements = Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`);
  const payload = helpers.attachRegistryPayload(
    {
      text: "Score each statement.",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_scoring",
        dream_builder_statements: statements,
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      scoring_phase: "true",
      statements,
      clusters: [
        {
          theme: "Future",
          statement_indices: statements.map((_, index) => index),
        },
      ],
      __canonical_text: "Score each statement.",
      message: "Score each statement.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "dream_builder_scoring");
  assert.equal(payload.ui?.view?.dream_builder_statements_visible, true);
});

test("attachRegistryPayload keeps accepted dream score submits in refine even when stale scoring specialist fields remain", () => {
  const helpers = buildHelpers();
  const statements = Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`);
  const payload = helpers.attachRegistryPayload(
    {
      text: "Mindd droomt van een wereld waarin vertrouwen richting geeft.",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_refine",
        dream_awaiting_direction: "false",
        dream_builder_statements: statements,
        dream_scores: [[9, 8], [7, 7]],
        dream_top_clusters: [{ theme: "Vertrouwen", average: 8.5 }],
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      scoring_phase: "true",
      statements,
      clusters: [
        {
          theme: "Future",
          statement_indices: statements.map((_, index) => index),
        },
      ],
      __canonical_text: "Mindd droomt van een wereld waarin vertrouwen richting geeft.",
      message: "Mindd droomt van een wereld waarin vertrouwen richting geeft.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "dream_builder_refine");
});

test("attachRegistryPayload keeps Dream Builder statements visible at 20+ until scoring is actually active", () => {
  const helpers = buildHelpers();
  const statements = Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`);
  const payload = helpers.attachRegistryPayload(
    {
      text: "Wat zie je nog meer veranderen?",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_collect",
        dream_builder_statements: statements,
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      scoring_phase: "false",
      statements: [],
      clusters: [],
      __canonical_text: "",
      message: "Wat zie je nog meer veranderen?",
    }
  );

  assert.equal(payload.ui?.view?.variant, "dream_builder_collect");
  assert.equal(payload.ui?.view?.dream_builder_statements_visible, true);
  assert.deepEqual(payload.ui?.dream_builder_contract?.statements, statements);
  assert.equal(payload.ui?.dream_builder_contract?.statements_visible, true);
});

test("attachRegistryPayload emits explicit Dream Builder compare ownership contracts", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "Kies welke formulering past.",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_collect",
        dream_builder_statements: ["Statement 1", "Statement 2"],
      } as any,
    },
    {
      ui_contract_id: "dream:incomplete_output:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      __dream_builder_compare_pending: "true",
      __dream_builder_compare_kind: "overlap_merge_compare",
      __dream_builder_compare_rationale: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
      __dream_builder_compare_current_label: "Keep both statements",
      __dream_builder_compare_suggested_label: "Merge into one statement",
      __dream_builder_compare_current_items: [
        "I want my work to make a positive difference in people's lives.",
      ],
      __dream_builder_compare_suggested_items: [
        "Over 5 tot 10 jaar zal positieve impact op het leven van anderen belangrijker worden.",
      ],
      __dream_builder_compare_instruction: "Choose the version that fits best.",
      __dream_builder_compare_segments: [{ kind: "unit", unit_id: "unit_1" }],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      compare_feedback: {
        text: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
      },
      user_text: "",
      suggestion_text: "",
      user_label: "Keep both statements",
      suggestion_label: "Merge into one statement",
      user_items: ["I want my work to make a positive difference in people's lives."],
      suggestion_items: ["Over 5 tot 10 jaar zal positieve impact op het leven van anderen belangrijker worden."],
      instruction: "Choose the version that fits best.",
    }
  );

  assert.deepEqual(payload.ui?.dream_builder_contract, {
    version: "2026-03-17.dream_builder_contract.v2",
    phase: "compare",
    statements: ["Statement 1", "Statement 2"],
    statements_visible: true,
    body_mode: "none",
    compare: {
      kind: "overlap_merge_compare",
      rationale: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
      current_label: "Keep both statements",
      suggested_label: "Merge into one statement",
      current_value: "I want my work to make a positive difference in people's lives.",
      suggested_value: "Over 5 tot 10 jaar zal positieve impact op het leven van anderen belangrijker worden.",
      current_items: ["I want my work to make a positive difference in people's lives."],
      suggested_items: ["Over 5 tot 10 jaar zal positieve impact op het leven van anderen belangrijker worden."],
      instruction: "Choose the version that fits best.",
    },
  });
  assert.equal(payload.ui?.view?.variant, "dream_builder_collect");
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload forwards structured single-value content into ui.content", () => {
  const helpers = buildHelpers();
  const canonical = "Een strategisch reclamebureau voor complexe keuzes";
  const payload = helpers.attachRegistryPayload(
    {
      text: [ "Wat denk je van de formulering", canonical ].join("\n"),
      prompt: "",
      current_step_id: "entity",
      state: {
        current_step: "entity",
        active_specialist: "Entity",
      } as any,
    },
    {
      ui_contract_id: "entity:valid_output:ENTITY_MENU_CONFIRM_SINGLE:v1",
      __canonical_text: canonical,
      message: [ "Wat denk je van de formulering", canonical ].join("\n"),
      ui_content: {
        kind: "single_value",
        heading: "Wat denk je van de formulering",
        canonical_text: canonical,
      },
    }
  );

  assert.deepEqual(payload.ui?.content, {
    kind: "single_value",
    heading: "Wat denk je van de formulering",
    canonical_text: canonical,
  });
});

test("attachRegistryPayload never emits legacy wording-choice payloads for Dream Builder when the contract is present", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "Kies welke formulering past.",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_collect",
        dream_builder_statements: ["Statement 1", "Statement 2"],
      } as any,
    },
    {
      ui_contract_id: "dream:incomplete_output:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      suggest_dreambuilder: "true",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_variant: "grouped_list_units",
      __dream_builder_compare_pending: "true",
      __dream_builder_compare_kind: "batch_rewrite_compare",
      __dream_builder_compare_rationale: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
      __dream_builder_compare_current_items: ["I want to help people solve a problem they truly care about."],
      __dream_builder_compare_suggested_items: ["Over 5 tot 10 jaar zoeken mensen steeds meer naar oplossingen die voor hen echt betekenisvol zijn."],
      __dream_builder_compare_instruction: "Choose the version that fits best.",
      __dream_builder_compare_segments: [{ kind: "retained", items: ["Statement 1", "Statement 2"] }],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      user_text: "legacy user",
      suggestion_text: "legacy suggestion",
      user_items: ["legacy user"],
      suggestion_items: ["legacy suggestion"],
      instruction: "legacy pick one",
    }
  );

  assert.equal(payload.ui?.view?.variant, "dream_builder_collect");
  assert.ok(payload.ui?.dream_builder_contract);
  assert.equal("wording_choice" in (payload.ui || {}), false);
  assert.equal(payload.ui?.flags?.require_wording_pick, true);
});

test("attachRegistryPayload does not publish Dream Builder contract in self mode just because resume statements exist", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: [
        "Ga verder met de Droom-oefening.",
        "Dat is een sterke manier om te beginnen.",
      ].join("\n\n"),
      prompt: "Definieer je droom voor Mindd of kies een optie.",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        __dream_runtime_mode: "self",
        dream_builder_statements: ["Statement 1", "Statement 2"],
      } as any,
    },
    {
      ui_contract_id: "dream:no_output:DREAM_MENU_INTRO:v1",
      suggest_dreambuilder: "false",
      message: [
        "Ga verder met de Droom-oefening.",
        "Dat is een sterke manier om te beginnen.",
      ].join("\n\n"),
      question: "",
      refined_formulation: "",
      dream: "",
    }
  );

  assert.equal(payload.ui?.view?.variant, undefined);
  assert.equal(payload.ui?.view?.dream_builder_statements_visible, undefined);
  assert.equal(payload.ui?.dream_builder_contract, undefined);
});

test("attachRegistryPayload forwards structured suggestion content into ui.content", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "fallback text",
      prompt: "",
      current_step_id: "bigwhy",
      state: {
        current_step: "bigwhy",
        active_specialist: "BigWhy",
      } as any,
    },
    {
      ui_contract_id: "bigwhy:no_output:BIGWHY_MENU_FROM_GIVE:v1",
      __canonical_text: "fallback text",
      message: "fallback text",
      ui_content: {
        kind: "structured_suggestions",
        heading: "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN VOOR MINDD",
        items: [
          "Voorstel 1",
          "Voorstel 2",
          "Voorstel 3",
        ],
        outro: "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
        item_style: "bullets",
      },
    }
  );

  assert.deepEqual(payload.ui?.content, {
    kind: "structured_suggestions",
    heading: "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN VOOR MINDD",
    items: ["Voorstel 1", "Voorstel 2", "Voorstel 3"],
    outro: "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
    item_style: "bullets",
  });
});

test("attachRegistryPayload forwards explicit single-value feedback contracts into ui.feedback_contract", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "",
      current_step_id: "purpose",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
      } as any,
    },
    {
      ui_contract_id: "purpose:valid_output:PURPOSE_MENU_REFINE:v1",
      ui_feedback_contract: {
        kind: "single_value_canonical_suggestion",
        heading: "Op basis van je input stel ik de volgende bestaansreden voor:",
        suggested_value: "Mindd bestaat om complexe keuzes begrijpelijk en menselijk te maken.",
        rationale: "Ik heb de formulering zachter en vriendelijker gemaakt.",
      },
    }
  );

  assert.deepEqual(payload.ui?.feedback_contract, {
    version: "2026-03-16.feedback_contract.v1",
    kind: "single_value_canonical_suggestion",
    mode: "text",
    heading: "Op basis van je input stel ik de volgende bestaansreden voor:",
    suggested_value: "Mindd bestaat om complexe keuzes begrijpelijk en menselijk te maken.",
    rationale: "Ik heb de formulering zachter en vriendelijker gemaakt.",
  });
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload synthesizes compare feedback contracts from wording-choice payloads and omits the legacy UI shadow", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "",
      current_step_id: "strategy",
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
      } as any,
    },
    {
      ui_contract_id: "strategy:valid_output:STRATEGY_MENU_CONFIRM:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_variant: "grouped_list_units",
      wording_choice_user_label: "Jouw compacte formulering",
      wording_choice_suggestion_label: "Mijn suggestie",
      wording_choice_user_items: ["Punt 1", "Punt 2"],
      wording_choice_suggestion_items: ["Voorstel A"],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      compare_feedback: {
        text: "Ik heb de resterende strategische keuze scherper gemaakt.",
      },
      user_text: "",
      suggestion_text: "",
      user_label: "Jouw compacte formulering",
      suggestion_label: "Mijn suggestie",
      user_items: ["Punt 1", "Punt 2"],
      suggestion_items: ["Voorstel A"],
      instruction: "Kies de versie die het beste past.",
    }
  );

  assert.deepEqual(payload.ui?.feedback_contract, {
    version: "2026-03-16.feedback_contract.v1",
    kind: "grouped_list_compare",
    mode: "list",
    rationale: "Ik heb de resterende strategische keuze scherper gemaakt.",
    current_label: "Jouw compacte formulering",
    suggested_label: "Mijn suggestie",
    current_items: ["Punt 1", "Punt 2"],
    suggested_items: ["Voorstel A"],
    instruction: "Kies de versie die het beste past.",
  });
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload preserves compare rationale and retained items from feedback_reason_text-driven wording-choice payloads", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "DreamExplainer",
      } as any,
    },
    {
      ui_contract_id: "dream:incomplete_output:DREAM_EXPLAINER_MENU_SWITCH_SELF:v1",
      __dream_builder_compare_pending: "true",
      __dream_builder_compare_kind: "batch_rewrite_compare",
      __dream_builder_compare_rationale: "Dream Builder vraagt hier om een bredere maatschappelijke verschuiving.",
      __dream_builder_compare_current_label: "Jouw compacte formulering",
      __dream_builder_compare_suggested_label: "Mijn suggestie",
      __dream_builder_compare_retained_heading: "Deze punten blijven al in de definitieve lijst:",
      __dream_builder_compare_current_items: ["I want to help people solve a problem they truly care about."],
      __dream_builder_compare_suggested_items: [
        "Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen.",
      ],
      __dream_builder_compare_instruction: "Kies de versie die het beste past bij het resterende verschil.",
      __dream_builder_compare_segments: [
        {
          kind: "retained",
          items: ["Eerder punt 1", "Eerder punt 2"],
        },
        { kind: "unit", unit_id: "unit_1" },
      ],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      user_text: "I want to help people solve a problem they truly care about.",
      suggestion_text: "Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen.",
      feedback_reason_text: "Dream Builder vraagt hier om een bredere maatschappelijke verschuiving.",
      user_label: "Jouw compacte formulering",
      suggestion_label: "Mijn suggestie",
      user_items: ["I want to help people solve a problem they truly care about."],
      suggestion_items: [
        "Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen.",
      ],
      instruction: [
        "Deze punten blijven al in de definitieve lijst:",
        "• Eerder punt 1",
        "• Eerder punt 2",
        "",
        "Kies de versie die het beste past bij het resterende verschil.",
      ].join("\n"),
    } as any
  );

  assert.equal(payload.ui?.feedback_contract, undefined);
  assert.deepEqual(payload.ui?.dream_builder_contract, {
    version: "2026-03-17.dream_builder_contract.v2",
    phase: "compare",
    statements: [],
    statements_visible: false,
    body_mode: "none",
    compare: {
      kind: "batch_rewrite_compare",
      rationale: "Dream Builder vraagt hier om een bredere maatschappelijke verschuiving.",
      current_label: "Jouw compacte formulering",
      suggested_label: "Mijn suggestie",
      current_value: "I want to help people solve a problem they truly care about.",
      suggested_value: "Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen.",
      current_items: ["I want to help people solve a problem they truly care about."],
      suggested_items: ["Over 5 tot 10 jaar zullen meer mensen hulp zoeken voor problemen die er echt toe doen."],
      retained_heading: "Deze punten blijven al in de definitieve lijst:",
      retained_items: ["Eerder punt 1", "Eerder punt 2"],
      instruction: "Kies de versie die het beste past bij het resterende verschil.",
    },
  });
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload keeps Dream single-value ui.content when stale canonical wording-choice state is present", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd droomt van een wereld waarin keuzes rust geven.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "canonical",
      wording_choice_target_field: "dream",
      wording_choice_user_normalized: "Wij willen bedrijven helpen groeien.",
      wording_choice_agent_current: canonical,
      ui_content: {
        kind: "single_value",
        heading: "JE HUIDIGE DROOM VOOR MINDD IS",
        canonical_text: canonical,
      },
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      user_text: "Wij willen bedrijven helpen groeien.",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Kies welke formulering je wilt gebruiken.",
    }
  );

  assert.notEqual(payload.ui?.view?.variant, "wording_choice");
  assert.deepEqual(payload.ui?.content, {
    kind: "single_value",
    heading: "JE HUIDIGE DROOM VOOR MINDD IS",
    canonical_text: canonical,
  });
  assert.equal(payload.ui?.feedback_contract, undefined);
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload restores Dream single-value compare feedback contracts for active wording-choice picker state", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd droomt van een wereld waarin keuzes rust geven.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "dream",
      wording_choice_user_normalized: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
      wording_choice_agent_current: canonical,
      ui_content: {
        kind: "single_value",
        heading: "JE HUIDIGE DROOM VOOR MINDD IS",
        canonical_text: canonical,
      },
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      user_text: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Kies welke formulering je wilt gebruiken.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(payload.ui?.content, undefined);
  assert.equal(String(payload.ui?.feedback_contract?.kind || ""), "single_value_compare");
  assert.equal(
    String(payload.ui?.feedback_contract?.current_value || ""),
    "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden."
  );
  assert.equal(String(payload.ui?.feedback_contract?.suggested_value || ""), canonical);
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload backfills Dream compare current_value from specialist wording-choice state when override user_text is blank", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd droomt van een wereld waarin mensen zich goed geinformeerd en veilig voelen.";
  const userInput = "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "dream",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
      } as any,
    },
    {
      ui_contract_id: "dream:ASK:DREAM_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "dream",
      wording_choice_user_normalized: userInput,
      wording_choice_agent_current: canonical,
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      user_text: "",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Kies welke formulering je wilt gebruiken.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(String(payload.ui?.feedback_contract?.kind || ""), "single_value_compare");
  assert.equal(String(payload.ui?.feedback_contract?.current_value || ""), userInput);
  assert.equal(String(payload.ui?.feedback_contract?.suggested_value || ""), canonical);
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload backfills non-Dream compare current_value from specialist wording-choice state when override user_text is blank", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd exists to make complex choices understandable.";
  const userInput = "We want to do something good.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "purpose",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
      } as any,
    },
    {
      ui_contract_id: "purpose:ASK:PURPOSE_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "purpose",
      wording_choice_user_normalized: userInput,
      wording_choice_agent_current: canonical,
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      user_text: "",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Choose the wording that fits best.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(String(payload.ui?.feedback_contract?.kind || ""), "single_value_compare");
  assert.equal(String(payload.ui?.feedback_contract?.current_value || ""), userInput);
  assert.equal(String(payload.ui?.feedback_contract?.suggested_value || ""), canonical);
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload suppresses single-value ui.content while wording-choice picker is active for non-Dream steps", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd bestaat om complexe keuzes begrijpelijk te maken.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "purpose",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
      } as any,
    },
    {
      ui_contract_id: "purpose:ASK:PURPOSE_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "purpose",
      wording_choice_user_normalized: "Wij willen iets goeds doen.",
      wording_choice_agent_current: canonical,
      ui_content: {
        kind: "single_value",
        heading: "JE HUIDIGE BESTAANSREDEN VOOR MINDD IS",
        canonical_text: canonical,
      },
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      user_text: "Wij willen iets goeds doen.",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Kies welke formulering je wilt gebruiken.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(payload.ui?.content, undefined);
  assert.equal(String(payload.ui?.feedback_contract?.kind || ""), "single_value_compare");
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload omits questionText while wording-choice picker is active", () => {
  const helpers = buildHelpers();
  const canonical = "Build recurring revenue with implementation retainers.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "Waar focus je nog meer op binnen je strategie?",
      current_step_id: "strategy",
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
      } as any,
    },
    {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_ASK_MORE:v1",
      question: "Waar focus je nog meer op binnen je strategie?",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "strategy",
      wording_choice_user_items: ["Recurring revenue through retainers"],
      wording_choice_suggestion_items: [canonical],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      user_text: "Recurring revenue through retainers",
      suggestion_text: canonical,
      user_items: ["Recurring revenue through retainers"],
      suggestion_items: [canonical],
      instruction: "Kies de versie die het beste past bij het resterende verschil.",
    }
  );

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(Object.prototype.hasOwnProperty.call(payload.ui || {}, "questionText"), false);
});

test("attachRegistryPayload preserves explicit compare feedback in wording-choice payloads", () => {
  const helpers = buildHelpers();
  const canonical = "Mindd exists to make complex choices understandable.";
  const payload = helpers.attachRegistryPayload(
    {
      text: canonical,
      prompt: "",
      current_step_id: "purpose",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
      } as any,
    },
    {
      ui_contract_id: "purpose:ASK:PURPOSE_MENU_REFINE:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "purpose",
      wording_choice_user_normalized: "We want to do something good.",
      wording_choice_agent_current: canonical,
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "text",
      compare_feedback: {
        text: "The current wording is still too broad and does not yet show the contribution clearly.",
      },
      user_text: "We want to do something good.",
      suggestion_text: canonical,
      user_items: [],
      suggestion_items: [],
      instruction: "Choose the wording that fits best.",
    }
  );

  assert.equal(
    String(payload.ui?.feedback_contract?.rationale || ""),
    "The current wording is still too broad and does not yet show the contribution clearly."
  );
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload preserves grouped compare feedback in wording-choice payloads", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "",
      prompt: "",
      current_step_id: "strategy",
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
      } as any,
    },
    {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_CONFIRM:v1",
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "strategy",
      wording_choice_user_items: ["Operational simplicity"],
      wording_choice_suggestion_items: ["Operational focus"],
    },
    { require_wording_pick: true },
    [],
    [],
    {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      compare_feedback: {
        text: "This suggestion sharpens the remaining strategic difference into one clearer choice.",
      },
      user_text: "Operational simplicity",
      suggestion_text: "Operational focus",
      user_items: ["Operational simplicity"],
      suggestion_items: ["Operational focus"],
      instruction: "Choose the version that fits best for the remaining difference.",
    }
  );

  assert.equal(
    String(payload.ui?.feedback_contract?.rationale || ""),
    "This suggestion sharpens the remaining strategic difference into one clearer choice."
  );
  assert.equal("wording_choice" in (payload.ui || {}), false);
});

test("attachRegistryPayload keeps legacy payloads renderable when ui.content is absent", () => {
  const helpers = buildHelpers();
  const payload = helpers.attachRegistryPayload(
    {
      text: "Vrije bodytekst zonder structured content.",
      prompt: "",
      current_step_id: "purpose",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
      } as any,
    },
    {
      ui_contract_id: "purpose:ASK:PURPOSE_MENU_QUESTIONS:v1",
      __canonical_text: "Vrije bodytekst zonder structured content.",
      message: "Vrije bodytekst zonder structured content.",
    }
  );

  assert.equal(payload.text, "Vrije bodytekst zonder structured content.");
  assert.equal(payload.ui?.content, undefined);
});
