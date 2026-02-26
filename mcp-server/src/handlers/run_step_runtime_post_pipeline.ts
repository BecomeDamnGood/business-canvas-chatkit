import type { RunStepContext } from "./run_step_context.js";
import type { RunStepPipelinePorts } from "./run_step_ports.js";
import { createRunStepPipelineHelpers } from "./run_step_pipeline.js";

export async function runStepRuntimePostPipelineLayer<TPayload extends Record<string, unknown>>(params: {
  context: RunStepContext;
  pipelinePorts: RunStepPipelinePorts<TPayload>;
}): Promise<TPayload> {
  const pipelineHelpers = createRunStepPipelineHelpers<TPayload>(params.pipelinePorts);
  return pipelineHelpers.runPostSpecialistPipeline(params.context);
}
