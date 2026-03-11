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

test("attachRegistryPayload suppresses single-value ui.content while wording-choice picker is active", () => {
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

  assert.equal(payload.ui?.view?.variant, "wording_choice");
  assert.equal(payload.ui?.content, undefined);
  assert.equal(payload.ui?.wording_choice?.enabled, true);
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
