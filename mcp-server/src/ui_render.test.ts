import test from "node:test";
import assert from "node:assert/strict";

import {
  actionRoleForStateKey,
  buildInitialDreamScoringScores,
  resolveActionCodeForStateKey,
  resolveActionPayloadModeForStateKey,
  shouldRenderPurposeStepIntroVideo,
  shouldSuppressPromptForWordingChoice,
  shouldSuppressMainCardForWordingChoice,
} from "../ui/lib/ui_render.js";
import { benProfileVideoUrlForLang, dreamStepVideoUrlForLang, purposeStepVideoUrlForLang } from "../ui/lib/ui_constants.js";

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

test("benProfileVideoUrlForLang returns only configured language-specific videos", () => {
  assert.match(benProfileVideoUrlForLang("nl"), /youtube-nocookie\.com\/embed\/5TLxnL2OkQo/);
  assert.match(benProfileVideoUrlForLang("en"), /youtube-nocookie\.com\/embed\/kV4oF2mUZXI/);
  assert.match(benProfileVideoUrlForLang("it"), /youtube-nocookie\.com\/embed\/S7_GwDJZIAs/);
  assert.match(benProfileVideoUrlForLang("de"), /youtube-nocookie\.com\/embed\/T18fvylOojg/);
  assert.match(benProfileVideoUrlForLang("es"), /youtube-nocookie\.com\/embed\/eLSh19ZZ2yM/);
  assert.match(benProfileVideoUrlForLang("fr"), /youtube-nocookie\.com\/embed\/0soI44DLOxY/);
  assert.match(benProfileVideoUrlForLang("ja"), /youtube-nocookie\.com\/embed\/o5Z0e4_Aolg/);
  assert.equal(benProfileVideoUrlForLang("pt-BR"), "");
});

test("dreamStepVideoUrlForLang returns only configured language-specific videos", () => {
  assert.match(dreamStepVideoUrlForLang("nl"), /youtube-nocookie\.com\/embed\/kksn8roVbQg/);
  assert.match(dreamStepVideoUrlForLang("en"), /youtube-nocookie\.com\/embed\/94cmzR2w62o/);
  assert.match(dreamStepVideoUrlForLang("it"), /youtube-nocookie\.com\/embed\/g-fbHy78uIw/);
  assert.match(dreamStepVideoUrlForLang("de"), /youtube-nocookie\.com\/embed\/KtzkZFE4m5Q/);
  assert.match(dreamStepVideoUrlForLang("es"), /youtube-nocookie\.com\/embed\/-36ryKgLiPo/);
  assert.match(dreamStepVideoUrlForLang("fr"), /youtube-nocookie\.com\/embed\/ajUsijJzyiY/);
  assert.equal(dreamStepVideoUrlForLang("pt-BR"), "");
});

test("purposeStepVideoUrlForLang returns only configured language-specific videos", () => {
  assert.match(purposeStepVideoUrlForLang("en"), /youtube-nocookie\.com\/embed\/OhtRcBRmiQ0/);
  assert.match(purposeStepVideoUrlForLang("de"), /youtube-nocookie\.com\/embed\/OfG_T2VDhtg/);
  assert.match(purposeStepVideoUrlForLang("es"), /youtube-nocookie\.com\/embed\/TTU7vAkaVJA/);
  assert.match(purposeStepVideoUrlForLang("fr"), /youtube-nocookie\.com\/embed\/EqoczF4mnGc/);
  assert.match(purposeStepVideoUrlForLang("it"), /youtube-nocookie\.com\/embed\/tISM_mLZDgk/);
  assert.match(purposeStepVideoUrlForLang("nl"), /youtube-nocookie\.com\/embed\/oS0tKfpLaYg/);
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
