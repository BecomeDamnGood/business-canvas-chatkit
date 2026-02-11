import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const uiDir = path.join(repoRoot, "ui");
const distUiDir = path.join(repoRoot, "dist", "ui");
const bundledPath = path.join(uiDir, "step-card.bundled.html");

if (!fs.existsSync(uiDir)) {
  throw new Error(`Missing ui directory: ${uiDir}`);
}
if (!fs.existsSync(bundledPath)) {
  throw new Error(`Missing bundled UI: ${bundledPath}`);
}

fs.mkdirSync(distUiDir, { recursive: true });
fs.cpSync(uiDir, distUiDir, { recursive: true });

const distBundledPath = path.join(distUiDir, "step-card.bundled.html");
if (!fs.existsSync(distBundledPath)) {
  throw new Error(`Failed to copy bundled UI to ${distBundledPath}`);
}

console.log(`[copy-ui-dist] Copied ${uiDir} -> ${distUiDir}`);
