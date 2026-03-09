import test from "node:test";
import assert from "node:assert/strict";

import {
  createRunStepStep0DisplayHelpers,
  inferStep0SeedFromInitialMessage,
  resolveStep0BootstrapFromState,
  maybeSeedStep0CandidateFromInitialMessage,
} from "./run_step_step0.js";
import { getDefaultState } from "../core/state.js";

test("inferStep0SeedFromInitialMessage keeps explicit step0 contract tuple", () => {
  const seed = inferStep0SeedFromInitialMessage("Venture: studio | Name: BrandX | Status: existing");
  assert.deepEqual(seed, {
    venture: "studio",
    name: "BrandX",
    status: "existing",
  });
});

test("inferStep0SeedFromInitialMessage returns null when no venture-name signal exists", () => {
  const seed = inferStep0SeedFromInitialMessage("Help me build a business plan");
  assert.equal(seed, null);
});

test("inferStep0SeedFromInitialMessage leaves natural-language bootstrap inference to the LLM layer", () => {
  const seed = inferStep0SeedFromInitialMessage("Ik heb een tuin onderhoudbedrijf Groene Vingers en wil een businessplan");
  assert.equal(seed, null);
});

test("maybeSeedStep0CandidateFromInitialMessage stores canonical prestart bootstrap tuple only from explicit step0 tuple input", () => {
  const seeded = maybeSeedStep0CandidateFromInitialMessage(
    getDefaultState(),
    "Venture: reclamebureau | Name: Mindd | Status: existing"
  );

  assert.deepEqual((seeded as any).step0_bootstrap, {
    venture: "reclamebureau",
    name: "Mindd",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal(seeded.business_name, "Mindd");
});

test("maybeSeedStep0CandidateFromInitialMessage does not heuristically seed natural-language openings", () => {
  const seeded = maybeSeedStep0CandidateFromInitialMessage(
    getDefaultState(),
    "Help met een businessplan voor mijn kledingmerk Benzo"
  );

  assert.deepEqual((seeded as any).step0_bootstrap, {
    venture: "",
    name: "",
    status: "",
    source: "",
  });
  assert.equal(seeded.business_name, "TBD");
});

test("resolveStep0BootstrapFromState falls back to persisted step_0_final", () => {
  const bootstrap = resolveStep0BootstrapFromState({
    ...getDefaultState(),
    step_0_final: "Venture: reclamebureau | Name: Mindd | Status: existing",
    business_name: "Mindd",
  } as any);

  assert.deepEqual(bootstrap, {
    venture: "reclamebureau",
    name: "Mindd",
    status: "existing",
    source: "step_0_final",
  });
});

test("resolveStep0BootstrapFromState keeps recovered bootstrap tuple with generic multiword venture", () => {
  const bootstrap = resolveStep0BootstrapFromState({
    ...getDefaultState(),
    step_0_final: "Venture: Unified Commerce aanbieder | Name: New Black | Status: existing",
    business_name: "New Black",
  } as any);

  assert.deepEqual(bootstrap, {
    venture: "Unified Commerce aanbieder",
    name: "New Black",
    status: "existing",
    source: "step_0_final",
  });
});

test("normalizeStep0AskDisplayContract preserves ready state on confirm intent", () => {
  const helpers = createRunStepStep0DisplayHelpers({
    step0Id: "step_0",
    resolveSpecialistMetaTopic: (specialist: Record<string, unknown>) => String(specialist.meta_topic || "NONE"),
    buildBenProfileMessage: () => "Ben profile",
    step0ReadinessQuestion: (_state, parsed) => `READY:${parsed.name}`,
    step0CardDescForState: () => "CardDesc",
    step0QuestionForState: () => "Question",
    stripChoiceInstructionNoise: (value: string) => value,
  });
  const state: any = {
    step_0_final: "Venture: agency | Name: Mindd | Status: existing",
    business_name: "Mindd",
  };
  const specialist: any = {
    action: "ASK",
    message: "",
    question: "placeholder",
    business_name: "CowBoy",
    step_0: "",
  };

  const normalized = helpers.normalizeStep0AskDisplayContract(
    "step_0",
    specialist,
    state,
    "ja ik ben er klaar voor",
    "confirm_start"
  );

  assert.equal(normalized.business_name, "Mindd");
  assert.equal(normalized.step_0, "Venture: agency | Name: Mindd | Status: existing");
  assert.equal(normalized.step0_interaction_state, "step0_ready");
  assert.equal(normalized.is_mutable, false);
  assert.deepEqual(normalized.editable_fields, []);
});

test("normalizeStep0AskDisplayContract keeps explicit name edit and marks editable state", () => {
  const helpers = createRunStepStep0DisplayHelpers({
    step0Id: "step_0",
    resolveSpecialistMetaTopic: (specialist: Record<string, unknown>) => String(specialist.meta_topic || "NONE"),
    buildBenProfileMessage: () => "Ben profile",
    step0ReadinessQuestion: (_state, parsed) => `READY:${parsed.name}`,
    step0CardDescForState: () => "CardDesc",
    step0QuestionForState: () => "Question",
    stripChoiceInstructionNoise: (value: string) => value,
  });
  const state: any = {
    step_0_final: "Venture: agency | Name: TBD | Status: starting",
    business_name: "TBD",
  };
  const specialist: any = {
    action: "ASK",
    message: "",
    question: "placeholder",
    business_name: "de virtuele CowBoy",
    step_0: "",
  };

  const normalized = helpers.normalizeStep0AskDisplayContract(
    "step_0",
    specialist,
    state,
    "nee de naam is de virtuele CowBoy",
    "change_name"
  );

  assert.equal(normalized.business_name, "de virtuele CowBoy");
  assert.equal(
    normalized.step_0,
    "Venture: agency | Name: de virtuele CowBoy | Status: starting"
  );
  assert.equal(normalized.step0_interaction_state, "step0_editing");
  assert.equal(normalized.is_mutable, true);
  assert.deepEqual(normalized.editable_fields, ["business_name"]);
});
