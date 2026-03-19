import type { RenderedAction, UiContentPayload } from "../contracts/ui_actions.js";
import type { CanvasState } from "../core/state.js";
import type { UiViewPayload } from "./run_step_runtime_action_helpers.js";

export type PendingInteractionAllowedAction = {
  id: string;
  action_code: string;
  label: string;
  label_key: string;
  role: string;
  surface: string;
  primary: boolean;
};

export type PendingInteractionCompareRenderModel = {
  mode: "text" | "list";
  variant: "default" | "clarify_dual" | "grouped_list_units";
  instruction: string;
  feedback_reason_text: string;
  user_label: string;
  suggestion_label: string;
  user_text: string;
  suggestion_text: string;
  user_items: string[];
  suggestion_items: string[];
  retained_heading: string;
  retained_items: string[];
};

export type PendingInteractionPayload = {
  version: string;
  id: string;
  kind: "text_compare" | "list_compare";
  status: "pending";
  source: "server_contract";
  response_contract_id: string;
  allowed_actions: PendingInteractionAllowedAction[];
  render_model: PendingInteractionCompareRenderModel;
};

export type RunStepBase = {
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: Record<string, unknown>;
  registry_version: string;
  ui?: {
    action_contract?: {
      version?: string;
      source?: string;
      actions?: RenderedAction[];
    };
    questionText?: string;
    content?: UiContentPayload;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
    pending_interaction?: PendingInteractionPayload;
    dream_builder_contract?: Record<string, unknown>;
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
