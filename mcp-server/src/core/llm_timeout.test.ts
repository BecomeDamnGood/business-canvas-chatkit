import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callStrictJson, __setTestClient } from "./llm.js";

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
