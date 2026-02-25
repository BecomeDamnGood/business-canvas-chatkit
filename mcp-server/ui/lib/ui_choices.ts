/**
 * Choice contract types.
 * Structured UI actions from the server are the single source of truth.
 */

export interface Choice {
  value: string;
  label: string;
}

export interface ExtractChoicesResult {
  promptShown: string;
  choices: Choice[];
}

export function extractChoicesFromPrompt(promptText: string | null | undefined): ExtractChoicesResult {
  return {
    promptShown: String(promptText || "").trim(),
    choices: [],
  };
}
