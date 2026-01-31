// src/core/integrator.ts
import { z } from "zod";
/**
 * STEPS INTEGRATOR / RENDERER
 *
 * User-facing composition only.
 * - Mirrors the language using state.language
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
const SESSION_INTRO_EN = "Welcome to Ben Steenstra’s Business Strategy Canvas, used in national and international organizations. We will go through a small number of steps, one by one, so each step is clear before we move on. At the end you will have a complete and concise business plan, ready as direction for yourself and as a clear presentation for external stakeholders, partners, or team members.";
const SESSION_INTRO_NL = "Welkom bij Ben Steenstra’s Business Strategy Canvas, gebruikt in nationale en internationale organisaties. We doorlopen een klein aantal stappen, één voor één, zodat elke stap duidelijk is voordat we verder gaan. Aan het einde heb je een compleet en beknopt businessplan, klaar als richting voor jezelf en als heldere presentatie voor externe stakeholders, partners of teamleden.";
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
function langFromState(state) {
    const l = String(state.language ?? "").toLowerCase().trim();
    if (l.startsWith("nl"))
        return "nl";
    if (l.startsWith("en"))
        return "en";
    return "en";
}
export function integrateUserFacingOutput(params) {
    const parsed = RenderableSpecialistZod.safeParse(params.specialistOutput);
    const parts = [];
    const debugParts = [];
    // Fallback if specialist is missing/unparseable
    if (!parsed.success) {
        const l = langFromState(params.state);
        const fallback = l === "nl" ? "Wat wil je nu doen?" : "What would you like to do next?";
        return { text: fallback, debug: { rendered_parts: [{ key: "fallback", value: fallback }] } };
    }
    const sp = parsed.data;
    const l = langFromState(params.state);
    // Session intro (1× per sessie) - extra guard using state.intro_shown_session
    const introAlreadyShown = String(params.state.intro_shown_session ?? "") === "true";
    if (params.show_session_intro === "true" && !introAlreadyShown) {
        addPart(parts, debugParts, "session_intro", l === "nl" ? SESSION_INTRO_NL : SESSION_INTRO_EN);
    }
    // Specialist fields (block mode preserves line breaks)
    if (typeof sp.message === "string" && sp.message.trim()) {
        addPart(parts, debugParts, "message", sp.message, "block");
    }
    if (typeof sp.refined_formulation === "string" && sp.refined_formulation.trim()) {
        addPart(parts, debugParts, "refined_formulation", sp.refined_formulation, "block");
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
