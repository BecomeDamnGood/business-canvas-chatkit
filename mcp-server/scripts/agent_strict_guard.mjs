import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mcpRoot = path.join(repoRoot, "mcp-server");

function fail(message, extra = []) {
  console.error(`[agent_strict_guard] ${message}`);
  for (const line of extra) console.error(`- ${line}`);
  process.exit(1);
}

function runOrFail(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, {
      cwd,
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch (error) {
    const rendered = [cmd, ...args].join(" ");
    fail(`command failed: ${rendered}`);
  }
}

function rgLines(pattern, targets) {
  try {
    const output = execFileSync("rg", ["-n", pattern, ...targets], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!output) return [];
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error?.status === 1) return [];
    const stderr = String(error?.stderr ?? "");
    fail("rg invocation failed", [stderr || String(error)]);
  }
}

function collectProductionTsFiles() {
  const files = [];
  files.push(path.join(repoRoot, "mcp-server/server.ts"));

  function walk(baseDir) {
    if (!fs.existsSync(baseDir)) return;
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      const fullPath = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      files.push(fullPath);
    }
  }

  walk(path.join(repoRoot, "mcp-server/src"));
  return files;
}

function lineCount(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (!content) return 0;
  return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

console.log("[agent_strict_guard] start");

runOrFail("npm", ["run", "typecheck"], mcpRoot);
runOrFail("npm", ["run", "gate:server-refactor"], mcpRoot);

const productionFiles = collectProductionTsFiles();
const oversized = productionFiles
  .map((filePath) => ({
    file: path.relative(repoRoot, filePath),
    lines: lineCount(filePath),
  }))
  .filter((entry) => entry.lines > 1000)
  .sort((a, b) => b.lines - a.lines);

if (oversized.length > 0) {
  fail("production TypeScript files exceed 1000 lines", oversized.map((entry) => `${entry.lines} ${entry.file}`));
}

const legacyFallbackTokenA = ["structured", "content", "result", "fallback"].join("_");
const legacyFallbackTokenB = ["render", "source", "missing"].join("_");
const legacyFallbackTokenC = ["structuredContent", "result"].join("\\.");
const fallbackPattern = `${legacyFallbackTokenA}|${legacyFallbackTokenB}|${legacyFallbackTokenC}`;

const fallbackHits = rgLines(fallbackPattern, ["mcp-server/server.ts", "mcp-server/src/server", "mcp-server/src"]);
if (fallbackHits.length > 0) {
  fail("legacy render fallback tokens still present in server scope", fallbackHits.slice(0, 30));
}

const renderSourceHits = rgLines(
  "render_source|meta\\.widget_result|widget_result",
  ["mcp-server/server.ts", "mcp-server/src/server"]
);
if (renderSourceHits.length === 0) {
  fail("render-source telemetry or SSOT markers missing", [
    "Expected meta.widget_result/render_source markers not found in server scope.",
  ]);
}

console.log(`[agent_strict_guard] passed`);
console.log(`[agent_strict_guard] production_ts_checked=${productionFiles.length}`);
