import test from "node:test";
import assert from "node:assert/strict";

import {
  createRunStepStep0DisplayHelpers,
  inferStep0SeedFromInitialMessage,
  resolveStep0BootstrapFromState,
  maybeSeedStep0CandidateFromInitialMessage,
} from "./run_step_step0.js";
import { getDefaultState } from "../core/state.js";

test("inferStep0SeedFromInitialMessage extracts Dutch possessive venture+name", () => {
  const seed = inferStep0SeedFromInitialMessage("Help met een businessplan voor mijn reclamebureau Mindd");
  assert.ok(seed);
  assert.equal(seed?.venture, "reclamebureau");
  assert.equal(seed?.name, "Mindd");
  assert.equal(seed?.status, "existing");
});

test("inferStep0SeedFromInitialMessage prefers venture hint plus trailing brand in natural opening sentence", () => {
  const seed = inferStep0SeedFromInitialMessage("help met mijn ondernemingsplan voor mijn reclamebureau Mindd");
  assert.ok(seed);
  assert.equal(seed?.venture, "reclamebureau");
  assert.equal(seed?.name, "Mindd");
  assert.equal(seed?.status, "existing");
});

test("inferStep0SeedFromInitialMessage extracts named startup intent", () => {
  const seed = inferStep0SeedFromInitialMessage("I want to start an agency called Mindd");
  assert.ok(seed);
  assert.equal(seed?.venture, "agency");
  assert.equal(seed?.name, "Mindd");
  assert.equal(seed?.status, "starting");
});

test("inferStep0SeedFromInitialMessage extracts brand before trailing venture phrase", () => {
  const seed = inferStep0SeedFromInitialMessage(
    "Ik wil een businessplan voor New Black een Unified Commerce aanbieder"
  );
  assert.ok(seed);
  assert.equal(seed?.venture, "Unified Commerce aanbieder");
  assert.equal(seed?.name, "New Black");
  assert.equal(seed?.status, "existing");
});

test("inferStep0SeedFromInitialMessage trims named phrases before the next clause", () => {
  const seed = inferStep0SeedFromInitialMessage(
    "Wij zijn een Unified Commerce aanbieder genaamd New Black en ik wil een Businessplan"
  );
  assert.ok(seed);
  assert.equal(seed?.venture, "Unified Commerce aanbieder");
  assert.equal(seed?.name, "New Black");
  assert.equal(seed?.status, "existing");
});

test("inferStep0SeedFromInitialMessage prefers specific identity venture and trims polluted generic company names", () => {
  const seed = inferStep0SeedFromInitialMessage(
    "Ik wil een Businessplan voor mijn bedrijf Bart en ik ben een schoenenverkoper"
  );
  assert.ok(seed);
  assert.equal(seed?.venture, "schoenenverkoper");
  assert.equal(seed?.name, "Bart");
  assert.equal(seed?.status, "existing");
});

test("inferStep0SeedFromInitialMessage extracts possessive venture and trailing brand without a fixed hint word", () => {
  const seed = inferStep0SeedFromInitialMessage("Help met een businessplan voor mijn kledingmerk Benzo");
  assert.ok(seed);
  assert.equal(seed?.venture, "kledingmerk");
  assert.equal(seed?.name, "Benzo");
  assert.equal(seed?.status, "existing");
});

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

test("inferStep0SeedFromInitialMessage returns null when venture type is present without a distinct business name", () => {
  const seed = inferStep0SeedFromInitialMessage("Help met mijn ondernemingsplan voor mijn reclamebureau");
  assert.equal(seed, null);
});

test("maybeSeedStep0CandidateFromInitialMessage stores canonical prestart bootstrap tuple", () => {
  const seeded = maybeSeedStep0CandidateFromInitialMessage(
    getDefaultState(),
    "Help met een bedrijfsplan voor mijn reclamebureau genaamd Mindd"
  );

  assert.deepEqual((seeded as any).step0_bootstrap, {
    venture: "reclamebureau",
    name: "Mindd",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal(seeded.business_name, "Mindd");
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
    "ja ik ben er klaar voor"
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
    "nee de naam is de virtuele CowBoy"
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
