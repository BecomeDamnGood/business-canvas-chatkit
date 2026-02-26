#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PHASE_BUDGETS = Object.freeze({
  phase_R0: { maxLines: 3400, label: "Runtime baseline gate" },
  phase_R1: { maxLines: 3000, label: "Runtime extraction wave 1" },
  phase_R2: { maxLines: 2500, label: "Runtime extraction wave 2" },
  phase_R3: { maxLines: 2100, label: "Runtime convergence gate" },
  phase_R4: { maxLines: 1800, label: "Runtime final target" },
  stretch: { maxLines: 1800, label: "Deprecated alias for phase_R4" },
});

const PHASE_ORDER = ["phase_R0", "phase_R1", "phase_R2", "phase_R3", "phase_R4"];

function readRequestedPhase() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--phase") return argv[i + 1] || "";
    if (argv[i].startsWith("--phase=")) return argv[i].slice("--phase=".length);
  }
  return process.env.RUN_STEP_RUNTIME_LOC_PHASE || process.env.RUN_STEP_RUNTIME_ARCH_PHASE || "phase_R0";
}

function resolveRuntimePath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return path.join(mcpServerRoot, "src", "handlers", "run_step_runtime.ts");
}

function countLines(raw) {
  if (!raw) return 0;
  const normalized = raw.replace(/\r\n/g, "\n");
  const breaks = (normalized.match(/\n/g) || []).length;
  return normalized.endsWith("\n") ? breaks : breaks + 1;
}

function assertBudgetOrder() {
  for (let i = 1; i < PHASE_ORDER.length; i += 1) {
    const prev = PHASE_BUDGETS[PHASE_ORDER[i - 1]].maxLines;
    const cur = PHASE_BUDGETS[PHASE_ORDER[i]].maxLines;
    if (cur > prev) {
      throw new Error(`Invalid runtime LOC phase ordering: ${PHASE_ORDER[i]} (${cur}) > ${PHASE_ORDER[i - 1]} (${prev})`);
    }
  }
}

function main() {
  assertBudgetOrder();
  const phase = readRequestedPhase();
  const budget = PHASE_BUDGETS[phase];
  if (!budget) {
    console.error(`[run_step_runtime_loc_check] unknown phase "${phase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const runtimePath = resolveRuntimePath();
  if (!fs.existsSync(runtimePath)) {
    console.error(`[run_step_runtime_loc_check] missing file: ${runtimePath}`);
    process.exit(1);
  }

  const lineCount = countLines(fs.readFileSync(runtimePath, "utf8"));
  const delta = lineCount - budget.maxLines;

  console.log(`[run_step_runtime_loc_check] phase=${phase} (${budget.label})`);
  console.log(`[run_step_runtime_loc_check] run_step_runtime.ts lines=${lineCount}, limit=${budget.maxLines}`);

  if (delta > 0) {
    console.error(`[run_step_runtime_loc_check] FAIL: run_step_runtime.ts exceeds phase budget by ${delta} lines.`);
    console.error("[run_step_runtime_loc_check] Action: extract complete runtime subsystems before advancing phase.");
    process.exit(1);
  }

  console.log(`[run_step_runtime_loc_check] PASS: ${Math.abs(delta)} lines of headroom remain.`);
}

main();
