// src/core/integrator.ts
import { z } from "zod";
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
 *      - else if confirmation_question non-empty -> confirmation_question (single line)
 *      - else -> nothing
 * - Spacing: one blank line between rendered parts
 */
const RenderableSpecialistZod = z.object({
    action: z.string(),
    message: z.string().optional(),
    refined_formulation: z.string().optional(),
    question: z.string().optional(),
    confirmation_question: z.string().optional(),
});
const SESSION_INTRO = `Build a complete Business Model and Strategy Canvas step by step.

<strong>The Proven Standard</strong>
A globally implemented strategy canvas used by teams worldwide, built through Ben Steenstra's unique step-by-step method of questioning and structured development.

<strong>By the end you'll have</strong><ul>
<li>A focused canvas that fits on one page</li>
<li>A presentation you can use immediately (PPTX)</li>
<li>A plan your team can align around</li>
</ul><strong>How it works</strong>
One question at a time. Clear input, structured output.

<strong>Time</strong>
Estimated time: 10–15 minutes.`;
function normalizeLineBreaks(s) {
    return String(s ?? "").replace(/\r\n/g, "\n").trim();
}
/**
 * The "question line" must be exactly one line.
 * Convert any internal line breaks to spaces and trim.
 */
function normalizeQuestionLine(s) {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" ")
        .trim();
}
function addPart(parts, debugParts, key, value, mode = "block") {
    const v = mode === "singleLine" ? normalizeQuestionLine(value) : normalizeLineBreaks(value);
    if (!v)
        return;
    parts.push(v);
    debugParts.push({ key, value: v });
}
export function integrateUserFacingOutput(params) {
    const parsed = RenderableSpecialistZod.safeParse(params.specialistOutput);
    const parts = [];
    const debugParts = [];
    // Fallback if specialist is missing/unparseable
    if (!parsed.success) {
        const fallback = "What would you like to do next?";
        return { text: fallback, debug: { rendered_parts: [{ key: "fallback", value: fallback }] } };
    }
    const sp = parsed.data;
    // Session intro (1× per session) - extra guard using state.intro_shown_session
    const introAlreadyShown = String(params.state.intro_shown_session ?? "") === "true";
    if (params.show_session_intro === "true" && !introAlreadyShown) {
        addPart(parts, debugParts, "session_intro", SESSION_INTRO);
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
    const cq = !q && typeof sp.confirmation_question === "string" && sp.confirmation_question.trim()
        ? sp.confirmation_question
        : "";
    if (q)
        addPart(parts, debugParts, "question", q, "singleLine");
    else if (cq)
        addPart(parts, debugParts, "confirmation_question", cq, "singleLine");
    return {
        text: parts.join("\n\n").trim(),
        debug: { rendered_parts: debugParts },
    };
}
