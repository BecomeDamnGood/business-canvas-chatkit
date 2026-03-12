import test from "node:test";
import assert from "node:assert/strict";

import {
  actionRoleForStateKey,
  buildInitialDreamScoringScores,
  dreamExerciseButtonLabelKeyForState,
  parseWordingChoiceInstruction,
  resolveActionCodeForStateKey,
  resolveActionPayloadModeForStateKey,
  shouldRetainDreamScoringClientScores,
  shouldRenderPurposeStepIntroVideo,
  shouldShowTextInputForWordingChoice,
  shouldSuppressPromptForWordingChoice,
  shouldSuppressMainCardForWordingChoice,
} from "../ui/lib/ui_render.js";
import {
  benProfileVideoUrlForLang,
  dreamStepVideoUrlForLang,
  purposeStepVideoUrlForLang,
} from "../ui/lib/ui_constants.js";

test("shouldSuppressMainCardForWordingChoice suppresses the main card for wording-choice view variants", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice({}, "wording_choice"),
    true
  );
});

test("shouldSuppressMainCardForWordingChoice suppresses the main card for explicit picker payloads", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        wording_choice: {
          enabled: true,
        },
      },
      "default"
    ),
    true
  );
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        flags: {
          require_wording_pick: true,
        },
      },
      "default"
    ),
    true
  );
});

test("shouldSuppressMainCardForWordingChoice keeps the main card enabled for non-picker payloads", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        content: {
          kind: "single_value",
          heading: "Wat denk je van deze formulering",
        },
      },
      "default"
    ),
    false
  );
});

test("shouldSuppressPromptForWordingChoice hides the prompt while wording-choice is active", () => {
  assert.equal(
    shouldSuppressPromptForWordingChoice({
      uiViewVariant: "wording_choice",
      wordingChoiceActive: true,
      requireWordingPick: true,
    }),
    true
  );
  assert.equal(
    shouldSuppressPromptForWordingChoice({
      uiViewVariant: "default",
      wordingChoiceActive: false,
      requireWordingPick: false,
    }),
    false
  );
});

test("shouldShowTextInputForWordingChoice hides free input while a wording-choice picker is active", () => {
  assert.equal(
    shouldShowTextInputForWordingChoice({
      textSubmitAvailable: true,
      uiViewVariant: "wording_choice",
      wordingChoiceActive: true,
      requireWordingPick: true,
    }),
    false
  );
  assert.equal(
    shouldShowTextInputForWordingChoice({
      textSubmitAvailable: true,
      uiViewVariant: "default",
      wordingChoiceActive: false,
      requireWordingPick: false,
    }),
    true
  );
});

test("parseWordingChoiceInstruction separates retained bullets from the picker instruction", () => {
  const parsed = parseWordingChoiceInstruction([
    "These points already stay in the final list:",
    "",
    "• Strategisch bedrijfs- en communicatieadvies",
    "• Traditionele communicatiediensten (zoals DTP, posters, campagnes)",
    "",
    "Choose the version that fits best for the remaining difference.",
  ].join("\n"));

  assert.equal(parsed.retainedHeading, "These points already stay in the final list:");
  assert.deepEqual(parsed.retainedItems, [
    "Strategisch bedrijfs- en communicatieadvies",
    "Traditionele communicatiediensten (zoals DTP, posters, campagnes)",
  ]);
  assert.equal(parsed.instructionText, "Choose the version that fits best for the remaining difference.");
});

test("resolveActionCodeForStateKey falls back to action contract when lean state omits start action", () => {
  const result = {
    ui: {
      action_contract: {
        actions: [
          {
            role: "start",
            action_code: "ACTION_START",
          },
        ],
      },
    },
  };

  assert.equal(actionRoleForStateKey("ui_action_start"), "start");
  assert.equal(resolveActionCodeForStateKey(result, {}, "ui_action_start"), "ACTION_START");
});

test("resolveActionCodeForStateKey keeps state fallback when action contract is absent", () => {
  assert.equal(
    resolveActionCodeForStateKey({}, { ui_action_dream_switch_to_self: "__ROUTE__DREAM_SWITCH_TO_SELF__" }, "ui_action_dream_switch_to_self"),
    "__ROUTE__DREAM_SWITCH_TO_SELF__"
  );
});

