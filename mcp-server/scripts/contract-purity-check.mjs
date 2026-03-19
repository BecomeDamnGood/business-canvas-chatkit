#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(repoRoot, "..");
const stepsDir = path.resolve(repoRoot, "src/steps");

const forbiddenPatterns = [
  {
    key: "action_code_interpretation_heading",
    re: /ACTION CODE INTERPRETATION/i,
  },
  {
    key: "action_to_route_ascii_arrow",
    re: /ACTION_[A-Z0-9_]+\s*->\s*"__ROUTE__[A-Z0-9_]+__"/,
  },
  {
    key: "action_to_route_unicode_arrow",
    re: /ACTION_[A-Z0-9_]+\s*→\s*"__ROUTE__[A-Z0-9_]+__"/,
  },
  {
    key: "action_to_yes_ascii_arrow",
    re: /ACTION_[A-Z0-9_]+\s*->\s*"yes"/i,
  },
  {
    key: "action_to_yes_unicode_arrow",
    re: /ACTION_[A-Z0-9_]+\s*→\s*"yes"/i,
  },
  {
    key: "actioncode_mapping_sentence_1",
    re: /When USER_MESSAGE contains an ActionCode/i,
  },
  {
    key: "actioncode_mapping_sentence_2",
    re: /Map ActionCodes to route tokens/i,
  },
];

const publicContractChecks = [
  {
    file: "mcp-server/ui/lib/ui_render.ts",
    patterns: [
      { key: "legacy_pending_kind_wording_choice", re: /kind:\s*"wording_choice"/ },
      { key: "legacy_view_variant_wording_choice", re: /["']wording_choice["']/ },
      { key: "legacy_feedback_kind_single_value_compare", re: /single_value_compare/ },
      { key: "legacy_feedback_kind_single_value_canonical_suggestion", re: /single_value_canonical_suggestion/ },
      { key: "legacy_feedback_kind_grouped_list_compare", re: /grouped_list_compare/ },
      { key: "legacy_feedback_kind_list_edit_compare", re: /list_edit_compare/ },
      { key: "legacy_feedback_kind_list_duplicate_merge_compare", re: /list_duplicate_merge_compare/ },
    ],
  },
  {
    file: "mcp-server/ui/lib/main.ts",
    patterns: [{ key: "legacy_widget_wording_choice_kind", re: /["']wording_choice["']/ }],
  },
  {
    file: "mcp-server/src/handlers/turn_contract.ts",
    patterns: [
      { key: "legacy_pending_kind_wording_choice", re: /kind:\s*"wording_choice"/ },
      { key: "legacy_compare_surface_wording_choice", re: /surface:\s*"wording_choice"|return\s+"wording_choice"/ },
      { key: "legacy_view_variant_wording_choice", re: /variant\s*===\s*"wording_choice"|variant:\s*"wording_choice"/ },
    ],
  },
  {
    file: "mcp-server/src/handlers/run_step_runtime_types.ts",
    patterns: [{ key: "legacy_pending_kind_wording_choice", re: /kind:\s*"wording_choice"/ }],
  },
  {
    file: "mcp-server/src/handlers/run_step_runtime_action_helpers.ts",
    patterns: [{ key: "legacy_view_variant_wording_choice", re: /\|\s*"wording_choice"/ }],
  },
  {
    file: "mcp-server/src/handlers/run_step_ui_payload.ts",
    patterns: [{ key: "legacy_view_variant_wording_choice", re: /variant\s*=\s*"wording_choice"|\|\s*"wording_choice"/ }],
  },
];

async function main() {
  const entries = await fs.readdir(stepsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(stepsDir, entry.name))
    .sort();

  const violations = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of forbiddenPatterns) {
        if (pattern.re.test(line)) {
          violations.push({
            file: path.relative(projectRoot, filePath),
            line: index + 1,
            key: pattern.key,
            text: line.trim(),
          });
        }
      }
    });
  }

  for (const check of publicContractChecks) {
    const filePath = path.resolve(projectRoot, check.file);
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of check.patterns) {
        if (pattern.re.test(line)) {
          violations.push({
            file: path.relative(projectRoot, filePath),
            line: index + 1,
            key: pattern.key,
            text: line.trim(),
          });
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("Contract purity check failed. Forbidden mappings found in step prompts:\n");
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line} [${violation.key}] ${violation.text}`
      );
    }
    process.exit(1);
  }

  console.log(
    `Contract purity check passed: no forbidden ActionCode mapping patterns in ${files.length} step files.`
  );
}

main().catch((error) => {
  console.error("Contract purity check crashed:", error);
  process.exit(1);
});
