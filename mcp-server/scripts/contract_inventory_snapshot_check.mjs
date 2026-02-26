#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_ID = "contract_inventory_snapshot_check";

function fail(message, details = []) {
  console.error(`[${CHECK_ID}] FAIL ${message}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`cannot read file: ${filePath}`, [String(error?.message || error)]);
  }
}

function extractConst(source, constName) {
  const pattern = new RegExp(`export const ${constName}\\s*=\\s*"([^"]+)"`);
  const match = source.match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function assertEqual(label, actual, expected, failures) {
  if (actual !== expected) {
    failures.push(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(projectRoot, "..");

  const snapshotPath = path.resolve(repoRoot, "docs/inventory/contract_inventory_snapshot.json");
  const inventoryPath = path.resolve(repoRoot, "docs/inventory/contract-adr-inventory.md");
  const statePath = path.resolve(projectRoot, "src/core/state.ts");
  const bootstrapPath = path.resolve(projectRoot, "src/core/bootstrap_runtime.ts");
  const uiMatrixPath = path.resolve(projectRoot, "src/core/ui_contract_matrix.ts");
  const toolContractPath = path.resolve(projectRoot, "src/contracts/mcp_tool_contract.ts");

  if (!fs.existsSync(snapshotPath)) {
    fail("snapshot file missing", [snapshotPath]);
  }
  if (!fs.existsSync(inventoryPath)) {
    fail("inventory file missing", [inventoryPath]);
  }

  const snapshot = JSON.parse(readFile(snapshotPath));
  const inventory = readFile(inventoryPath);
  const stateSource = readFile(statePath);
  const bootstrapSource = readFile(bootstrapPath);
  const uiMatrixSource = readFile(uiMatrixPath);
  const toolContractSource = readFile(toolContractPath);

  const actualVersions = {
    current_state_version: extractConst(stateSource, "CURRENT_STATE_VERSION"),
    default_view_contract_version: extractConst(stateSource, "DEFAULT_VIEW_CONTRACT_VERSION"),
    view_contract_version: extractConst(bootstrapSource, "VIEW_CONTRACT_VERSION"),
    ui_contract_version: extractConst(uiMatrixSource, "UI_CONTRACT_VERSION"),
    mcp_tool_contract_family_version: extractConst(toolContractSource, "MCP_TOOL_CONTRACT_FAMILY_VERSION"),
    run_step_tool_input_schema_version: extractConst(toolContractSource, "RUN_STEP_TOOL_INPUT_SCHEMA_VERSION"),
    run_step_tool_output_schema_version: extractConst(toolContractSource, "RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION"),
    run_step_model_result_shape_version: extractConst(toolContractSource, "RUN_STEP_MODEL_RESULT_SHAPE_VERSION"),
  };

  const expectedVersions =
    snapshot && typeof snapshot === "object" && snapshot.ssot_versions && typeof snapshot.ssot_versions === "object"
      ? snapshot.ssot_versions
      : null;
  if (!expectedVersions) {
    fail("snapshot.ssot_versions ontbreekt of ongeldig");
  }

  const failures = [];
  for (const [key, expectedValue] of Object.entries(expectedVersions)) {
    const actualValue = String(actualVersions[key] || "");
    assertEqual(`ssot_versions.${key}`, actualValue, String(expectedValue || ""), failures);
  }

  const families = Array.isArray(snapshot.required_inventory_contract_families)
    ? snapshot.required_inventory_contract_families
    : [];
  for (const family of families) {
    const text = String(family || "").trim();
    if (!text) continue;
    if (!inventory.includes(text)) {
      failures.push(`inventory mist contractfamilie: ${text}`);
    }
  }

  const adrRefs = Array.isArray(snapshot.required_adr_refs) ? snapshot.required_adr_refs : [];
  for (const adrRef of adrRefs) {
    const text = String(adrRef || "").trim();
    if (!text) continue;
    if (!inventory.includes(text)) {
      failures.push(`inventory mist ADR referentie: ${text}`);
    }
  }

  if (failures.length > 0) {
    fail("snapshot drift detected", failures);
  }

  console.log(
    `[${CHECK_ID}] PASS snapshot_version=${String(snapshot.snapshot_version || "unknown")} checks=${
      Object.keys(expectedVersions).length + families.length + adrRefs.length
    }`
  );
}

main();
