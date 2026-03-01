import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const uiDir = path.join(repoRoot, "ui");
const distUiDir = path.join(repoRoot, "dist", "ui");
const runtimeUiFiles = ["step-card.bundled.html"];

if (!fs.existsSync(uiDir)) {
  throw new Error(`Missing ui directory: ${uiDir}`);
}
for (const fileName of runtimeUiFiles) {
  const sourcePath = path.join(uiDir, fileName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing runtime UI artifact: ${sourcePath}`);
  }
}

// Delete-first to avoid stale UI ballast surviving incremental builds.
fs.rmSync(distUiDir, { recursive: true, force: true });
fs.mkdirSync(distUiDir, { recursive: true });

for (const fileName of runtimeUiFiles) {
  const sourcePath = path.join(uiDir, fileName);
  const targetPath = path.join(distUiDir, fileName);
  fs.copyFileSync(sourcePath, targetPath);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Failed to copy runtime UI artifact to ${targetPath}`);
  }
}

console.log(
  `[copy-ui-dist] Copied runtime UI artifacts (${runtimeUiFiles.join(", ")}) to ${distUiDir}`
);
