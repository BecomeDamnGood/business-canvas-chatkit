import { describe, it, expect } from "vitest";
import {
  normalizeRuleText,
  deduplicateRules,
  enforceMaxRules,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  postProcessRulesOfTheGameFromBullets,
  buildUserFeedbackForRulesProcessing,
} from "./rulesofthegame.js";

describe("Rules of the Game post-processing helpers", () => {
  it("normalizes rules for comparison without losing intent", () => {
    expect(normalizeRuleText("• We are punctual.")).toBe("we are punctual");
    expect(normalizeRuleText("-  We are punctual")).toBe("we are punctual");
    expect(normalizeRuleText("1) We are punctual!")).toBe("we are punctual");
  });

  it("deduplicates exact and near-identical rules", () => {
    const input = [
      "We are punctual",
      "• We are punctual.",
      "-  We are always warm and friendly",
      "We are always warm and friendly!",
    ];

    const { mergedRules, mergedGroups } = deduplicateRules(input);

    expect(mergedRules).toEqual(["We are punctual", "-  We are always warm and friendly"]);
    expect(mergedGroups.length).toBe(2);
  });

  it("enforces a hard maximum of 6 rules", () => {
    const rules = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];
    const { finalRules, truncatedIndices } = enforceMaxRules(rules, 6);

    expect(finalRules).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
    expect(truncatedIndices).toEqual([6, 7]);
  });

  it("post-processes statements into a deduplicated, limited list", () => {
    const statements = [
      "We are punctual",
      "We are punctual.",
      "We are always warm and friendly",
      "We focus on quality",
      "We focus on quality!",
      "We protect client value",
      "Another rule",
    ];

    const result = postProcessRulesOfTheGame(statements, 6);

    expect(result.finalRules.length).toBeLessThanOrEqual(6);
    // At least one duplicate group (punctual / quality)
    expect(result.mergedGroups.length).toBeGreaterThan(0);
  });

  it("merges semantically overlapping innovation rules into one rule", () => {
    const statements = [
      "We seek innovative solutions",
      "We challenge ourselves to create original solutions",
      "We are punctual",
    ];

    const result = postProcessRulesOfTheGame(statements, 6);

    // Expect at most 2 unique rules: one innovation rule + punctual
    expect(result.finalRules.length).toBeLessThanOrEqual(2);
  });

  it("builds bullet list output with the canonical bullet character", () => {
    const bullets = buildRulesOfTheGameBullets(["We are punctual", "We focus on quality"]);
    expect(bullets.split("\n")).toEqual(["• We are punctual", "• We focus on quality"]);
  });

  it("post-processes from a raw bullet string", () => {
    const raw = `• We are punctual.
• We are always warm and friendly
• We are punctual`;

    const processed = postProcessRulesOfTheGameFromBullets(raw, 6);

    expect(processed.finalRules.length).toBe(2);
    expect(processed.bulletList.split("\n").length).toBe(2);
  });

  it("builds feedback only when merges and/or truncation happen", () => {
    const noChangeFeedback = buildUserFeedbackForRulesProcessing({
      finalRules: ["A", "B"],
      mergedGroups: [],
      truncatedIndices: [],
    });
    expect(noChangeFeedback).toBe("");

    const withChangesFeedback = buildUserFeedbackForRulesProcessing({
      finalRules: ["A", "B"],
      mergedGroups: [{ targetIndex: 0, sourceIndices: [1] }],
      truncatedIndices: [2],
    });
    expect(withChangesFeedback).toContain("merged");
    expect(withChangesFeedback).toContain("6 most important");
  });
});

