import test from "node:test";
import assert from "node:assert/strict";

import { ValidationAndBusinessNameJsonSchema, ValidationAndBusinessNameZodSchema } from "./step_0_validation.js";
import { DreamJsonSchema, DreamZodSchema } from "./dream.js";
import { DreamExplainerJsonSchema, DreamExplainerZodSchema } from "./dream_explainer.js";
import { PurposeJsonSchema, PurposeZodSchema } from "./purpose.js";
import { BigWhyJsonSchema, BigWhyZodSchema } from "./bigwhy.js";
import { RoleJsonSchema, RoleZodSchema } from "./role.js";
import { EntityJsonSchema, EntityZodSchema } from "./entity.js";
import { StrategyJsonSchema, StrategyZodSchema } from "./strategy.js";
import { TargetGroupJsonSchema, TargetGroupZodSchema } from "./targetgroup.js";
import { ProductsServicesJsonSchema, ProductsServicesZodSchema } from "./productsservices.js";
import { RulesOfTheGameJsonSchema, RulesOfTheGameZodSchema } from "./rulesofthegame.js";
import { PresentationJsonSchema, PresentationZodSchema } from "./presentation.js";

type CaseItem = {
  name: string;
  jsonSchema: any;
  zodSchema: any;
};

const CASES: CaseItem[] = [
  { name: "step_0", jsonSchema: ValidationAndBusinessNameJsonSchema, zodSchema: ValidationAndBusinessNameZodSchema },
  { name: "dream", jsonSchema: DreamJsonSchema, zodSchema: DreamZodSchema },
  { name: "dream_explainer", jsonSchema: DreamExplainerJsonSchema, zodSchema: DreamExplainerZodSchema },
  { name: "purpose", jsonSchema: PurposeJsonSchema, zodSchema: PurposeZodSchema },
  { name: "bigwhy", jsonSchema: BigWhyJsonSchema, zodSchema: BigWhyZodSchema },
  { name: "role", jsonSchema: RoleJsonSchema, zodSchema: RoleZodSchema },
  { name: "entity", jsonSchema: EntityJsonSchema, zodSchema: EntityZodSchema },
  { name: "strategy", jsonSchema: StrategyJsonSchema, zodSchema: StrategyZodSchema },
  { name: "targetgroup", jsonSchema: TargetGroupJsonSchema, zodSchema: TargetGroupZodSchema },
  { name: "productsservices", jsonSchema: ProductsServicesJsonSchema, zodSchema: ProductsServicesZodSchema },
  { name: "rulesofthegame", jsonSchema: RulesOfTheGameJsonSchema, zodSchema: RulesOfTheGameZodSchema },
  { name: "presentation", jsonSchema: PresentationJsonSchema, zodSchema: PresentationZodSchema },
];

test("all specialist JSON schemas require is_offtopic boolean", () => {
  for (const item of CASES) {
    const required = Array.isArray(item.jsonSchema?.required) ? item.jsonSchema.required : [];
    assert.ok(required.includes("is_offtopic"), `${item.name}: required includes is_offtopic`);
    assert.equal(item.jsonSchema?.properties?.is_offtopic?.type, "boolean", `${item.name}: is_offtopic type=boolean`);
  }
});

test("all specialist zod schemas expose is_offtopic field", () => {
  for (const item of CASES) {
    const shape = (item.zodSchema as any)?.shape;
    assert.ok(shape && shape.is_offtopic, `${item.name}: zod shape has is_offtopic`);
  }
});

test("all specialist schemas require user_intent enum field", () => {
  for (const item of CASES) {
    const required = Array.isArray(item.jsonSchema?.required) ? item.jsonSchema.required : [];
    assert.ok(required.includes("user_intent"), `${item.name}: required includes user_intent`);
    assert.equal(item.jsonSchema?.properties?.user_intent?.type, "string", `${item.name}: user_intent type=string`);
    assert.ok(
      Array.isArray(item.jsonSchema?.properties?.user_intent?.enum) &&
        item.jsonSchema.properties.user_intent.enum.length >= 3,
      `${item.name}: user_intent enum configured`
    );
    const shape = (item.zodSchema as any)?.shape;
    assert.ok(shape && shape.user_intent, `${item.name}: zod shape has user_intent`);
  }
});

