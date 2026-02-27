import type { RenderedAction } from "../contracts/ui_actions.js";
import type { CanvasState } from "../core/state.js";
import type {
  UiViewPayload,
  WordingChoiceUiPayload,
} from "./run_step_runtime_action_helpers.js";

export type RunStepBase = {
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: Record<string, unknown>;
  registry_version: string;
  ui?: {
    action_codes?: string[];
    expected_choice_count?: number;
    actions?: RenderedAction[];
    questionText?: string;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
    wording_choice?: WordingChoiceUiPayload;
  };
  presentation_assets?: {
    pdf_url: string;
    png_url: string;
    base_name: string;
  };
  state: CanvasState;
  debug?: Record<string, unknown>;
};

export type RunStepSuccess = RunStepBase & { ok: true };
export type RunStepError = RunStepBase & { ok: false; error: Record<string, unknown> };