test("resolveActionPayloadModeForStateKey falls back to action contract payload mode for text submit", () => {
  const result = {
    ui: {
      action_contract: {
        actions: [
          {
            role: "text_submit",
            action_code: "ACTION_SUBMIT",
            payload_mode: "scores",
          },
        ],
      },
    },
  };

  assert.equal(resolveActionPayloadModeForStateKey(result, {}, "ui_action_text_submit"), "scores");
});

test("resolveActionCodeForStateKey resolves dedicated score submit actions from the action contract", () => {
  const result = {
    ui: {
      action_contract: {
        actions: [
          {
            role: "text_submit",
            action_code: "ACTION_TEXT_SUBMIT",
            payload_mode: "text",
          },
          {
            role: "score_submit",
            action_code: "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES",
          },
        ],
      },
    },
  };

  assert.equal(actionRoleForStateKey("ui_action_score_submit"), "score_submit");
  assert.equal(resolveActionCodeForStateKey(result, {}, "ui_action_score_submit"), "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES");
  assert.equal(resolveActionCodeForStateKey(result, {}, "ui_action_text_submit"), "ACTION_TEXT_SUBMIT");
  assert.equal(resolveActionPayloadModeForStateKey(result, {}, "ui_action_text_submit"), "text");
});

test("buildInitialDreamScoringScores reuses persisted dream scores when client cache is empty", () => {
  const scores = buildInitialDreamScoringScores({
    clientScores: [],
    persistedScores: [[8, 9], [7]],
    clusters: [
      { statement_indices: [0, 1] },
      { statement_indices: [2] },
    ],
  });

  assert.deepEqual(scores, [["8", "9"], ["7"]]);
});

test("buildInitialDreamScoringScores prefers in-progress client values over persisted dream scores", () => {
  const scores = buildInitialDreamScoringScores({
    clientScores: [[4, ""], ["10"]],
    persistedScores: [[8, 9], [7]],
    clusters: [
      { statement_indices: [0, 1] },
      { statement_indices: [2] },
    ],
  });

  assert.deepEqual(scores, [["4", ""], ["10"]]);
});

test("buildInitialDreamScoringScores keeps client-entered values during a scoring rerender before persisted scores arrive", () => {
  const scores = buildInitialDreamScoringScores({
    clientScores: [[9, 8], [7, 7]],
    persistedScores: [],
    clusters: [
      { statement_indices: [0, 1] },
      { statement_indices: [2, 3] },
    ],
  });

  assert.deepEqual(scores, [["9", "8"], ["7", "7"]]);
});

test("dreamExerciseButtonLabelKeyForState keeps start copy for first-time Dream Builder entry", () => {
  assert.equal(dreamExerciseButtonLabelKeyForState({}), "dreamBuilder.startExercise");
});

