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

const tsFiles = fs
  .readdirSync(uiLibDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name)
  .sort();

for (const tsName of tsFiles) {
  const jsName = tsName.replace(/\.ts$/, ".js");
  const jsPath = path.join(uiLibDir, jsName);
  if (!fs.existsSync(jsPath)) {
    pushIssue(`missing JS counterpart for ${path.join("ui", "lib", tsName)}`);
  }
}

const srcRenderTs = readUtf8(path.join(uiLibDir, "ui_render.ts"));
const srcRenderJs = readUtf8(path.join(uiLibDir, "ui_render.js"));
const srcActionsTs = readUtf8(path.join(uiLibDir, "ui_actions.ts"));
const srcActionsJs = readUtf8(path.join(uiLibDir, "ui_actions.js"));
const srcMainTs = readUtf8(path.join(uiLibDir, "main.ts"));
const srcMainJs = readUtf8(path.join(uiLibDir, "main.js"));
const uiBundle = readUtf8(uiBundlePath);
const distBundle = readUtf8(distBundlePath);
const serverTs = readUtf8(serverTsPath);
const distServerJs = readUtf8(distServerJsPath);

assertIncludes(
  srcRenderTs,
  'ensureBootstrapRetryForResult(data, { source: "render" });',
  "ui/lib/ui_render.ts"
);
assertIncludes(srcRenderTs, "const bootstrapWaitingLocale =", "ui/lib/ui_render.ts");
assertExcludes(srcRenderTs, "pendingNonEnglishByState", "ui/lib/ui_render.ts");

assertIncludes(srcRenderJs, "ensureBootstrapRetryForResult(data, { source: \"render\" });", "ui/lib/ui_render.js");
assertIncludes(srcRenderJs, "const bootstrapWaitingLocale =", "ui/lib/ui_render.js");
assertExcludes(srcRenderJs, "pendingNonEnglishByState", "ui/lib/ui_render.js");

assertIncludes(srcActionsTs, "export function ensureBootstrapRetryForResult(", "ui/lib/ui_actions.ts");
assertIncludes(srcActionsJs, "export function ensureBootstrapRetryForResult(", "ui/lib/ui_actions.js");
assertExcludes(srcActionsTs, "__locale_wait_retry", "ui/lib/ui_actions.ts");
assertExcludes(srcActionsJs, "__locale_wait_retry", "ui/lib/ui_actions.js");

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
assertIncludes(srcMainTs, 'callRunStep("ACTION_START", { started: "true" });', "ui/lib/main.ts");
assertExcludes(srcMainTs, "if (hasToolOutput())", "ui/lib/main.ts");
assertIncludes(
  srcMainJs,
  "mergeToolOutputWithResponseMetadata(",
  "ui/lib/main.js"
);
assertIncludes(
  srcMainJs,
  'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });',
  "ui/lib/main.js"
);
assertIncludes(srcMainJs, 'callRunStep("ACTION_START", { started: "true" });', "ui/lib/main.js");
assertExcludes(srcMainJs, "if (hasToolOutput())", "ui/lib/main.js");

for (const [label, content] of [
  ["server.ts", serverTs],
  ["dist/server.js", distServerJs],
]) {
  assertMatchesRegex(
    content,
    /registerTool\(\s*"open_canvas"[\s\S]*visibility:\s*\["model",\s*"app"\],[\s\S]*"openai\/outputTemplate":\s*uiResourceUri/,
    label,
    "must keep open_canvas as template owner with model+app visibility"
  );
  assertMatchesRegex(
    content,
    /registerTool\(\s*"run_step"[\s\S]*visibility:\s*\["model",\s*"app"\],/,
    label,
    "must keep run_step visibility as [\"model\",\"app\"] in compat-first mode"
  );
  assertMatchesRegex(
    content,
    /registerTool\(\s*"run_step"(?![\s\S]*"openai\/outputTemplate":\s*uiResourceUri)/,
    label,
    "must not attach openai/outputTemplate to run_step"
  );
  assertIncludes(content, 'model_result_shape_version: "v2_minimal"', label);
  assertIncludes(content, "state: safeState,", label);
  assertExcludes(content, "structuredContent.seed_user_message =", label);
}

assertExcludes(serverTs, "isMcpAppFirstToolsV1Enabled", "server.ts");
assertExcludes(distServerJs, "isMcpAppFirstToolsV1Enabled", "dist/server.js");

for (const [label, content] of [
  ["ui/step-card.bundled.html", uiBundle],
  ["dist/ui/step-card.bundled.html", distBundle],
]) {
  assertIncludes(content, "ensureBootstrapRetryForResult(data, { source: \"render\" });", label);
  assertIncludes(content, "mergeToolOutputWithResponseMetadata(", label);
  assertIncludes(content, 'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });', label);
  assertIncludes(content, ".skeleton-line", label);
  assertIncludes(content, "@keyframes skeletonShimmer", label);
  assertExcludes(content, "pendingNonEnglishByState", label);
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
