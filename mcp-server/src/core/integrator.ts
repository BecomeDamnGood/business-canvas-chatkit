// src/core/integrator.ts
import { z } from "zod";
import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";
import type { CanvasState, BoolString } from "./state.js";

/**
 * STEPS INTEGRATOR / RENDERER
 *
 * User-facing composition only.
 * - Renders session intro (1× per session) only if SHOW_SESSION_INTRO == "true"
 *   AND state.intro_shown_session != "true" (extra safety to prevent duplicates).
 * - Renders specialist output strictly in this order:
 *   1) message
 *   2) refined_formulation
 *   3) exactly ONE question line:
 *      - if question non-empty -> question (single line)
 *      - else -> nothing
 * - Spacing: one blank line between rendered parts
 */

const RenderableSpecialistZod = z.object({
  action: z.string(),
  message: z.string().optional(),
  refined_formulation: z.string().optional(),
  question: z.string().optional(),
});

export type RenderedOutput = {
  text: string;
  debug: {
    rendered_parts: Array<{ key: string; value: string }>;
  };
};

function sessionIntroForState(state: CanvasState): string {
  const headline = resolveUiStringForState(state as Record<string, unknown>, "prestart.headline", "");
  const provenTitle = resolveUiStringForState(state as Record<string, unknown>, "prestart.proven.title", "");
  const provenBody = resolveUiStringForState(state as Record<string, unknown>, "prestart.proven.body", "");
  const outcomesTitle = resolveUiStringForState(state as Record<string, unknown>, "prestart.outcomes.title", "");
  const outcome1 = resolveUiStringForState(state as Record<string, unknown>, "prestart.outcomes.item1", "");
  const outcome2 = resolveUiStringForState(state as Record<string, unknown>, "prestart.outcomes.item2", "");
  const outcome3 = resolveUiStringForState(state as Record<string, unknown>, "prestart.outcomes.item3", "");
  const howLabel = resolveUiStringForState(state as Record<string, unknown>, "prestart.meta.how.label", "");
  const howValue = resolveUiStringForState(state as Record<string, unknown>, "prestart.meta.how.value", "");
  const timeLabel = resolveUiStringForState(state as Record<string, unknown>, "prestart.meta.time.label", "");
  const timeValue = resolveUiStringForState(state as Record<string, unknown>, "prestart.meta.time.value", "");

  return [
    headline,
    `<strong>${provenTitle}</strong>\n${provenBody}`,
    `<strong>${outcomesTitle}</strong><ul>\n<li>${outcome1}</li>\n<li>${outcome2}</li>\n<li>${outcome3}</li>\n</ul>`,
    `<strong>${howLabel}</strong>\n${howValue}`,
    `<strong>${timeLabel}</strong>\n${timeValue}.`,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeLineBreaks(s: string): string {
  return String(s ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * The "question line" must be exactly one line.
 * Convert any internal line breaks to spaces and trim.
 */
function normalizeQuestionLine(s: string): string {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function addPart(
  parts: string[],
  debugParts: Array<{ key: string; value: string }>,
  key: string,
  value: string,
  mode: "block" | "singleLine" = "block"
) {
  const v = mode === "singleLine" ? normalizeQuestionLine(value) : normalizeLineBreaks(value);
  if (!v) return;
  parts.push(v);
  debugParts.push({ key, value: v });
}

export function integrateUserFacingOutput(params: {
  state: CanvasState;
  specialistOutput: unknown;
  show_session_intro: BoolString;
}): RenderedOutput {
  const parsed = RenderableSpecialistZod.safeParse(params.specialistOutput);

  const parts: string[] = [];
  const debugParts: Array<{ key: string; value: string }> = [];

  // Fallback if specialist is missing/unparseable
  if (!parsed.success) {
    const fallback = resolveUiStringForState(
      params.state as Record<string, unknown>,
      "integrator.next_prompt",
      ""
    );
    return { text: fallback, debug: { rendered_parts: [{ key: "fallback", value: fallback }] } };
  }

  const sp = parsed.data;

  // Session intro (1× per session) - extra guard using state.intro_shown_session
  const introAlreadyShown = String((params.state as any).intro_shown_session ?? "") === "true";
  if (params.show_session_intro === "true" && !introAlreadyShown) {
    addPart(parts, debugParts, "session_intro", sessionIntroForState(params.state));
  }

  // Specialist fields (block mode preserves line breaks)
  if (typeof sp.message === "string" && sp.message.trim()) {
    addPart(parts, debugParts, "message", sp.message, "block");
  }

  // Only show refined_formulation if it's not already contained in message (to prevent duplication)
  if (typeof sp.refined_formulation === "string" && sp.refined_formulation.trim()) {
    const refinedFormulation = sp.refined_formulation.trim();
    const messageText = typeof sp.message === "string" ? sp.message.trim() : "";
    // Check if refined_formulation is already contained in message (case-insensitive, normalized whitespace)
    const refinedNormalized = refinedFormulation.toLowerCase().replace(/\s+/g, " ");
    const messageNormalized = messageText.toLowerCase().replace(/\s+/g, " ");
    if (!messageNormalized.includes(refinedNormalized)) {
      addPart(parts, debugParts, "refined_formulation", sp.refined_formulation, "block");
    }
  }

  // Exactly one question line (singleLine mode)
  const q = typeof sp.question === "string" && sp.question.trim() ? sp.question : "";
  if (q) addPart(parts, debugParts, "question", q, "singleLine");

  return {
    text: parts.join("\n\n").trim(),
    debug: { rendered_parts: debugParts },
  };
}
