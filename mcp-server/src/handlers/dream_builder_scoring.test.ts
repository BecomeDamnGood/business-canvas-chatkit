import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import {
  buildDreamBuilderScoringRepairRetrySpecialist,
  hasValidDreamBuilderScoringContract,
} from "./dream_builder_scoring.js";

function buildStatements(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Statement ${index + 1}`);
}

test("rejects localized generic dream scoring cluster labels", () => {
  const state = {
    ...getDefaultState(),
    locale: "nl",
    ui_strings_lang: "nl",
  };
  const specialistResult = {
    scoring_phase: "true",
    statements: buildStatements(20),
    clusters: [
      { theme: "Categorie 1", statement_indices: [0, 1, 2, 3, 4] },
      { theme: "Categorie 2", statement_indices: [5, 6, 7, 8, 9] },
      { theme: "Categorie 3", statement_indices: [10, 11, 12, 13, 14] },
      { theme: "Categorie 4", statement_indices: [15, 16, 17, 18, 19] },
    ],
  };

  assert.equal(hasValidDreamBuilderScoringContract(specialistResult, 20, state), false);
});

test("accepts meaningful dream scoring cluster labels", () => {
  const state = {
    ...getDefaultState(),
    locale: "nl",
    ui_strings_lang: "nl",
  };
  const specialistResult = {
    scoring_phase: "true",
    statements: buildStatements(20),
    clusters: [
      { theme: "Sociale ontwikkeling", statement_indices: [0, 1, 2, 3, 4] },
      { theme: "Economische ontwikkeling", statement_indices: [5, 6, 7, 8, 9] },
      { theme: "Maatschappelijke ontwikkeling", statement_indices: [10, 11, 12, 13, 14] },
      { theme: "Technologische ontwikkeling", statement_indices: [15, 16, 17, 18, 19] },
    ],
  };

  assert.equal(hasValidDreamBuilderScoringContract(specialistResult, 20, state), true);
});

test("repair retry specialist does not synthesize numbered fallback categories", () => {
  const state = {
    ...getDefaultState(),
    locale: "nl",
    ui_strings_lang: "nl",
  };
  const specialist = buildDreamBuilderScoringRepairRetrySpecialist({
    specialistResult: {
      action: "ASK",
      message: "",
      question: "",
      scoring_phase: "true",
      clusters: [{ theme: "Categorie 1", statement_indices: [0, 1, 2] }],
    },
    state,
    statements: buildStatements(20),
  });

  assert.equal(specialist.scoring_phase, "false");
  assert.deepEqual(specialist.clusters, []);
  assert.equal(
    specialist.message,
    "Ik kon deze statements nog niet veilig in betekenisvolle thema's groeperen."
  );
  assert.equal(
    specialist.question,
    "Stuur een willekeurig bericht en dan probeer ik de clustering opnieuw."
  );
});
