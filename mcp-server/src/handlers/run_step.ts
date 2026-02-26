import "./ingress.js";
import "./specialist_dispatch.js";
import "./run_step_modules.js";
import "./run_step_i18n_runtime.js";
import "./run_step_preflight.js";
import "./run_step_routes.js";
import "./run_step_pipeline.js";
import "./run_step_response.js";
import { run_step as runStepRuntime } from "./run_step_runtime.js";

export async function run_step(rawArgs: unknown) {
  return runStepRuntime(rawArgs);
}
