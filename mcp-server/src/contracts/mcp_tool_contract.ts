import { z } from "zod";

import { RunStepArgsSchema } from "../handlers/ingress.js";

export const MCP_TOOL_CONTRACT_FAMILY_VERSION = "2026-02-26.1";
export const RUN_STEP_TOOL_NAME = "run_step" as const;
export const RUN_STEP_TOOL_INPUT_SCHEMA_VERSION = "1.0.0";
export const RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION = "1.0.0";
export const RUN_STEP_MODEL_RESULT_SHAPE_VERSION = "v2_minimal" as const;

export const RUN_STEP_TOOL_COMPAT_POLICY = Object.freeze({
  input: "minor_additive_only",
  output: "minor_additive_only",
  breaking_change: "major_version_bump_required",
});

export const RunStepToolInputSchema = RunStepArgsSchema.extend({
  host_widget_session_id: z.string().optional(),
});

export const RunStepModelSafeResultOutputSchema = z
  .object({
    model_result_shape_version: z.literal(RUN_STEP_MODEL_RESULT_SHAPE_VERSION),
    ok: z.boolean(),
    tool: z.string(),
    current_step_id: z.string(),
    state: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const RunStepToolStructuredContentOutputSchema = z
  .object({
    title: z.string().optional(),
    meta: z
      .object({
        step: z.string(),
        specialist: z.string(),
      })
      .optional(),
    result: RunStepModelSafeResultOutputSchema,
  })
  .passthrough();

export const RUN_STEP_TOOL_CONTRACT_META = Object.freeze({
  tool: RUN_STEP_TOOL_NAME,
  family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
  input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
  result_shape_version: RUN_STEP_MODEL_RESULT_SHAPE_VERSION,
  compatibility: RUN_STEP_TOOL_COMPAT_POLICY,
});
