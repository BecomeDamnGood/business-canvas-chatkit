import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const uiLibDir = path.join(repoRoot, "ui", "lib");
const uiBundlePath = path.join(repoRoot, "ui", "step-card.bundled.html");
const distBundlePath = path.join(repoRoot, "dist", "ui", "step-card.bundled.html");
const serverTsPath = path.join(repoRoot, "server.ts");
const distServerJsPath = path.join(repoRoot, "dist", "server.js");
const buildUiScriptPath = path.join(repoRoot, "scripts", "build-ui.mjs");

const issues = [];

function pushIssue(message) {
  issues.push(message);
}

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    pushIssue(`missing file: ${filePath}`);
    return "";
  }
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    pushIssue(`${context} missing marker: ${needle}`);
  }
}

function assertExcludes(haystack, needle, context) {
  if (haystack.includes(needle)) {
    pushIssue(`${context} contains stale marker: ${needle}`);
  }
}

function assertMatchesRegex(haystack, regex, context, message) {
  if (!regex.test(haystack)) {
    pushIssue(`${context} ${message}`);
  }
}

const srcRenderTs = readUtf8(path.join(uiLibDir, "ui_render.ts"));
const srcActionsTs = readUtf8(path.join(uiLibDir, "ui_actions.ts"));
const srcMainTs = readUtf8(path.join(uiLibDir, "main.ts"));
const uiBundle = readUtf8(uiBundlePath);
const distBundle = readUtf8(distBundlePath);
const serverTs = readUtf8(serverTsPath);
const distServerJs = readUtf8(distServerJsPath);
const buildUiScript = readUtf8(buildUiScriptPath);

assertIncludes(srcRenderTs, "const hasExplicitServerRouting =", "ui/lib/ui_render.ts");
assertIncludes(srcRenderTs, "renderBootstrapWaitShell(", "ui/lib/ui_render.ts");
assertIncludes(srcRenderTs, "const hasRenderableInteractiveContent =", "ui/lib/ui_render.ts");
assertExcludes(srcRenderTs, "interactive_fallback_active", "ui/lib/ui_render.ts");

assertIncludes(srcActionsTs, "export function ensureBootstrapRetryForResult(", "ui/lib/ui_actions.ts");
assertExcludes(srcActionsTs, "__locale_wait_retry", "ui/lib/ui_actions.ts");
assertExcludes(srcActionsTs, "interactive_fallback_active", "ui/lib/ui_actions.ts");

assertIncludes(
  srcMainTs,
  "mergeToolOutputWithResponseMetadata(",
  "ui/lib/main.ts"
);
assertIncludes(
  srcMainTs,
  'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });',
  "ui/lib/main.ts"
);
assertIncludes(srcMainTs, "const toolOutputCandidate = params.toolOutput;", "ui/lib/main.ts");
assertExcludes(srcMainTs, "if (hasToolOutput())", "ui/lib/main.ts");

assertIncludes(buildUiScript, 'path.join(uiLibDir, "main.ts")', "scripts/build-ui.mjs");
assertExcludes(buildUiScript, 'path.join(uiLibDir, "main.js")', "scripts/build-ui.mjs");
for (const [label, content] of [
  ["server.ts", serverTs],
  ["dist/server.js", distServerJs],
]) {
  assertMatchesRegex(
    content,
    /registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\],/,
    label,
    "must keep run_step visibility as [\"model\",\"app\"]"
  );
  assertMatchesRegex(
    content,
    /registerTool\(\s*"run_step"[\s\S]*"openai\/outputTemplate":\s*uiResourceUri/,
    label,
    "run_step must own openai/outputTemplate"
  );
  assertExcludes(content, 'registerTool("open_canvas"', label);
  assertIncludes(content, 'model_result_shape_version: "v2_minimal"', label);
  assertIncludes(content, "state: safeState,", label);
  assertExcludes(content, "structuredContent.seed_user_message =", label);
  assertIncludes(content, "resourceUri: uiResourceUri", label);
}

assertExcludes(serverTs, "isMcpAppFirstToolsV1Enabled", "server.ts");
assertExcludes(distServerJs, "isMcpAppFirstToolsV1Enabled", "dist/server.js");

for (const [label, content] of [
  ["ui/step-card.bundled.html", uiBundle],
  ["dist/ui/step-card.bundled.html", distBundle],
]) {
  assertIncludes(content, "mergeToolOutputWithResponseMetadata(", label);
  assertIncludes(content, 'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });', label);
  assertIncludes(content, "const toolOutputCandidate = params.toolOutput;", label);
  assertIncludes(content, ".skeleton-line", label);
  assertIncludes(content, "@keyframes skeletonShimmer", label);
  assertExcludes(content, "interactive_fallback_active", label);
  assertExcludes(content, "waiting_both", label);
  assertExcludes(content, "waiting_state", label);
  assertExcludes(content, "__locale_wait_retry", label);
}

if (uiBundle && distBundle && uiBundle !== distBundle) {
  pushIssue("bundle mismatch: ui/step-card.bundled.html differs from dist/ui/step-card.bundled.html");
}

if (issues.length > 0) {
  console.error("[ui_artifact_parity_check] failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("[ui_artifact_parity_check] passed");
