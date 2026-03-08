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
