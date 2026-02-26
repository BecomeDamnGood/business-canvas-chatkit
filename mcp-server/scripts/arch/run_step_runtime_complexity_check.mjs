#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PHASE_ORDER = ["phase_R0", "phase_R1", "phase_R2", "phase_R3", "phase_R4"];
const PHASE_BUDGETS = Object.freeze({
  phase_R0: { maxAnyTokens: 370 },
  phase_R1: { maxAnyTokens: 300 },
  phase_R2: { maxAnyTokens: 220 },
  phase_R3: { maxAnyTokens: 140 },
  phase_R4: { maxAnyTokens: 74 },
  stretch: { maxAnyTokens: 74 },
});

function readRequestedPhase() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--phase") return argv[i + 1] || "";
    if (argv[i].startsWith("--phase=")) return argv[i].slice("--phase=".length);
  }
  return process.env.RUN_STEP_RUNTIME_COMPLEXITY_PHASE || process.env.RUN_STEP_RUNTIME_ARCH_PHASE || "phase_R0";
}

function resolveTargetPaths() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return [
    path.join(mcpServerRoot, "src", "handlers", "run_step_runtime.ts"),
    path.join(mcpServerRoot, "src", "handlers", "run_step_routes.ts"),
    path.join(mcpServerRoot, "src", "handlers", "run_step_pipeline.ts"),
  ];
}

function countLinesWithAny(raw) {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  return lines.reduce((sum, line) => (/\bany\b/.test(line) ? sum + 1 : sum), 0);
}

function assertBudgetOrder() {
  for (let i = 1; i < PHASE_ORDER.length; i += 1) {
    const prev = PHASE_BUDGETS[PHASE_ORDER[i - 1]].maxAnyTokens;
    const cur = PHASE_BUDGETS[PHASE_ORDER[i]].maxAnyTokens;
    if (cur > prev) {
      throw new Error(`Invalid runtime complexity phase ordering: ${PHASE_ORDER[i]} (${cur}) > ${PHASE_ORDER[i - 1]} (${prev})`);
    }
  }
}

function main() {
  assertBudgetOrder();
  const phase = readRequestedPhase();
  const budget = PHASE_BUDGETS[phase];
  if (!budget) {
    console.error(`[run_step_runtime_complexity_check] unknown phase "${phase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const targetPaths = resolveTargetPaths();
  const missing = targetPaths.filter((targetPath) => !fs.existsSync(targetPath));
  if (missing.length > 0) {
    for (const targetPath of missing) {
      console.error(`[run_step_runtime_complexity_check] missing file: ${targetPath}`);
    }
    process.exit(1);
  }

  const fileMetrics = targetPaths.map((targetPath) => {
    const source = fs.readFileSync(targetPath, "utf8");
    return {
      file: path.basename(targetPath),
      anyTokens: countLinesWithAny(source),
    };
  });

  const totalAnyTokens = fileMetrics.reduce((sum, entry) => sum + entry.anyTokens, 0);

  console.log(`[run_step_runtime_complexity_check] phase=${phase}`);
  for (const metric of fileMetrics) {
    console.log(`[run_step_runtime_complexity_check] ${metric.file}: any_tokens=${metric.anyTokens}`);
  }
  console.log(`[run_step_runtime_complexity_check] aggregate_any_tokens=${totalAnyTokens}, limit=${budget.maxAnyTokens}`);

  if (totalAnyTokens > budget.maxAnyTokens) {
    console.error("[run_step_runtime_complexity_check] FAIL");
    console.error(`- budget: aggregate any token count ${totalAnyTokens} > ${budget.maxAnyTokens}`);
    console.error("[run_step_runtime_complexity_check] Action: eliminate broad any surfaces in runtime/routes/pipeline before advancing phase.");
    process.exit(1);
  }

  console.log("[run_step_runtime_complexity_check] PASS");
}

main();
