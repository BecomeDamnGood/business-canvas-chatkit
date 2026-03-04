import { z } from "zod";

import { callStrictJson, type LLMUsage } from "../core/llm.js";
import type { CanvasState } from "../core/state.js";

const SurfaceCorrectionOutputZod = z.object({
  corrected_text: z.string(),
});

const SurfaceCorrectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["corrected_text"],
  properties: {
    corrected_text: { type: "string" },
  },
} as const;

export type SurfaceCorrectionResult = {
  correctedText: string;
  source: "llm_surface_pass" | "passthrough";
  llmCall?: {
    attempts: number;
    usage: LLMUsage;
    model: string;
  };
};

export type SurfaceCorrectionParams = {
  model: string;
  state: CanvasState;
  userMessage: string;
  submittedUserText: string;
  actionCodeRaw: string;
  localeHint: string;
  normalizeLangCode: (raw: string) => string;
};

function pickInputText(params: SurfaceCorrectionParams): string {
  const submitted = String(params.submittedUserText || "").trim();
  if (submitted) return submitted;
  return String(params.userMessage || "").trim();
}

function shouldSkipSurfaceCorrection(params: SurfaceCorrectionParams, inputText: string): boolean {
  if (!inputText) return true;
  if (String(params.actionCodeRaw || "").trim()) return true;
  if (inputText.startsWith("ACTION_")) return true;
  if (inputText.startsWith("__ROUTE__")) return true;
  if (inputText.startsWith("choice:")) return true;
  if (inputText.length < 4) return true;
  if (/^https?:\/\//i.test(inputText)) return true;
  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    return true;
  }
  if (!String(process.env.OPENAI_API_KEY || "").trim()) return true;
  return false;
}

function resolveLanguage(params: SurfaceCorrectionParams): string {
  const fromState = String((params.state as any).language || "").trim();
  const fromUi = String((params.state as any).ui_strings_lang || "").trim();
  const fromRequested = String((params.state as any).ui_strings_requested_lang || "").trim();
  const fromLocaleHint = String(params.localeHint || "").trim();
  const raw = fromState || fromUi || fromRequested || fromLocaleHint || "en";
  const normalized = String(params.normalizeLangCode(raw) || "").trim().toLowerCase();
  return normalized || "en";
}

function toWordSet(value: string): Set<string> {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

function hasStrongWordOverlap(original: string, corrected: string): boolean {
  const left = toWordSet(original);
  const right = toWordSet(corrected);
  if (left.size === 0 || right.size === 0) return true;
  if (left.size < 3 || right.size < 3) return true;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  if (union <= 0) return true;
  const score = intersection / union;
  return score >= 0.55;
}

function collectProtectedTokens(params: SurfaceCorrectionParams, inputText: string): string[] {
  const protectedTokens = new Set<string>([
    "{0}",
    "{1}",
    "{2}",
    "N",
    "M",
    "X",
  ]);

  const businessName = String((params.state as any).business_name || "").trim();
  if (businessName && businessName !== "TBD") protectedTokens.add(businessName);

  const placeholderMatches = inputText.match(/\{\d+\}/g) || [];
  for (const token of placeholderMatches) protectedTokens.add(String(token));

  const urlMatches = inputText.match(/https?:\/\/[^\s]+/gi) || [];
  for (const token of urlMatches) protectedTokens.add(String(token));

  return [...protectedTokens].filter(Boolean);
}

function preservesProtectedTokens(input: string, corrected: string, protectedTokens: string[]): boolean {
  const source = String(input || "");
  const output = String(corrected || "");
  for (const token of protectedTokens) {
    if (!token) continue;
    if (!source.includes(token)) continue;
    if (!output.includes(token)) return false;
  }
  return true;
}

function buildPlannerInput(params: {
  language: string;
  inputText: string;
  protectedTokens: string[];
}): string {
  const tokenBlock = params.protectedTokens.length > 0
    ? params.protectedTokens.map((token) => `- ${token}`).join("\n")
    : "- (none)";
  return [
    `LANGUAGE: ${params.language}`,
    "TASK: Correct only spelling, punctuation, and basic grammar.",
    "RULES:",
    "- Keep meaning and tone unchanged.",
    "- Do NOT rewrite content or add ideas.",
    "- Keep business names, placeholders, and technical terms unchanged.",
    "- Preserve list/bullet structure and line breaks where present.",
    "- Return only corrected text.",
    "PROTECTED_TOKENS:",
    tokenBlock,
    "INPUT_TEXT:",
    params.inputText,
  ].join("\n");
}

export async function correctUserInputSurface(params: SurfaceCorrectionParams): Promise<SurfaceCorrectionResult> {
  const inputText = pickInputText(params);
  if (shouldSkipSurfaceCorrection(params, inputText)) {
    return { correctedText: inputText, source: "passthrough" };
  }

  const language = resolveLanguage(params);
  const protectedTokens = collectProtectedTokens(params, inputText);

  try {
    const res = await callStrictJson<{ corrected_text: string }>({
      model: params.model,
      instructions: "You are a strict surface corrector. Correct only spelling, punctuation, and basic grammar in the target language. Never change meaning.",
      plannerInput: buildPlannerInput({
        language,
        inputText,
        protectedTokens,
      }),
      schemaName: "SurfaceCorrection",
      jsonSchema: SurfaceCorrectionJsonSchema as any,
      zodSchema: SurfaceCorrectionOutputZod,
      temperature: 0,
      topP: 1,
      maxOutputTokens: 400,
      debugLabel: "surface_correction",
    });

    const correctedText = String(res.data?.corrected_text || "").trim();
    if (!correctedText) {
      return { correctedText: inputText, source: "passthrough" };
    }
    if (!preservesProtectedTokens(inputText, correctedText, protectedTokens)) {
      return { correctedText: inputText, source: "passthrough" };
    }
    if (!hasStrongWordOverlap(inputText, correctedText)) {
      return { correctedText: inputText, source: "passthrough" };
    }

    return {
      correctedText,
      source: "llm_surface_pass",
      llmCall: {
        attempts: res.attempts,
        usage: res.usage,
        model: params.model,
      },
    };
  } catch {
    return { correctedText: inputText, source: "passthrough" };
  }
}
