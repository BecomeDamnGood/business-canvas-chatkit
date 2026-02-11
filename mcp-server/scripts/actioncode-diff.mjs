import fs from "fs";
import path from "path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listFiles(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, ext));
    } else if (!ext || full.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function extractActionCodes(text) {
  const matches = text.match(/ACTION_[A-Z0-9_]+/g) || [];
  return new Set(matches);
}

function extractBackendRoutes(text) {
  const routes = new Map();
  const re = /actionCode\s*===\s*"(ACTION_[A-Z0-9_]+)"\)\s*return\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

function extractStepRoutes(text) {
  const routes = new Map();
  const re = /(ACTION_[A-Z0-9_]+)[^\n]*?(?:→|->|=>)[^A-Z0-9_]*(__ROUTE__[A-Z0-9_]+__|yes)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

function mergeMaps(maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [k, v] of m.entries()) {
      if (!out.has(k)) out.set(k, v);
    }
  }
  return out;
}

function toSortedArray(setOrArray) {
  return Array.from(setOrArray).sort();
}

const uiFiles = [path.join(repoRoot, "mcp-server/ui/step-card.html")];
const backendFiles = [path.join(repoRoot, "mcp-server/src/handlers/run_step.ts")];
const stepsFiles = listFiles(path.join(repoRoot, "mcp-server/src/steps"), ".ts");
const docsFiles = [
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "docs/button-contract.md"),
  ...listFiles(path.join(repoRoot, "mcp-server/docs"), ".md"),
];
const distFiles = listFiles(path.join(repoRoot, "mcp-server/dist"), ".js");

const uiCodes = new Set();
const backendCodes = new Set();
const stepsCodes = new Set();
const docsCodes = new Set();
const distCodes = new Set();

for (const f of uiFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) uiCodes.add(c);
  }
}

for (const f of backendFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) backendCodes.add(c);
  }
}

for (const f of stepsFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) stepsCodes.add(c);
  }
}

for (const f of docsFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) docsCodes.add(c);
  }
}

for (const f of distFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) distCodes.add(c);
  }
}

const allCodes = new Set([
  ...uiCodes,
  ...backendCodes,
  ...stepsCodes,
  ...docsCodes,
  ...distCodes,
]);

const uiOnly = toSortedArray([...uiCodes].filter((c) => !backendCodes.has(c) && !stepsCodes.has(c) && !docsCodes.has(c)));
const backendOnly = toSortedArray([...backendCodes].filter((c) => !uiCodes.has(c) && !stepsCodes.has(c) && !docsCodes.has(c)));
const stepsOnly = toSortedArray([...stepsCodes].filter((c) => !uiCodes.has(c) && !backendCodes.has(c) && !docsCodes.has(c)));
const docsOnly = toSortedArray([...docsCodes].filter((c) => !uiCodes.has(c) && !backendCodes.has(c) && !stepsCodes.has(c)));

const backendRouteMaps = backendFiles.map((f) => (fs.existsSync(f) ? extractBackendRoutes(readFile(f)) : new Map()));
const stepsRouteMaps = stepsFiles.map((f) => (fs.existsSync(f) ? extractStepRoutes(readFile(f)) : new Map()));
const backendRoutes = mergeMaps(backendRouteMaps);
const stepsRoutes = mergeMaps(stepsRouteMaps);

const routeMismatch = [];
for (const code of allCodes) {
  const backendRoute = backendRoutes.get(code);
  const stepsRoute = stepsRoutes.get(code);
  if (backendRoute && stepsRoute && backendRoute !== stepsRoute) {
    routeMismatch.push({ code, backend: backendRoute, steps: stepsRoute });
  }
}
routeMismatch.sort((a, b) => a.code.localeCompare(b.code));

const srcUnion = new Set([...uiCodes, ...backendCodes, ...stepsCodes, ...docsCodes]);
const distOnly = toSortedArray([...distCodes].filter((c) => !srcUnion.has(c)));
const srcOnly = toSortedArray([...srcUnion].filter((c) => !distCodes.has(c)));

const report = {
  generated_at: new Date().toISOString(),
  sources: {
    ui: uiFiles.map((p) => path.relative(repoRoot, p)),
    backend: backendFiles.map((p) => path.relative(repoRoot, p)),
    steps: stepsFiles.map((p) => path.relative(repoRoot, p)).sort(),
    docs: docsFiles.map((p) => path.relative(repoRoot, p)).sort(),
    dist: distFiles.map((p) => path.relative(repoRoot, p)).sort(),
  },
  codes: {
    ui: toSortedArray(uiCodes),
    backend: toSortedArray(backendCodes),
    steps: toSortedArray(stepsCodes),
    docs: toSortedArray(docsCodes),
    dist: toSortedArray(distCodes),
  },
  buckets: {
    ui_only: uiOnly,
    backend_only: backendOnly,
    steps_only: stepsOnly,
    docs_only: docsOnly,
  },
  route_mismatch: routeMismatch,
  dist_drift: {
    dist_only: distOnly,
    src_only: srcOnly,
  },
};

const outPath = path.join(repoRoot, "docs/actioncode-diff.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
