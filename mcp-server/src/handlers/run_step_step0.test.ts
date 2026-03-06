import test from "node:test";
import assert from "node:assert/strict";

import { inferStep0SeedFromInitialMessage } from "./run_step_step0.js";

test("inferStep0SeedFromInitialMessage extracts Dutch possessive venture+name", () => {
  const seed = inferStep0SeedFromInitialMessage("Help met een businessplan voor mijn reclamebureau Mindd");
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