test("dreamExerciseButtonLabelKeyForState switches to resume copy when Dream Builder context can be resumed", () => {
  assert.equal(
    dreamExerciseButtonLabelKeyForState({
      dream_builder_statements: ["Statement 1", "Statement 2"],
    }),
    "dreamBuilder.resumeExercise"
  );
  assert.equal(
    dreamExerciseButtonLabelKeyForState({
      dream_scoring_statements: Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`),
      dream_top_clusters: [{ theme: "Trust", average: 8.5 }],
      dream_scores: [[9, 8]],
    }),
    "dreamBuilder.resumeExercise"
  );
});

test("shouldRetainDreamScoringClientScores only keeps the buffer while dream scoring is still visible", () => {
  assert.equal(
    shouldRetainDreamScoringClientScores({
      currentStep: "dream",
      isScoringView: true,
    }),
    true
  );
  assert.equal(
    shouldRetainDreamScoringClientScores({
      currentStep: "dream",
      isScoringView: false,
    }),
    false
  );
  assert.equal(
    shouldRetainDreamScoringClientScores({
      currentStep: "purpose",
      isScoringView: true,
    }),
    false
  );
});

test("benProfileVideoUrlForLang returns only configured language-specific videos", () => {
  assert.equal(
    benProfileVideoUrlForLang("nl"),
    "https://mycanvasvideos.s3.amazonaws.com/Over%20Ben%20Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("en"),
    "https://mycanvasvideos.s3.amazonaws.com/About%20Ben%20Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("it"),
    "https://mycanvasvideos.s3.amazonaws.com/Su%20Ben%20Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("de"),
    "https://mycanvasvideos.s3.amazonaws.com/Uber%20Ben%20Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("es"),
    "https://mycanvasvideos.s3.amazonaws.com/Acerca%20de%20Ben%20Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("fr"),
    "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/A%CC%80_propos_de_Ben_Steenstra.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("ja"),
    "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/%E3%80%8C%E3%83%98%E3%82%99%E3%83%B3%E3%83%BB%E3%82%B9%E3%83%86%E3%82%A3%E3%83%BC%E3%83%B3%E3%82%B9%E3%83%88%E3%83%A9%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6%E3%80%8D.mp4"
  );
  assert.equal(
    benProfileVideoUrlForLang("ru"),
    "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/%D0%9E%20%D0%91%D0%B5%D0%BD%D0%B5%20%D0%A1%D1%82%D0%B5%D0%BD%D1%81%D1%82%D1%80%D0%B5.mp4"
  );
  assert.equal(benProfileVideoUrlForLang("pt-BR"), "");
});

test("dreamStepVideoUrlForLang returns only configured language-specific videos", () => {
  assert.equal(
    dreamStepVideoUrlForLang("nl"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/Over%20de%20Droom%20Stap.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("en"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/About%20the%20Dream%20Step.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("it"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/Sul%20passo%20del%20Sogno.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("de"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/U%CC%88ber%20den%20Schritt%20%E2%80%9ETraum%E2%80%9C.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("es"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/Sobre%20el%20paso%20del%20Suen%CC%83o.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("fr"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/A%CC%80%20propos%20du%20Re%CC%82ve.mp4"
  );
  assert.equal(
    dreamStepVideoUrlForLang("ru"),
    "https://mycanvasvideos.s3.amazonaws.com/dream/%D0%9E%20%D1%88%D0%B0%D0%B3%D0%B5%20%C2%AB%D0%9C%D0%B5%D1%87%D1%82%D0%B0%C2%BB.mp4"
  );
  assert.equal(dreamStepVideoUrlForLang("pt-BR"), "");
});

test("purposeStepVideoUrlForLang returns only configured language-specific videos", () => {
  assert.equal(
    purposeStepVideoUrlForLang("en"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/About%20Purpose.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("de"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/U%CC%88ber_den_Daseinsgrund.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("es"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/Sobre_el_propo%CC%81sito_de_existir.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("fr"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/A%CC%80_propos_de_la_raison_d%E2%80%99e%CC%82tre.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("it"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/Sul%20perche%CC%81%20di%20esistere.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("nl"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/Over%20je%20bestaansrecht.mp4"
  );
  assert.equal(
    purposeStepVideoUrlForLang("ru"),
    "https://mycanvasvideos.s3.amazonaws.com/purpose/%D0%9E%20%D1%88%D0%B0%D0%B3%D0%B5%20%C2%AB%D0%9F%D1%80%D0%B5%D0%B4%D0%BD%D0%B0%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%C2%BB.mp4"
  );
});

test("shouldRenderPurposeStepIntroVideo returns true for configured languages in intro state", () => {
  assert.equal(
    shouldRenderPurposeStepIntroVideo({
      currentStep: "purpose",
      showStepIntroChrome: true,
      wordingChoiceActive: false,
      lang: "nl",
    }),
    true
  );
});

test("shouldRenderPurposeStepIntroVideo returns false for languages without a configured purpose video", () => {
  assert.equal(
    shouldRenderPurposeStepIntroVideo({
      currentStep: "purpose",
      showStepIntroChrome: true,
      wordingChoiceActive: false,
      lang: "pt-BR",
    }),
    false
  );
});

test("shouldRenderPurposeStepIntroVideo returns false outside intro state or while wording-choice is active", () => {
  assert.equal(
    shouldRenderPurposeStepIntroVideo({
      currentStep: "purpose",
      showStepIntroChrome: false,
      wordingChoiceActive: false,
      lang: "en",
    }),
    false
  );
  assert.equal(
    shouldRenderPurposeStepIntroVideo({
      currentStep: "purpose",
      showStepIntroChrome: true,
      wordingChoiceActive: true,
      lang: "en",
    }),
    false
  );
});
