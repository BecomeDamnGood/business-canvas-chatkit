import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import {
  buildStep0BootstrapMemoKey,
  createStep0BootstrapMemoCache,
  resolveMemoizedStep0Bootstrap,
  resolveStep0BootstrapMemoLanguage,
  type Step0BootstrapMemoValue,
} from "./run_step_routes.js";

test("identical step0 bootstrap input reuses the memoized result", async () => {
  const cache = createStep0BootstrapMemoCache({ maxEntries: 4, ttlMs: 60_000 });
  let loaderCalls = 0;
  const loader = async (): Promise<Step0BootstrapMemoValue> => {
    loaderCalls += 1;
    return {
      recognized: true,
      venture: "design studio",
      name: "Nova",
      status: "existing",
    };
  };

  const first = await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "  Ik heb design studio Nova  ",
    language: " NL ",
    load: loader,
  });
  const second = await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Ik heb design studio Nova",
    language: "nl",
    load: loader,
  });

  assert.equal(loaderCalls, 1);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.deepEqual(second.value, first.value);
});

test("different step0 bootstrap language produces a different cache key", async () => {
  const cache = createStep0BootstrapMemoCache({ maxEntries: 4, ttlMs: 60_000 });
  let loaderCalls = 0;
  const loader = async (): Promise<Step0BootstrapMemoValue> => {
    loaderCalls += 1;
    return {
      recognized: true,
      venture: "atelier",
      name: "Nova",
      status: "starting",
    };
  };

  await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Ik start atelier Nova",
    language: "nl",
    load: loader,
  });
  await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Ik start atelier Nova",
    language: "en",
    load: loader,
  });

  assert.equal(loaderCalls, 2);
  assert.notEqual(
    buildStep0BootstrapMemoKey("Ik start atelier Nova", "nl"),
    buildStep0BootstrapMemoKey("Ik start atelier Nova", "en")
  );
});

test("recognized false step0 bootstrap results are memoized too", async () => {
  const cache = createStep0BootstrapMemoCache({ maxEntries: 4, ttlMs: 60_000 });
  let loaderCalls = 0;
  const loader = async (): Promise<Step0BootstrapMemoValue> => {
    loaderCalls += 1;
    return {
      recognized: false,
      venture: "",
      name: "",
      status: "existing",
    };
  };

  const first = await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Help me met mijn idee",
    language: "",
    load: loader,
  });
  const second = await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Help me met mijn idee",
    language: "",
    load: loader,
  });

  assert.equal(loaderCalls, 1);
  assert.equal(first.value?.recognized, false);
  assert.equal(first.value?.status, "existing");
  assert.equal(second.fromCache, true);
  assert.equal(second.value?.recognized, false);
});

test("cache miss still falls through to the underlying bootstrap loader", async () => {
  const cache = createStep0BootstrapMemoCache({ maxEntries: 4, ttlMs: 60_000 });
  let loaderCalls = 0;

  const result = await resolveMemoizedStep0Bootstrap({
    cache,
    firstUserMessage: "Ik heb een bakkerij Nova",
    language: "nl",
    load: async () => {
      loaderCalls += 1;
      return {
        recognized: true,
        venture: "bakkerij",
        name: "Nova",
        status: "existing",
      };
    },
  });

  assert.equal(loaderCalls, 1);
  assert.equal(result.fromCache, false);
  assert.equal(result.value?.recognized, true);
});

test("step0 bootstrap memo language only uses the resolved language when state.language is explicit", () => {
  const withExplicitLanguage = {
    ...getDefaultState(),
    language: "nl",
  };
  const withoutExplicitLanguage = {
    ...getDefaultState(),
    language: "",
  };

  assert.equal(resolveStep0BootstrapMemoLanguage(withExplicitLanguage, "nl"), "nl");
  assert.equal(resolveStep0BootstrapMemoLanguage(withoutExplicitLanguage, "nl"), "");
});
