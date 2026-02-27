import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const serverPath = path.join(repoRoot, "mcp-server/server.ts");
const serverSrcDir = path.join(repoRoot, "mcp-server/src/server");
const manifestPath = path.join(repoRoot, "docs/server_refactor_sweep_manifest_2026-02-27.md");
const deleteMapPath = path.join(repoRoot, "docs/server_refactor_delete_map_2026-02-27.md");

function fail(message, extra = []) {
  console.error(`[server_refactor_gate] ${message}`);
  for (const line of extra) console.error(`- ${line}`);
  process.exit(1);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${path.relative(repoRoot, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function rgCount(pattern, targets) {
  try {
    const output = execFileSync("rg", ["-n", pattern, ...targets], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!output) return 0;
    return output.split(/\r?\n/).filter(Boolean).length;
  } catch (err) {
    const stderr = String(err?.stderr ?? "");
    if (/No such file or directory/i.test(stderr) || /code 2/i.test(stderr)) return 0;
    if (err?.status === 1) return 0;
    throw err;
  }
}

function listServerTsFiles() {
  return fs.readdirSync(serverSrcDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join(serverSrcDir, name))
    .sort((a, b) => a.localeCompare(b));
}

function lineCount(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.length === 0) return 0;
  return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

const serverSource = readText(serverPath);
const serverLineCount = serverSource.length === 0
  ? 0
  : serverSource.replace(/\r?\n$/, "").split(/\r?\n/).length;
if (serverLineCount > 1000) {
  fail("server.ts exceeds 1000 lines", [`line_count=${serverLineCount}`]);
}

const requiredModules = [
  "run_step_transport.ts",
  "run_step_transport_context.ts",
  "run_step_transport_idempotency.ts",
  "run_step_transport_stale.ts",
  "run_step_model_result.ts",
  "server_config.ts",
  "ordering_parity.ts",
  "idempotency_registry.ts",
  "observability.ts",
  "http_routes.ts",
  "locale_resolution.ts",
  "mcp_registration.ts",
];

const missingModules = requiredModules
  .map((name) => path.join(serverSrcDir, name))
  .filter((fullPath) => !fs.existsSync(fullPath))
  .map((fullPath) => path.relative(repoRoot, fullPath));

if (missingModules.length > 0) {
  fail("required server modules missing", missingModules);
}

const oversizedServerModules = listServerTsFiles()
  .map((filePath) => ({
    file: path.relative(repoRoot, filePath),
    lines: lineCount(filePath),
  }))
  .filter((entry) => entry.lines > 1000)
  .map((entry) => `${entry.file} line_count=${entry.lines}`);
if (oversizedServerModules.length > 0) {
  fail("one or more src/server modules exceed 1000 lines", oversizedServerModules);
}

readText(manifestPath);
readText(deleteMapPath);

const fallbackHits = rgCount(
  "structured_content_result_fallback|render_source_missing",
  ["mcp-server/server.ts", "mcp-server/src/server"]
);
if (fallbackHits > 0) {
  fail("legacy render-source fallback reason-codes still present", [
    "Remove structured_content_result_fallback and render_source_missing in server transport.",
  ]);
}

const renderSourceFallbackHits = rgCount(
  "render_source:\\s*\\\"structuredContent\\.result\\\"|render_source_reason_code:\\s*\\\"structured_content_result_fallback\\\"",
  ["mcp-server/src/server"]
);
if (renderSourceFallbackHits > 0) {
  fail("structuredContent.result is still used as render authority", [
    "Only _meta.widget_result may be selected as render source.",
  ]);
}

const renderSourceSelectionDefs = rgCount("const renderSource\\s*=", ["mcp-server/src/server"]);
if (renderSourceSelectionDefs !== 1) {
  fail("render-source selection is defined in more than one place", [
    `render_source_definition_count=${renderSourceSelectionDefs}`,
  ]);
}

const uiFallbackAssertionHits = rgCount(
  "resolveWidgetPayload[^\\n]*(root\\.result|structuredContent\\.result)|fallbackRaw",
  ["mcp-server/src/ui_render.test.ts"]
);
if (uiFallbackAssertionHits > 0) {
  fail("ui_render tests still contain legacy fallback-oriented assertions or fixtures", [
    "Remove root.result/structuredContent.result/fallbackRaw fallback assertions from UI tests.",
  ]);
}

const uiPayloadSourceDefinitionHits = rgCount(
  "export\\s+type\\s+PayloadSource\\s*=\\s*\\\"meta\\.widget_result\\\"\\s*\\|\\s*\\\"none\\\";",
  ["mcp-server/ui/lib/locale_bootstrap_runtime.ts"]
);
if (uiPayloadSourceDefinitionHits !== 1) {
  fail("ui payload-source type is not strictly meta.widget_result|none", [
    "Keep PayloadSource narrowed to exactly meta.widget_result | none.",
  ]);
}

const uiLegacyRuntimeFallbackHits = rgCount(
  "root\\.result|structuredContent\\.result|fallbackRaw|structured_content_result_fallback|render_source_missing",
  ["mcp-server/ui/lib/locale_bootstrap_runtime.ts", "mcp-server/ui/step-card.bundled.html"]
);
if (uiLegacyRuntimeFallbackHits > 0) {
  fail("ui runtime artifacts still contain legacy fallback tokens", [
    "Purge root.result/structuredContent.result/fallbackRaw fallback paths from UI runtime source and bundle.",
  ]);
}

console.log("[server_refactor_gate] passed");
console.log(`[server_refactor_gate] server.ts line_count=${serverLineCount}`);
console.log(`[server_refactor_gate] required_modules=${requiredModules.length}`);
