import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRuntimeSpecialistHelpers } from "./run_step_runtime_specialist_helpers.js";

function buildHelpers() {
  return createRunStepRuntimeSpecialistHelpers({
    step0Id: "step_0",
    dreamStepId: "dream",
    entityStepId: "entity",
    dreamExplainerSpecialist: "DreamExplainer",
    uiStringFromStateMap: (state: any, key: string, fallback: string) => {
      const map = state && typeof state.ui_strings === "object" ? state.ui_strings : {};
      const value = typeof map[key] === "string" ? String(map[key] || "").trim() : "";
      return value || fallback;
    },
    uiDefaultString: (_key: string, fallback = "") => fallback,
    ensureSentenceEnd: (raw: string) => {
      const text = String(raw || "").trim();
      if (!text) return "";
      return /[.!?]$/.test(text) ? text : `${text}.`;
    },
    resolveMotivationUserIntent: () => "STEP_INPUT",
    resolveSpecialistMetaTopic: () => "NONE",
  });
}

test("normalizeLocalizedConceptTerms replaces 'my future company' with parsed business name from step_0_final", () => {
  const helpers = buildHelpers();
  const state: any = {
    language: "nl",
    business_name: "TBD",
    step_0_final: "Venture: reclamebureau | Name: Mindd | Status: existing",
    ui_strings: {
      "offtopic.companyFallback": "mijn toekomstige bedrijf",
    },
  };
  const specialist: Record<string, unknown> = {
    message: "my future company droomt van een wereld waarin mensen zich gezien voelen.",
    refined_formulation: "my future company droomt van een wereld waarin mensen zich gezien voelen.",
    wording_choice_agent_current:
      "my future company droomt van een wereld waarin mensen zich gezien voelen.",
  };

  const next = helpers.normalizeLocalizedConceptTerms(specialist, state) as Record<string, unknown>;
  const message = String(next.message || "");
  const refined = String(next.refined_formulation || "");
  const suggestion = String(next.wording_choice_agent_current || "");

  assert.match(message, /\bMindd\b/);
  assert.match(refined, /\bMindd\b/);
  assert.match(suggestion, /\bMindd\b/);
  assert.doesNotMatch(message, /my future company/i);
  assert.doesNotMatch(refined, /my future company/i);
  assert.doesNotMatch(suggestion, /my future company/i);
});

test("normalizeLocalizedConceptTerms uses localized fallback when business name is unknown", () => {
  const helpers = buildHelpers();
  const state: any = {
    language: "nl",
    business_name: "TBD",
    step_0_final: "",
    ui_strings: {
      "offtopic.companyFallback": "mijn toekomstige bedrijf",
    },
  };
  const specialist: Record<string, unknown> = {
    message: "my future company droomt van een betere wereld.",
  };

  const next = helpers.normalizeLocalizedConceptTerms(specialist, state) as Record<string, unknown>;
  const message = String(next.message || "");
  assert.match(message, /mijn toekomstige bedrijf/i);
  assert.doesNotMatch(message, /my future company/i);
});

test("normalizeEntitySpecialistResult enforces label/value split when template lacks newline", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings: {
      "entity.suggestion.template": "Wat denk je van de formulering: {0}",
    },
  };
  const specialist: Record<string, unknown> = {
    refined_formulation: "Een AI-driven communicatie-agency",
    entity: "",
    message: "",
  };

  const next = helpers.normalizeEntitySpecialistResult("entity", specialist, state) as Record<string, unknown>;
  const message = String(next.message || "");
  assert.match(message, /^Wat denk je van de formulering:/);
  assert.match(message, /\nEen AI-driven communicatie-agency$/);
});
