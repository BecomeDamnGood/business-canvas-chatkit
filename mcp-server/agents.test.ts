import test from "node:test";
import assert from "node:assert/strict";

import { GENERIC_STEP_CONFIG, runCanvasStep, type StepId } from "./agents.ts";

type FetchCall = {
  url: string;
  body: any;
};

function makeJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as any;
}

async function withMockFetch<T>(
  responder: (call: FetchCall, index: number) => Promise<any> | any,
  fn: (calls: FetchCall[]) => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const call = {
      url: String(input || ""),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    return responder(call, calls.length - 1);
  }) as any;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("runCanvasStep handles targetgroup without falling back to step_0", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  await withMockFetch(
    () =>
      makeJsonResponse({
        output_parsed: {
          action: "ASK",
          message: "Target group draft",
          question: "Who is the target group?",
          refined_formulation: "",
          confirmation_question: "",
          value: "Founders of service businesses",
          proceed_to_next: "false",
        },
      }),
    async () => {
      const result = await runCanvasStep({
        current_step_id: "targetgroup",
        user_message: "help me define it",
        state: { current_step: "targetgroup" },
      });

      assert.equal(result.current_step_id, "targetgroup");
      assert.equal(result.active_specialist, "TargetGroup");
      assert.equal(String(result.state.targetgroup || ""), "Founders of service businesses");
    }
  );
});

test("runCanvasStep handles productsservices without falling back to step_0", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  await withMockFetch(
    () =>
      makeJsonResponse({
        output_parsed: {
          action: "ASK",
          message: "Products and services draft",
          question: "What do you offer?",
          refined_formulation: "",
          confirmation_question: "",
          value: "Strategy sessions and implementation support",
          proceed_to_next: "false",
        },
      }),
    async () => {
      const result = await runCanvasStep({
        current_step_id: "productsservices",
        user_message: "help me define it",
        state: { current_step: "productsservices" },
      });

      assert.equal(result.current_step_id, "productsservices");
      assert.equal(result.active_specialist, "ProductsAndServices");
      assert.equal(
        String(result.state.productsservices || ""),
        "Strategy sessions and implementation support"
      );
    }
  );
});

test("all post-dream generic steps are covered by the config map", () => {
  const expected: StepId[] = [
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
    "presentation",
  ];

  assert.deepEqual(Object.keys(GENERIC_STEP_CONFIG).sort(), expected.sort());
});

test("runCanvasStep maps strategy output into state.strategy", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  await withMockFetch(
    (call) => {
      const schema = call.body?.text?.format?.schema;
      assert.equal(schema?.type, "object");
      assert.equal(schema?.additionalProperties, false);
      assert.equal(schema?.title, "Strategy");
      assert.equal(schema?.properties?.strategy?.type, "string");
      assert.deepEqual(schema?.properties?.proceed_to_next?.enum, ["true", "false"]);
      assert.ok(Array.isArray(schema?.required));
      assert.ok(schema.required.includes("strategy"));

      return makeJsonResponse({
        output_parsed: {
          action: "ASK",
          message: "Strategy draft",
          question: "What is your strategy?",
          refined_formulation: "",
          confirmation_question: "",
          strategy: "Own a narrow premium niche",
          proceed_to_next: "false",
        },
      });
    },
    async () => {
      const result = await runCanvasStep({
        current_step_id: "strategy",
        user_message: "help me define strategy",
        state: { current_step: "strategy" },
      });

      assert.equal(result.current_step_id, "strategy");
      assert.equal(result.active_specialist, "Strategy");
      assert.equal(String(result.state.strategy || ""), "Own a narrow premium niche");
    }
  );
});

test("runCanvasStep maps presentation output into state.presentation_brief", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  await withMockFetch(
    () =>
      makeJsonResponse({
        output_parsed: {
          action: "ASK",
          message: "Presentation draft",
          question: "What should the presentation cover?",
          refined_formulation: "",
          confirmation_question: "",
          presentation_brief: "A concise strategy deck for stakeholders",
          proceed_to_next: "false",
        },
      }),
    async () => {
      const result = await runCanvasStep({
        current_step_id: "presentation",
        user_message: "make the brief",
        state: { current_step: "presentation" },
      });

      assert.equal(result.current_step_id, "presentation");
      assert.equal(result.active_specialist, "Presentation");
      assert.equal(
        String(result.state.presentation_brief || ""),
        "A concise strategy deck for stakeholders"
      );
    }
  );
});

test("runCanvasStep lets the validation agent interpret a Dutch readiness confirmation", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  await withMockFetch(
    (_call, index) => {
      if (index === 0) {
        return makeJsonResponse({
          output_parsed: {
            action: "CONFIRM",
            message: "",
            question: "",
            refined_formulation: "",
            confirmation_question: "",
            business_name: "Mindd",
            proceed_to_dream: "true",
            step_0: "Venture: bureau | Name: Mindd",
          },
        });
      }

      return makeJsonResponse({
        output_parsed: {
          action: "ASK",
          message: "Droomintro",
          question: "Wat is je droom?",
          refined_formulation: "",
          confirmation_question: "",
          dream: "",
          suggest_dreambuilder: "false",
          proceed_to_dream: "false",
          proceed_to_purpose: "false",
        },
      });
    },
    async (calls) => {
      const result = await runCanvasStep({
        current_step_id: "step_0",
        user_message: "ja",
        state: {
          current_step: "step_0",
          business_name: "Mindd",
          step_0: "Venture: bureau | Name: Mindd",
          last_specialist_result: {
            action: "CONFIRM",
            confirmation_question: "Klopt dit, en ben je klaar om met de Droom te starten?",
            proceed_to_dream: "false",
          },
        },
      });

      assert.equal(calls.length, 2);
      assert.match(String(calls[0].body?.input?.[1]?.content || ""), /USER_MESSAGE: ja/);
      assert.equal(result.current_step_id, "dream");
      assert.equal(result.active_specialist, "Dream");
    }
  );
});
