import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const checklistPath = path.resolve(__dirname, "../../docs/predeploy-checklist-v2-mcp-bootstrap-locale.md");

if (!fs.existsSync(checklistPath)) {
  console.error(`[checklist_gate] missing file: ${checklistPath}`);
  process.exit(1);
}

const content = fs.readFileSync(checklistPath, "utf8");
const lines = content.split(/\r?\n/);
const checklistLines = lines.filter((line) => /^- \[[ xX]\]/.test(line.trim()));
const unchecked = checklistLines.filter((line) => /^- \[ \]/.test(line.trim()));

const requiredSections = Array.from({ length: 12 }, (_, i) => `## ${i})`);
const missingSections = requiredSections.filter((needle) => !content.includes(needle));

if (checklistLines.length === 0) {
  console.error("[checklist_gate] no checklist items found");
  process.exit(1);
}

if (missingSections.length > 0) {
  console.error("[checklist_gate] missing sections:");
  for (const section of missingSections) console.error(`- ${section}`);
  process.exit(1);
}

if (unchecked.length > 0) {
  console.error("[checklist_gate] unchecked items remain:");
  for (const line of unchecked) console.error(`- ${line.trim()}`);
  process.exit(1);
}

console.log(`[checklist_gate] passed (${checklistLines.length} items checked)`);
