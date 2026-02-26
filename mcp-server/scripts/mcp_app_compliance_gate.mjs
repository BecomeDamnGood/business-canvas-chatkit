#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_ID = "mcp_app_compliance_gate";

function fail(message, details = []) {
  console.error(`[${CHECK_ID}] FAIL ${message}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}

function assertMatch(source, regex, description, failures) {
  if (!regex.test(source)) failures.push(description);
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");

  const checklistPath = path.resolve(projectRoot, "docs/contracts/mcp_app_compliance_checklist.md");
  if (!fs.existsSync(checklistPath)) {
    fail("missing compliance checklist", [checklistPath]);
  }

  const checklistContent = fs.readFileSync(checklistPath, "utf8");
  const checklistLines = checklistContent
    .split(/\r?\n/)
    .filter((line) => /^- \[[ xX]\]/.test(line.trim()));
  if (checklistLines.length === 0) {
    fail("checklist has no checkbox items");
  }
  const unchecked = checklistLines.filter((line) => /^- \[ \]/.test(line.trim()));
  if (unchecked.length > 0) {
    fail("unchecked checklist items found", unchecked.map((line) => line.trim()));
  }
  const requiredSections = ["## 1)", "## 2)", "## 3)", "## 4)", "## 5)", "## 6)"];
  const missingSections = requiredSections.filter((section) => !checklistContent.includes(section));
  if (missingSections.length > 0) {
    fail("missing checklist sections", missingSections);
  }

  const serverPath = path.resolve(projectRoot, "server.ts");
  const routePath = path.resolve(projectRoot, "src/handlers/run_step_routes.ts");
  const presentationPath = path.resolve(projectRoot, "src/handlers/run_step_presentation.ts");
  const responsePath = path.resolve(projectRoot, "src/handlers/run_step_response.ts");
  const contractPath = path.resolve(projectRoot, "src/contracts/mcp_tool_contract.ts");

  const serverSource = fs.readFileSync(serverPath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const presentationSource = fs.readFileSync(presentationPath, "utf8");
  const responseSource = fs.readFileSync(responsePath, "utf8");
  const contractSource = fs.readFileSync(contractPath, "utf8");

  const failures = [];
  assertMatch(
    contractSource,
    /export const RUN_STEP_TOOL_INPUT_SCHEMA_VERSION = "[^"]+"/,
    "contract module must export input schema version",
    failures
  );
  assertMatch(
    contractSource,
    /export const RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION = "[^"]+"/,
    "contract module must export output schema version",
    failures
  );
  assertMatch(
    contractSource,
    /export const RUN_STEP_TOOL_COMPAT_POLICY = Object\.freeze\(/,
    "contract module must export compatibility policy",
    failures
  );
  assertMatch(
    serverSource,
    /server\.registerTool\(\s*"run_step"[\s\S]*inputSchema:\s*RunStepToolInputSchema[\s\S]*outputSchema:\s*RunStepToolStructuredContentOutputSchema/,
    "server must register run_step with centralized input/output schemas",
    failures
  );
  assertMatch(
    serverSource,
    /const parsedStructuredContent = RunStepToolStructuredContentOutputSchema\.parse\(structuredContent\);/,
    "server must parse structured output in MCP callback",
    failures
  );
  assertMatch(
    serverSource,
    /TOOL_CONTRACT_FAMILY_VERSION=.*RUN_STEP_INPUT_SCHEMA_VERSION=.*RUN_STEP_OUTPUT_SCHEMA_VERSION=/,
    "version endpoint must expose MCP tool contract versions",
    failures
  );
  assertMatch(
    serverSource,
    /const LOG_REDACT_VALUE_RE =/,
    "server structured logging must include sensitive value redaction",
    failures
  );
  assertMatch(
    responseSource,
    /const LOG_REDACT_VALUE_RE =/,
    "runtime structured logging must include sensitive value redaction",
    failures
  );
  assertMatch(
    routeSource,
    /const assets = deps\.generatePresentationAssets\(context\.state\);/,
    "presentation route must delegate side-effects to generatePresentationAssets port",
    failures
  );
  assertMatch(
    routeSource,
    /presentation_asset_fingerprint: assets\.assetFingerprint/,
    "presentation route must persist generated asset fingerprint",
    failures
  );
  assertMatch(
    presentationSource,
    /const fileName = `presentation-\$\{assetFingerprint\}\.pptx`;/,
    "presentation writes must use deterministic fingerprint-based filenames",
    failures
  );
  assertMatch(
    presentationSource,
    /if \(fs\.existsSync\(filePath\) && fs\.statSync\(filePath\)\.isFile\(\)\)/,
    "presentation generator must reuse existing artifacts",
    failures
  );

  if (failures.length > 0) {
    fail("contract invariants missing", failures);
  }

  console.log(`[${CHECK_ID}] PASS checklist_items=${checklistLines.length}`);
}

main();
