#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const stepsDir = path.resolve(process.cwd(), "mcp-server/src/steps");

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
            file: path.relative(process.cwd(), filePath),
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
