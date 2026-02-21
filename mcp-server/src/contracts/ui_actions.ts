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

export const StructuredTurnPayloadZod = z.object({
  message: z.string(),
  refinedFormulation: z.string().optional(),
  questionText: z.string(),
  actions: z.array(RenderedActionZod),
  uiHints: z
    .object({
      showDreamBuilder: z.boolean().optional(),
      showScoring: z.boolean().optional(),
      wordingChoiceMode: z.boolean().optional(),
    })
    .optional(),
});

export type StructuredTurnPayload = z.infer<typeof StructuredTurnPayloadZod>;
