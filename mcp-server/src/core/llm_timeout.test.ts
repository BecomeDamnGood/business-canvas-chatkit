import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  callStrictJson,
  __getClientForTest,
  __normalizeOpenAIApiKeyForTest,
  __parseRetryAfterMsForTest,
  __setTestClient,
} from "./llm.js";

test("normalize OpenAI key accepts raw and JSON secret formats", () => {
  assert.equal(__normalizeOpenAIApiKeyForTest("sk-test-raw"), "sk-test-raw");
  assert.equal(
    __normalizeOpenAIApiKeyForTest('{"OPENAI_API_KEY":"sk-test-json"}'),
    "sk-test-json"
  );
  assert.equal(__normalizeOpenAIApiKeyForTest('{"apiKey":"sk-test-alt"}'), "sk-test-alt");
  assert.equal(__normalizeOpenAIApiKeyForTest('"sk-test-quoted"'), "sk-test-quoted");
});

test("normalize OpenAI key rejects invalid JSON secret format", () => {
  assert.throws(
    () => __normalizeOpenAIApiKeyForTest('{"SOMETHING_ELSE":"x"}'),
    /JSON secret missing OPENAI_API_KEY/
  );
  assert.throws(
    () => __normalizeOpenAIApiKeyForTest('{"OPENAI_API_KEY":"sk-bad"'),
    /expected raw key or JSON object/
  );
});

test("callStrictJson times out for never-resolving OpenAI call", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevTimeout = process.env.LLM_TIMEOUT_MS;
  process.env.OPENAI_API_KEY = "test";
  process.env.LLM_TIMEOUT_MS = "10";

  __setTestClient({
    responses: {
      create: () => new Promise(() => {}),
    },
  } as any);

  let caught: any = null;
  try {
    await callStrictJson({
      model: "gpt-4.1",
      instructions: "Return JSON.",
      plannerInput: "TEST",
      schemaName: "Test",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
      zodSchema: z.object({ value: z.string() }),
      temperature: 0,
      topP: 1,
      maxOutputTokens: 10,
      debugLabel: "timeout-test",
    });
  } catch (err: any) {
    caught = err;
  }

  __setTestClient(null);
  if (prevKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = prevKey;
  }
  if (prevTimeout === undefined) {
    delete process.env.LLM_TIMEOUT_MS;
  } else {
    process.env.LLM_TIMEOUT_MS = prevTimeout;
  }

  assert.ok(caught, "expected timeout error");
  assert.equal(caught.type, "timeout");
  assert.equal(caught.retry_action, "retry_same_action");
});

test("callStrictJson exposes provider usage when available", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";

  __setTestClient({
    responses: {
      create: async () => ({
        output_text: JSON.stringify({ value: "ok" }),
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
        },
      }),
    },
  } as any);

  try {
    const result = await callStrictJson({
      model: "gpt-4.1",
      instructions: "Return JSON.",
      plannerInput: "TEST",
      schemaName: "UsageAvailable",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
      zodSchema: z.object({ value: z.string() }),
      temperature: 0,
      topP: 1,
      maxOutputTokens: 10,
      debugLabel: "usage-available",
    });
    assert.equal(result.data.value, "ok");
    assert.equal(result.usage.provider_available, true);
    assert.equal(result.usage.input_tokens, 11);
    assert.equal(result.usage.output_tokens, 7);
    assert.equal(result.usage.total_tokens, 18);
  } finally {
    __setTestClient(null);
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }
});

test("callStrictJson marks usage unknown when provider omits usage", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";

  __setTestClient({
    responses: {
      create: async () => ({
        output_text: JSON.stringify({ value: "ok" }),
      }),
    },
  } as any);

  try {
    const result = await callStrictJson({
      model: "gpt-4.1",
      instructions: "Return JSON.",
      plannerInput: "TEST",
      schemaName: "UsageMissing",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
      zodSchema: z.object({ value: z.string() }),
      temperature: 0,
      topP: 1,
      maxOutputTokens: 10,
      debugLabel: "usage-missing",
    });
    assert.equal(result.data.value, "ok");
    assert.equal(result.usage.provider_available, false);
    assert.equal(result.usage.input_tokens, null);
    assert.equal(result.usage.output_tokens, null);
    assert.equal(result.usage.total_tokens, null);
  } finally {
    __setTestClient(null);
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }
});

test("retry-after parsing handles header values and message text units", () => {
  assert.equal(__parseRetryAfterMsForTest("2", ""), 2000);
  assert.equal(__parseRetryAfterMsForTest(undefined, "Please retry after 250 ms"), 250);
  assert.equal(__parseRetryAfterMsForTest(undefined, "Please retry after 1.5 s"), 1500);
});

test("callStrictJson only prepends glossary when explicitly requested", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";
  const seenSystemPrompts: string[] = [];

  __setTestClient({
    responses: {
      create: async (payload: any) => {
        seenSystemPrompts.push(String(payload?.input?.[0]?.content || ""));
        return {
          output_text: JSON.stringify({ value: "ok" }),
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        };
      },
    },
  } as any);

  try {
    await callStrictJson({
      model: "gpt-4.1",
      instructions: "Return JSON.",
      includeGlossary: false,
      plannerInput: "TEST",
      schemaName: "NoGlossary",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
      zodSchema: z.object({ value: z.string() }),
    });
    await callStrictJson({
      model: "gpt-4.1",
      instructions: "Return JSON.",
      includeGlossary: true,
      plannerInput: "TEST",
      schemaName: "WithGlossary",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
      zodSchema: z.object({ value: z.string() }),
    });
  } finally {
    __setTestClient(null);
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  }

  assert.equal(seenSystemPrompts.length, 2);
  assert.equal(seenSystemPrompts[0], "Return JSON.");
  assert.match(seenSystemPrompts[1], /^## CANVAS TERM GLOSSARY/);
});

test("getClient refreshes cached OpenAI client when API key changes", () => {
  const prevKey = process.env.OPENAI_API_KEY;
  __setTestClient(null);
  process.env.OPENAI_API_KEY = "sk-rotation-a";
  const first = __getClientForTest();
  const second = __getClientForTest();
  assert.equal(first, second);

  process.env.OPENAI_API_KEY = "sk-rotation-b";
  const third = __getClientForTest();
  assert.notEqual(first, third);

  __setTestClient(null);
  if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prevKey;
});
