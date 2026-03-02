import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const uiDir = path.join(repoRoot, "ui");
const distUiDir = path.join(repoRoot, "dist", "ui");
const runtimeUiEntries = ["step-card.bundled.html", "assets"];

if (!fs.existsSync(uiDir)) {
  throw new Error(`Missing ui directory: ${uiDir}`);
}
for (const entryName of runtimeUiEntries) {
  const sourcePath = path.join(uiDir, entryName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing runtime UI artifact: ${sourcePath}`);
  }
}

// Delete-first to avoid stale UI ballast surviving incremental builds.
fs.rmSync(distUiDir, { recursive: true, force: true });
fs.mkdirSync(distUiDir, { recursive: true });

for (const entryName of runtimeUiEntries) {
  const sourcePath = path.join(uiDir, entryName);
  const targetPath = path.join(distUiDir, entryName);
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Failed to copy runtime UI artifact to ${targetPath}`);
  }
}

console.log(
  `[copy-ui-dist] Copied runtime UI artifacts (${runtimeUiEntries.join(", ")}) to ${distUiDir}`
);
