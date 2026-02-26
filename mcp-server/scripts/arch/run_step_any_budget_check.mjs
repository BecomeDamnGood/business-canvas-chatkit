#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TARGET_DIR_RELATIVE = "mcp-server/src/handlers";
const RUNTIME_TARGETS_RELATIVE = [
  "mcp-server/src/handlers/run_step_runtime.ts",
  "mcp-server/src/handlers/run_step_runtime_preflight.ts",
  "mcp-server/src/handlers/run_step_runtime_action_routing.ts",
  "mcp-server/src/handlers/run_step_runtime_special_routes.ts",
  "mcp-server/src/handlers/run_step_runtime_post_pipeline.ts",
  "mcp-server/src/handlers/run_step_runtime_finalize.ts",
  "mcp-server/src/handlers/run_step_routes.ts",
  "mcp-server/src/handlers/run_step_pipeline.ts",
];
const DEFAULT_MAX_RUNTIME_ANY = 140;

function runGit(command, options = {}) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function resolveMcpRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..", "..");
}

function resolveRepoRoot(mcpRoot) {
  return path.resolve(mcpRoot, "..");
}

function parseArg(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === `--${name}`) return argv[i + 1] || "";
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return "";
}

function canResolveRef(repoRoot, ref) {
  if (!ref) return false;
  const result = runGit(`git -C "${repoRoot}" rev-parse --verify "${ref}"`);
  return Boolean(result);
}

function resolveBaselineRef(repoRoot) {
  const fromArg = parseArg("baseline-ref");
  if (canResolveRef(repoRoot, fromArg)) return fromArg;

  const fromEnv = process.env.RUN_STEP_ANY_BASELINE_REF || "";
  if (canResolveRef(repoRoot, fromEnv)) return fromEnv;

  const baseBranch = process.env.GITHUB_BASE_REF || "";
  const githubRef = baseBranch ? `origin/${baseBranch}` : "";
  if (canResolveRef(repoRoot, githubRef)) return githubRef;

  if (canResolveRef(repoRoot, "HEAD~1")) return "HEAD~1";
  return "";
}

function listTypeScriptFiles(dirPath) {
  const out = [];
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".ts")) {
        out.push(fullPath);
      }
    }
  }
  return out.sort();
}

function countAnyLines(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((sum, line) => (/\bany\b/.test(line) ? sum + 1 : sum), 0);
}

function countAnyInFiles(filePaths, readFile) {
  return filePaths.reduce((sum, filePath) => sum + countAnyLines(readFile(filePath)), 0);
}

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.trunc(n);
}

function readBaselineTsFiles(repoRoot, baselineRef) {
  if (!baselineRef) return [];
  const listing = runGit(
    `git -C "${repoRoot}" ls-tree -r --name-only "${baselineRef}" -- "${TARGET_DIR_RELATIVE}"`
  );
  if (!listing) return [];
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".ts"))
    .sort();
}

function readBaselineFile(repoRoot, baselineRef, relativePath) {
  return runGit(`git -C "${repoRoot}" show "${baselineRef}:${relativePath}"`, {
    maxBuffer: 10 * 1024 * 1024,
  });
}

function collectAddedAnyLines(repoRoot, baselineRef) {
  if (!baselineRef) return [];
  const diff = runGit(
    `git -C "${repoRoot}" diff --unified=0 --no-color "${baselineRef}" -- "${TARGET_DIR_RELATIVE}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  if (!diff) return [];
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .filter((line) => /\bany\b/.test(line))
    .map((line) => line.slice(1).trim());
}

function main() {
  const mcpRoot = resolveMcpRoot();
  const repoRoot = resolveRepoRoot(mcpRoot);
  const handlersDir = path.join(repoRoot, TARGET_DIR_RELATIVE);
  const runtimeTargets = RUNTIME_TARGETS_RELATIVE.map((relativePath) =>
    path.join(repoRoot, relativePath)
  );

  const maxRuntimeAny = parsePositiveInt(
    process.env.RUN_STEP_RUNTIME_ANY_MAX,
    DEFAULT_MAX_RUNTIME_ANY
  );
  const maxHandlersAnyRaw = process.env.RUN_STEP_HANDLERS_ANY_MAX || "";
  const maxHandlersAny = maxHandlersAnyRaw
    ? parsePositiveInt(maxHandlersAnyRaw, Number.MAX_SAFE_INTEGER)
    : null;

  const baselineRef = resolveBaselineRef(repoRoot);
  const currentFiles = listTypeScriptFiles(handlersDir);
  const currentAny = countAnyInFiles(currentFiles, (filePath) =>
    fs.readFileSync(filePath, "utf8")
  );
  const currentRuntimeAny = countAnyInFiles(runtimeTargets, (filePath) =>
    fs.readFileSync(filePath, "utf8")
  );

  console.log(
    `[run_step_any_budget_check] current handlers any lines=${currentAny} (files=${currentFiles.length})`
  );
  console.log(
    `[run_step_any_budget_check] current runtime/routes/pipeline any lines=${currentRuntimeAny} (limit=${maxRuntimeAny})`
  );

  const failures = [];
  if (currentRuntimeAny > maxRuntimeAny) {
    failures.push(
      `runtime/routes/pipeline any lines ${currentRuntimeAny} exceed limit ${maxRuntimeAny}`
    );
  }

  if (maxHandlersAny !== null && currentAny > maxHandlersAny) {
    failures.push(
      `handlers any lines ${currentAny} exceed configured limit ${maxHandlersAny}`
    );
  }

  if (baselineRef) {
    const baselineFiles = readBaselineTsFiles(repoRoot, baselineRef);
    const baselineAny = countAnyInFiles(baselineFiles, (relativePath) =>
      readBaselineFile(repoRoot, baselineRef, relativePath)
    );
    const addedAnyLines = collectAddedAnyLines(repoRoot, baselineRef);
    console.log(
      `[run_step_any_budget_check] baseline ref=${baselineRef}, baseline handlers any lines=${baselineAny}`
    );
    if (currentAny >= baselineAny) {
      failures.push(
        `handlers any lines must decrease per PR: current=${currentAny}, baseline=${baselineAny}`
      );
    }
    if (addedAnyLines.length > 0) {
      failures.push(`new any usages added in src/handlers: ${addedAnyLines.length}`);
      for (const line of addedAnyLines.slice(0, 10)) {
        console.error(`[run_step_any_budget_check] added_any: ${line}`);
      }
    }
  } else {
    console.log("[run_step_any_budget_check] baseline ref unavailable; skipping per-PR diff checks");
  }

  if (failures.length > 0) {
    console.error("[run_step_any_budget_check] FAIL");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("[run_step_any_budget_check] PASS");
}

main();
