import { z } from "zod";
import { StepIntentZod } from "./intents.js";

export const RenderedActionZod = z.object({
  id: z.string(),
  label: z.string(),
  label_key: z.string(),
  action_code: z.string(),
  intent: StepIntentZod,
  primary: z.boolean().optional().default(false),
});

export type RenderedAction = z.infer<typeof RenderedActionZod>;

export const UiSingleValueContentZod = z.object({
  kind: z.literal("single_value"),
  heading: z.string().optional(),
  canonical_text: z.string().optional(),
  support_text: z.string().optional(),
  feedback_reason_text: z.string().optional(),
});

export type UiSingleValueContent = z.infer<typeof UiSingleValueContentZod>;

export const UiStructuredSuggestionsContentZod = z.object({
  kind: z.literal("structured_suggestions"),
  heading: z.string().optional(),
  items: z.array(z.string()).optional(),
  outro: z.string().optional(),
  item_style: z.enum(["bullets", "blocks"]).optional(),
});

export type UiStructuredSuggestionsContent = z.infer<typeof UiStructuredSuggestionsContentZod>;

export const UiContentPayloadZod = z.union([UiSingleValueContentZod, UiStructuredSuggestionsContentZod]);

export type UiContentPayload = z.infer<typeof UiContentPayloadZod>;

export const StructuredTurnPayloadZod = z.object({
  message: z.string(),
  refinedFormulation: z.string().optional(),
  questionText: z.string(),
  actions: z.array(RenderedActionZod),
  content: UiContentPayloadZod.optional(),
  uiHints: z
    .object({
      showDreamBuilder: z.boolean().optional(),
      showScoring: z.boolean().optional(),
      wordingChoiceMode: z.boolean().optional(),
    })
    .optional(),
});

export type StructuredTurnPayload = z.infer<typeof StructuredTurnPayloadZod>;
