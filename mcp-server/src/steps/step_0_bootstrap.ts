import { z } from "zod";

export const STEP_0_BOOTSTRAP_SPECIALIST = "Step0BootstrapExtractor" as const;

export const Step0BootstrapExtractionZodSchema = z.object({
  recognized: z.boolean(),
  venture: z.string(),
  name: z.string(),
  status: z.enum(["existing", "starting"]),
});

export type Step0BootstrapExtractionOutput = z.infer<typeof Step0BootstrapExtractionZodSchema>;

export const Step0BootstrapExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recognized", "venture", "name", "status"],
  properties: {
    recognized: { type: "boolean" },
    venture: { type: "string" },
    name: { type: "string" },
    status: {
      type: "string",
      enum: ["existing", "starting"],
    },
  },
} as const;

export function buildStep0BootstrapSpecialistInput(userMessage: string, language = ""): string {
  const main = `FIRST_USER_MESSAGE: ${String(userMessage || "").trim()}`;
  const lang = String(language || "").trim();
  return lang ? `${main}\nLANGUAGE: ${lang}` : main;
}

export const STEP_0_BOOTSTRAP_INSTRUCTIONS = `STEP 0 BOOTSTRAP EXTRACTOR, STRICT JSON, NO UNSUPPORTED INVENTION

Role

You extract a canonical step-0 bootstrap from the user's first natural-language message.
You are not user-facing. Output strict JSON only.

Input

You receive:
- FIRST_USER_MESSAGE: the exact first user message
- optionally LANGUAGE: an iso-like language hint

Goal

Decide whether the first message already contains enough evidence to extract all three:
- venture
- business name
- status: existing or starting

Output schema

{
  "recognized": true | false,
  "venture": "string",
  "name": "string",
  "status": "existing" | "starting"
}

Hard rules

- Return JSON only.
- Never invent details that are not supported by the message.
- Use semantic understanding of the full sentence. Do not rely on a fixed vocabulary of venture types.
- If the sentence clearly contains both a venture and a business name, set recognized=true.
- If either venture or business name is not supported clearly enough, set recognized=false and return venture="" and name="".
- When recognized=false, set status="starting".
- Keep the business name exactly as the user gives it, except:
  - remove continuation text
  - remove conjunctions/pronouns that belong to the next clause
  - remove generic filler around the name
- Prefer the more specific venture description if the sentence contains both a generic container phrase and a more specific self-description.
- Venture should be concise and faithful to the user's wording.
- Status is:
  - existing, if the user indicates they already have/run/are the venture
  - starting, if the user indicates they want to start it
  - if unclear but recognized is true, choose the most directly supported status

Decision policy

- Read the whole sentence before deciding.
- A venture may be expressed as any noun phrase that describes what the business is or does.
- The venture wording may be rare, compound, modern, multilingual, or domain-specific.
- A business name may appear before the venture, after the venture, or after wording equivalent to "called" or "named".
- If a later clause switches back to the speaker's intent, biography, or a new sentence part, do not include that later clause in the business name.
- If the message says the speaker already has, runs, or is the business, status should usually be existing.
- A request for help with a business plan can still contain enough evidence for recognized=true when the venture and business name are already present.

Examples of semantic patterns

- "<NAME> ... a <VENTURE>" can mean name first, venture later.
- "<VENTURE> called <NAME>" can mean venture first, name later.
- "my company <NAME> ... I am a <VENTURE>" means the name can come from the first clause and the venture from the more specific later clause.
- "<I have / we have> a <VENTURE> <NAME>" can mean a trailing business name after the venture phrase.
- "I have a <VENTURE> <NAME> and I want a business plan" should usually recognize both the venture and the trailing name.
- "Help with a business plan for my <VENTURE> <NAME>" should usually recognize both the venture and the trailing name.
- If the message contains a business name followed by "and I/we ..." or an equivalent new clause, stop the business name before that new clause.

Return recognized=false unless the full message gives clear enough evidence for both venture and name.`;
