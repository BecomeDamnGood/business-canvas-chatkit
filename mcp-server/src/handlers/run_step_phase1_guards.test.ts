import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldIncludeBigWhyGlossary,
  shouldIncludeGlossaryForInternalRoute,
} from "./specialist_dispatch.js";
import {
  shouldAttemptDreamForceRefine,
  shouldClassifyDreamAcceptedOutputTurn,
} from "./run_step_pipeline.js";
import {
  resolveStartPrestartRouteMode,
  shouldHydrateStep0BootstrapFromSpecialist,
} from "./run_step_routes.js";
import { buildStep0BootstrapSpecialistInput } from "../steps/step_0_bootstrap.js";
import { DREAM_SPECIALIST } from "../steps/dream.js";
import { BIGWHY_SPECIALIST } from "../steps/bigwhy.js";
import { DREAM_EXPLAINER_SPECIALIST } from "../steps/dream_explainer.js";
import { STRATEGY_SPECIALIST } from "../steps/strategy.js";

test("dream force-refine stays off when a valid candidate already exists", () => {
  const shouldRepair = shouldAttemptDreamForceRefine({
    isOfftopic: false,
    isMetaFallback: false,
    hasContributingInput: true,
    candidateMissing: false,
  });

  assert.equal(shouldRepair, false);
});

test("dream force-refine only activates when all repair preconditions are true", () => {
  const shouldRepair = shouldAttemptDreamForceRefine({
    isOfftopic: false,
    isMetaFallback: false,
    hasContributingInput: true,
    candidateMissing: true,
  });

  assert.equal(shouldRepair, true);
});

test("dream accepted-output classifier is skipped when a valid candidate already exists", () => {
  const shouldClassify = shouldClassifyDreamAcceptedOutputTurn({
    isOfftopic: false,
    isMetaFallback: false,
    candidateMissing: false,
  });

  assert.equal(shouldClassify, false);
});

test("dream accepted-output classifier only runs when candidate repair is semantically possible", () => {
  const shouldClassify = shouldClassifyDreamAcceptedOutputTurn({
    isOfftopic: false,
    isMetaFallback: false,
    candidateMissing: true,
  });

  assert.equal(shouldClassify, true);
});

test("BigWhy keeps glossary disabled for __SHORTEN_BIGWHY__ repair calls", () => {
  assert.equal(
    shouldIncludeBigWhyGlossary("__SHORTEN_BIGWHY__ make this shorter"),
    false
  );
  assert.equal(
    shouldIncludeBigWhyGlossary("Help me refine my big why"),
    true
  );
});

test("internal Dream repair route disables glossary while normal Dream turns keep it", () => {
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_SPECIALIST,
      "__ROUTE__DREAM_FORCE_REFINE__ refine this"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_SPECIALIST,
      "Ik wil een droom formuleren"
    ),
    true
  );
});

test("internal DreamExplainer repair routes disable glossary while normal explainer turns keep it", () => {
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_EXPLAINER_SPECIALIST,
      "__ROUTE__DREAM_EXPLAINER_MULTI_REWRITE_REPAIR__"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_EXPLAINER_SPECIALIST,
      "__ROUTE__DREAM_EXPLAINER_OVERLAP_REPAIR__"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_EXPLAINER_SPECIALIST,
      "__ROUTE__DREAM_EXPLAINER_CLUSTER_THEME_REPAIR__"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      DREAM_EXPLAINER_SPECIALIST,
      "Help me mijn wensenset te structureren"
    ),
    true
  );
});

test("strategy consolidate disables glossary while normal strategy turns keep it", () => {
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      STRATEGY_SPECIALIST,
      "__ROUTE__STRATEGY_CONSOLIDATE__"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      STRATEGY_SPECIALIST,
      "Help me een strategie kiezen"
    ),
    true
  );
});

test("BigWhy internal helper preserves the existing shorten exception", () => {
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      BIGWHY_SPECIALIST,
      "__SHORTEN_BIGWHY__ maak dit compacter"
    ),
    false
  );
  assert.equal(
    shouldIncludeGlossaryForInternalRoute(
      BIGWHY_SPECIALIST,
      "Help me mijn big why aanscherpen"
    ),
    true
  );
});

test("step0 bootstrap input is determined only by first user message and language", () => {
  const first = buildStep0BootstrapSpecialistInput("  Mijn bedrijf heet Nova  ", " nl ");
  const second = buildStep0BootstrapSpecialistInput("Mijn bedrijf heet Nova", "nl");
  const differentLanguage = buildStep0BootstrapSpecialistInput("Mijn bedrijf heet Nova", "en");

  assert.equal(first, "FIRST_USER_MESSAGE: Mijn bedrijf heet Nova\nLANGUAGE: nl");
  assert.equal(second, first);
  assert.notEqual(differentLanguage, first);
});

test("start_prestart may reuse an existing snapshot on ACTION_START", () => {
  const routeMode = resolveStartPrestartRouteMode({
    started: "false",
    currentStep: "step_0",
    introShownSession: "false",
    actionCodeRaw: "ACTION_START",
    hasLastSpecialist: true,
    isBootstrapPollCall: false,
    step0Id: "step_0",
  });

  assert.equal(routeMode.allowStartActionWithSnapshot, true);
  assert.equal(routeMode.isStartTrigger, true);
  assert.equal(routeMode.shouldReturnPrestartGate, false);
});

test("start_prestart returns the prestart gate before start is clicked", () => {
  const routeMode = resolveStartPrestartRouteMode({
    started: "false",
    currentStep: "step_0",
    introShownSession: "false",
    actionCodeRaw: "",
    hasLastSpecialist: false,
    isBootstrapPollCall: false,
    step0Id: "step_0",
  });

  assert.equal(routeMode.allowStartActionWithSnapshot, false);
  assert.equal(routeMode.isStartTrigger, false);
  assert.equal(routeMode.shouldReturnPrestartGate, true);
});

test("explicit step0 prewarm action uses the prestart gate and does not act as start", () => {
  const routeMode = resolveStartPrestartRouteMode({
    started: "false",
    currentStep: "step_0",
    introShownSession: "false",
    actionCodeRaw: "ACTION_STEP0_PREWARM",
    hasLastSpecialist: false,
    isBootstrapPollCall: false,
    step0Id: "step_0",
  });

  assert.equal(routeMode.allowStartActionWithSnapshot, false);
  assert.equal(routeMode.isStartTrigger, false);
  assert.equal(routeMode.shouldReturnPrestartGate, true);
});

test("existing step0 bootstrap skips another bootstrap specialist hydration on start", () => {
  const shouldHydrate = shouldHydrateStep0BootstrapFromSpecialist({
    currentBootstrap: {
      venture: "design studio",
      name: "Nova",
      status: "existing",
    },
    initialUserMessageSeed: "Ik heb design studio Nova",
  });

  assert.equal(shouldHydrate, false);
});