test("all specialist schemas require meta_topic enum field", () => {
  for (const item of CASES) {
    const required = Array.isArray(item.jsonSchema?.required) ? item.jsonSchema.required : [];
    assert.ok(required.includes("meta_topic"), `${item.name}: required includes meta_topic`);
    assert.equal(item.jsonSchema?.properties?.meta_topic?.type, "string", `${item.name}: meta_topic type=string`);
    assert.ok(
      Array.isArray(item.jsonSchema?.properties?.meta_topic?.enum) &&
        item.jsonSchema.properties.meta_topic.enum.length >= 2,
      `${item.name}: meta_topic enum configured`
    );
    const enumValues = Array.isArray(item.jsonSchema?.properties?.meta_topic?.enum)
      ? item.jsonSchema.properties.meta_topic.enum
      : [];
    assert.ok(enumValues.includes("MODEL_VALUE"), `${item.name}: meta_topic includes MODEL_VALUE`);
    assert.ok(
      enumValues.includes("MODEL_CREDIBILITY"),
      `${item.name}: meta_topic includes MODEL_CREDIBILITY`
    );
    const shape = (item.zodSchema as any)?.shape;
    assert.ok(shape && shape.meta_topic, `${item.name}: zod shape has meta_topic`);
  }
});

test("all ordinary interactive specialist schemas require step_support_state enum field", () => {
  const eligible = CASES.filter(
    (item) => item.name !== "step_0" && item.name !== "presentation" && item.name !== "dream_explainer"
  );
  for (const item of eligible) {
    const required = Array.isArray(item.jsonSchema?.required) ? item.jsonSchema.required : [];
    assert.ok(required.includes("step_support_state"), `${item.name}: required includes step_support_state`);
    assert.equal(
      item.jsonSchema?.properties?.step_support_state?.type,
      "string",
      `${item.name}: step_support_state type=string`
    );
    assert.deepEqual(
      item.jsonSchema?.properties?.step_support_state?.enum,
      ["ok", "stuck"],
      `${item.name}: step_support_state enum matches support contract`
    );
    const shape = (item.zodSchema as any)?.shape;
    assert.ok(shape && shape.step_support_state, `${item.name}: zod shape has step_support_state`);
  }
});

test("dream_explainer keeps user_state and does not expose step_support_state", () => {
  const item = CASES.find((entry) => entry.name === "dream_explainer");
  assert.ok(item);
  const required = Array.isArray(item?.jsonSchema?.required) ? item?.jsonSchema?.required : [];
  assert.ok(required.includes("user_state"), "dream_explainer: required includes user_state");
  assert.equal(
    Object.prototype.hasOwnProperty.call(item?.jsonSchema?.properties || {}, "step_support_state"),
    false,
    "dream_explainer: must not expose step_support_state"
  );
  const shape = (item?.zodSchema as any)?.shape;
  assert.ok(shape?.user_state, "dream_explainer: zod shape has user_state");
  assert.equal(
    Object.prototype.hasOwnProperty.call(shape || {}, "step_support_state"),
    false,
    "dream_explainer: zod shape must not have step_support_state"
  );
});

test("presentation exposes neither user_state nor step_support_state", () => {
  const item = CASES.find((entry) => entry.name === "presentation");
  assert.ok(item);
  const required = Array.isArray(item?.jsonSchema?.required) ? item?.jsonSchema?.required : [];
  assert.equal(required.includes("user_state"), false, "presentation: no user_state");
  assert.equal(required.includes("step_support_state"), false, "presentation: no step_support_state");
  assert.equal(
    Object.prototype.hasOwnProperty.call(item?.jsonSchema?.properties || {}, "user_state"),
    false,
    "presentation: no user_state property"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(item?.jsonSchema?.properties || {}, "step_support_state"),
    false,
    "presentation: no step_support_state property"
  );
});
