#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PHASE_BUDGETS = Object.freeze({
  baseline: { maxLines: 9000, label: "Step 1 guardrail baseline" },
  phase_A: { maxLines: 4000, label: "After first major subsystem moves" },
  phase_B: { maxLines: 2500, label: "Primary target band entry" },
  phase_C: { maxLines: 1500, label: "Facade-oriented convergence" },
  phase_20: { maxLines: 1170, label: "Final 20 percent thin-facade target" },
  stretch: { maxLines: 1170, label: "Deprecated alias for phase_20" },
});

const PHASE_ORDER = ["baseline", "phase_A", "phase_B", "phase_C", "phase_20"];

function readRequestedPhase() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--phase") {
      return argv[i + 1] || "";
    }
    if (argv[i].startsWith("--phase=")) {
      return argv[i].slice("--phase=".length);
    }
  }
  return process.env.RUN_STEP_LOC_PHASE || process.env.RUN_STEP_ARCH_PHASE || "baseline";
}

function resolveRunStepPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return path.join(mcpServerRoot, "src", "handlers", "run_step.ts");
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
      throw new Error(`Invalid LOC phase budget ordering: ${PHASE_ORDER[i]} (${cur}) > ${PHASE_ORDER[i - 1]} (${prev})`);
    }
  }
}

function main() {
  assertBudgetOrder();
  const requestedPhase = readRequestedPhase();
  const budget = PHASE_BUDGETS[requestedPhase];
  if (!budget) {
    console.error(`[run_step_loc_check] unknown phase "${requestedPhase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const runStepPath = resolveRunStepPath();
  if (!fs.existsSync(runStepPath)) {
    console.error(`[run_step_loc_check] missing file: ${runStepPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(runStepPath, "utf8");
  const lineCount = countLines(raw);
  const delta = lineCount - budget.maxLines;

  console.log(`[run_step_loc_check] phase=${requestedPhase} (${budget.label})`);
  console.log(`[run_step_loc_check] run_step.ts lines=${lineCount}, limit=${budget.maxLines}`);

  if (delta > 0) {
    console.error(`[run_step_loc_check] FAIL: run_step.ts exceeds phase budget by ${delta} lines.`);
    console.error("[run_step_loc_check] Action: move complete subsystem clusters out of run_step.ts before advancing this phase.");
    process.exit(1);
  }

  console.log(`[run_step_loc_check] PASS: ${Math.abs(delta)} lines of headroom remain.`);
}

main();
