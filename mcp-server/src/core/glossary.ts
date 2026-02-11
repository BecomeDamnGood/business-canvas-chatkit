/**
 * Global glossary: canonical term intents for The Business Strategy Canvas Builder.
 * Single source of truth; applied to every step. No per-language translation tables.
 * Enforce concept-based wording in any language the app runs in.
 */

/** Canonical step IDs (internal; never derive semantics from translated labels). */
export const CANONICAL_STEP_IDS = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "rulesofthegame",
  "presentation",
] as const;

/**
 * GLOBAL_GLOSSARY: intent definitions for key canvas terms.
 * The model must use the closest term in the target language that matches the INTENT, not literal dictionary translation.
 */
export const GLOBAL_GLOSSARY = `## CANVAS TERM GLOSSARY (intent-based; apply to all output languages)

- **purpose** = meaning / sense-making / existential meaning. NEVER use the concept of "goal", "target", or "objective" for purpose. Purpose is about why the venture matters existentially, not about deliverables or KPIs.

- **Core entity**: When referring to the venture or the core entity the canvas is about, use the target language's equivalent of "business" or "enterprise". NEVER use the language-equivalent of "organization" when the intended meaning is business/enterprise. Reserve "organization" only for external bodies or formal org structures if explicitly needed.

- **dream** = vision concept: aspirational future state. The local-language word must reflect vision/aspiration. If the language has a word that implies "sleeping dream" and would mislead, prefer the term that conveys "vision" or "aspirational future".

- **role** = mission of the business: what the business is here to do in the world. Distinct from purpose (meaning) and from big_why (deep motivation).

- **entity** = business identity / how the business is perceived / positioning of the enterprise as an entity (public perception, identity framing).

- **strategy** = step-by-step plan or route to contribute to the dream/vision: a concrete roadmap or plan. Avoid using "strategy" only as an abstract buzzword; frame it as actionable plan/steps.

- **big_why** = the deep driver behind everything; "the importance behind the importance". Stronger than a superficial "why" or product benefit. Frame as the deepest motivation.

- **rules_of_the_game** = internal rules and operating principles everyone follows inside the business. Not external market regulation unless the user explicitly asks about that.

**Distinctions (never conflate):**
- purpose (existential meaning) ≠ big_why (deep motivation) ≠ role (mission).`;

/** Instruction: use intent-aligned wording in the target language. */
export const GLOSSARY_RULE = `Use the closest term in the target language that matches the intent above; do not translate by dictionary meaning if it changes the concept.`;

/** Self-check: assistant must verify and correct before returning. */
export const SELF_CHECK_RULE = `Before returning your JSON response, verify you did not use disallowed concept equivalents (e.g. purpose as goal/objective; "organization" when meaning business/enterprise). If you violated any glossary rule, rewrite the affected strings and then return.`;

/**
 * Returns the full prefix to prepend to every specialist system instructions.
 * Single injection point for all steps and all languages.
 */
export function getGlossaryPrefix(): string {
  return `${GLOBAL_GLOSSARY}\n\n${GLOSSARY_RULE}\n\n${SELF_CHECK_RULE}\n\n---\n\n`;
}

/**
 * Composes final system instructions by prepending the global glossary to the step-specific instructions.
 * Call this (or prepend getGlossaryPrefix() in the LLM layer) so every run_step call gets the glossary.
 */
export function composeInstructionsWithGlossary(instructions: string): string {
  return getGlossaryPrefix() + instructions;
}
